/**
 * Prueba del directorio de proveedores de PRODUCCIÓN — ADR-0133, F4a (decisión D-H).
 * Migración 20260920110000: `proveedores_produccion`, `guardar_proveedor_produccion`,
 * `cambiar_estado_proveedor_produccion`, `fn_proveedores_produccion`,
 * `fn_proveedor_produccion_metricas` y el repuntado de `insumos`/`insumo_lotes`.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido):
 *   1. El líder crea un proveedor y RUC, CCI y celular se guardan normalizados.
 *   2. Quien no es líder no puede crear ni archivar.
 *   3. Nombre repetido (sin importar mayúsculas ni tildes) y RUC repetido se rechazan diciendo con quién chocan.
 *   4. RUC, CCI, rubro y billetera incoherente se rechazan con mensaje claro.
 *   5. Actualizar reemplaza completo (lo que llega en NULL se vacía) y no choca consigo mismo.
 *   6. Archivar y reactivar; el proveedor nunca se borra.
 *   7. Un colaborador NO ve la tabla ni la lista (RLS de verdad, con `role authenticated`) ni escribe directo.
 *   8. La lista y la ficha suman lotes y total comprado del proveedor.
 *   9. Un lote no acepta un proveedor del directorio de COMPRAS: los directorios no se mezclan.
 *
 * USO
 *   pnpm pruebas:proveedores-produccion   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const COMO = (uid) => `begin;\nset local request.jwt.claim.sub = '${uid}';\n`;
const CAMBIA_A = (uid) => `set local request.jwt.claim.sub = '${uid}';\n`;
const AUTENTICADO = "set local role authenticated;\n";

// Un proveedor mínimo válido; `extra` agrega argumentos con nombre.
const CREAR = (nombre, extra = "") => `select retail.guardar_proveedor_produccion(null, '${nombre}', 'tela'${extra ? `, ${extra}` : ""})`;

const CASOS = [
  {
    nombre: "1. el líder crea un proveedor y RUC, CCI y celular quedan normalizados",
    tipo: "exito",
    sql: `${COMO(FELIPE)}
select ${CREAR("Textiles Prueba SAC", "p_ruc => '20-123456 789'").replace("select ", "")} as pid \\gset
select retail.guardar_proveedor_produccion(:'pid', 'Textiles Prueba SAC', 'tela', '20123456789', null, null, 30, 'transferencia', 'BCP', null, '002-193 0012 3456 7890 12', '+51 987 654 321', array['Yape'], 'Textiles Prueba SAC') as _u \\gset
select ruc, cci, celular_billetera, billeteras::text, plazo_credito_dias, activo from retail.proveedores_produccion where id = :'pid';
rollback;`,
    verificar: (c) => c[0] === "20123456789" && c[1] === "00219300123456789012" && c[2] === "987654321" && c[3] === "{yape}" && Number(c[4]) === 30 && c[5] === "t",
  },
  {
    nombre: "2. quien no es líder no puede crear",
    tipo: "error",
    contiene: "Solo un Líder",
    sql: `${COMO(MICAELA)}
${CREAR("Intruso SAC")};
rollback;`,
  },
  {
    nombre: "2b. quien no es líder no puede archivar",
    tipo: "error",
    contiene: "Solo un Líder",
    sql: `${COMO(FELIPE)}
select ${CREAR("Para Archivar SAC").replace("select ", "")} as pid \\gset
${CAMBIA_A(MICAELA)}
select retail.cambiar_estado_proveedor_produccion(:'pid', false);
rollback;`,
  },
  {
    nombre: "3. un nombre repetido (otra mayúscula, otra tilde) se rechaza diciendo con quién choca",
    tipo: "error",
    contiene: 'Ya existe un proveedor llamado "Hilos Ñandú SAC"',
    sql: `${COMO(FELIPE)}
${CREAR("Hilos Ñandú SAC")} as _a \\gset
${CREAR("hilos nandu sac")};
rollback;`,
  },
  {
    nombre: "3b. un RUC repetido se rechaza diciendo con quién choca",
    tipo: "error",
    contiene: 'Ese RUC ya está registrado como "Primero SAC"',
    sql: `${COMO(FELIPE)}
${CREAR("Primero SAC", "p_ruc => '20999888777'")} as _a \\gset
${CREAR("Segundo SAC", "p_ruc => '20999888777'")};
rollback;`,
  },
  {
    nombre: "4a. un RUC de 10 dígitos se rechaza",
    tipo: "error",
    contiene: "RUC tiene que ser de 11 dígitos",
    sql: `${COMO(FELIPE)}
${CREAR("Mal Ruc SAC", "p_ruc => '1234567890'")};
rollback;`,
  },
  {
    nombre: "4b. un CCI que no tiene 20 dígitos se rechaza",
    tipo: "error",
    contiene: "CCI tiene que ser de 20 dígitos",
    sql: `${COMO(FELIPE)}
${CREAR("Mal Cci SAC", "p_cci => '123'")};
rollback;`,
  },
  {
    nombre: "4c. un rubro que no existe se rechaza",
    tipo: "error",
    contiene: "tela, avíos, maquila u otro",
    sql: `${COMO(FELIPE)}
select retail.guardar_proveedor_produccion(null, 'Rubro Raro SAC', 'zapatos');
rollback;`,
  },
  {
    nombre: "4d. un celular de billetera sin decir Yape o Plin se rechaza",
    tipo: "error",
    contiene: "Yape, Plin o ambos",
    sql: `${COMO(FELIPE)}
${CREAR("Sin App SAC", "p_celular_billetera => '987654321'")};
rollback;`,
  },
  {
    nombre: "5. actualizar reemplaza completo (NULL vacía) y no choca consigo mismo",
    tipo: "exito",
    sql: `${COMO(FELIPE)}
select ${CREAR("Mismo Nombre SAC", "p_contacto => 'Rosa', p_telefono => '987654321', p_plazo_credito_dias => 15").replace("select ", "")} as pid \\gset
select retail.guardar_proveedor_produccion(:'pid', 'Mismo Nombre SAC', 'avios') as _u \\gset
select rubro, contacto is null, telefono is null, plazo_credito_dias is null from retail.proveedores_produccion where id = :'pid';
rollback;`,
    verificar: (c) => c[0] === "avios" && c[1] === "t" && c[2] === "t" && c[3] === "t",
  },
  {
    nombre: "6. archivar y reactivar: el proveedor nunca se borra",
    tipo: "exito",
    sql: `${COMO(FELIPE)}
select ${CREAR("Ciclo SAC").replace("select ", "")} as pid \\gset
select retail.cambiar_estado_proveedor_produccion(:'pid', false) as _a \\gset
select activo as archivado from retail.proveedores_produccion where id = :'pid' \\gset
select retail.cambiar_estado_proveedor_produccion(:'pid', true) as _b \\gset
select :'archivado', (select activo from retail.proveedores_produccion where id = :'pid'), (select count(*) from retail.proveedores_produccion where id = :'pid');
rollback;`,
    verificar: (c) => c[0] === "f" && c[1] === "t" && Number(c[2]) === 1,
  },
  {
    nombre: "7a. un colaborador no ve la tabla ni la lista (RLS real)",
    tipo: "exito",
    sql: `${COMO(FELIPE)}
${CREAR("Secreto SAC", "p_cci => '00219300123456789012'")} as _a \\gset
${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select count(*) from retail.proveedores_produccion), (select count(*) from retail.fn_proveedores_produccion());
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 0,
  },
  {
    nombre: "7b. nadie escribe directo en la tabla: solo por las RPC",
    tipo: "error",
    contiene: "permission denied",
    sql: `${COMO(FELIPE)}
${AUTENTICADO}
insert into retail.proveedores_produccion (nombre, rubro) values ('Directo SAC', 'tela');
rollback;`,
  },
  {
    nombre: "8. la lista y la ficha suman lotes y total comprado del proveedor",
    tipo: "exito",
    sql: `${COMO(FELIPE)}
select ${CREAR("Lino Andino SAC").replace("select ", "")} as pid \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-PRV-LINO', 'Lino de prueba', 'tela', 'metro') returning id as ins \\gset
select retail.recibir_insumo(:'ins', :'taller', 100, 2000, 'PRV-A', :'pid') as _l1 \\gset
select retail.recibir_insumo(:'ins', :'taller', 50, 1000, 'PRV-B', :'pid') as _l2 \\gset
select l.lotes, l.total_comprado, (select lotes from retail.fn_proveedor_produccion_metricas(:'pid')), (select total_comprado from retail.fn_proveedor_produccion_metricas(:'pid'))
  from retail.fn_proveedores_produccion() l where l.id = :'pid';
rollback;`,
    verificar: (c) => Number(c[0]) === 2 && Number(c[1]) === 3000 && Number(c[2]) === 2 && Number(c[3]) === 3000,
  },
  {
    nombre: "9. un lote no acepta un proveedor del directorio de Compras",
    tipo: "error",
    contiene: "violates foreign key constraint",
    sql: `${COMO(FELIPE)}
select id as compras_prov from retail.proveedores limit 1 \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-PRV-X', 'Prueba', 'tela', 'metro') returning id as ins \\gset
select retail.recibir_insumo(:'ins', :'taller', 10, 100, 'PRV-X', :'compras_prov');
rollback;`,
  },
];

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK");
      const columnas = filas[filas.length - 1].split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
