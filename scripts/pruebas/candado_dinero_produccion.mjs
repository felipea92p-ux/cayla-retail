/**
 * Prueba del candado del dinero de PRODUCCIÓN — ADR-0133, F4e (D-G).
 * Migraciones 20260921150000 (parte A: `fn_costos_insumos_taller`, `fn_costos_producciones`) y 20260921151000
 * (parte B: SELECT por columna sin las de dinero, y `v_insumo_saldos` cerrada).
 *
 * Qué garantiza (cada caso termina en ROLLBACK, sin rastro en el Postgres local compartido). «Colaborador del Taller» = Micaela
 * reasignada al Taller solo dentro de la transacción; se prueba con `set local role authenticated` para que el permiso de columna aplique
 * de verdad (como superusuario no aplicaría):
 *   1. Un colaborador del Taller NO puede leer `costo_unitario` de lotes ni de movimientos, ni los 4 costos de una orden, ni con `select *`.
 *   2. Lo que SÍ necesita sigue legible: cantidades, lotes, códigos, fechas, estados de la orden y sus líneas.
 *   3. Recibir, descontar, devolver, abrir y cerrar órdenes siguen funcionando para ese colaborador (las funciones `security definer` leen los costos).
 *   4. El líder tampoco lee esas columnas directo, pero SÍ las recibe por las dos funciones; el colaborador recibe cero filas de ellas.
 *   5. La vista `v_insumo_saldos` (trae `valor` de todas las ubicaciones) está cerrada a cualquier sesión.
 *   6. Guardia: toda columna de esas tres tablas que NO es de dinero es legible por `authenticated` (si una migración futura agrega una y
 *      olvida darle SELECT, esta prueba lo avisa).
 *   7. Las migraciones se pueden volver a pegar sin romper nada.
 *
 * USO
 *   pnpm pruebas:candado-dinero-produccion   → necesita el stack local (`npx supabase start`) con las dos migraciones aplicadas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

const CAMBIA_A = (uid) => `set local request.jwt.claim.sub = '${uid}';\n`;
const AUTENTICADO = "set local role authenticated;\n";
const MICAELA_AL_TALLER = `update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');\n`;

/** Un Taller con: proveedor, insumo con un lote de 100 m a S/ 20 y una orden con un consumo de 30 m. */
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where tipo = 'taller' and activo limit 1 \\gset
select id as v1, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-CDP-LINO', 'Lino de prueba', 'tela', 'metro') returning id as ins \\gset
select retail.recibir_insumo(:'ins', :'taller', 100, 2000, 'L-A') as _l \\gset
select retail.abrir_produccion(:'taller', :'prod', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10))) as ord \\gset
select retail.registrar_consumo_insumo(:'ord', :'ins', 30) as _c \\gset
`;

const DINERO = {
  insumo_lotes: ["costo_unitario"],
  movimientos_insumo: ["costo_unitario"],
  producciones: ["costo_tela", "costo_avios", "costo_maquila", "costo_unitario"],
};

const CASOS = [
  ...Object.entries(DINERO).flatMap(([tabla, cols]) =>
    cols.map((col) => ({
      nombre: `1. un colaborador del Taller NO lee ${tabla}.${col}`,
      tipo: "error",
      contiene: "permission denied",
      sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}select ${col} from retail.${tabla} limit 1;\nrollback;`,
    }))
  ),
  ...Object.keys(DINERO).map((tabla) => ({
    nombre: `1b. ni con «select *» en ${tabla}`,
    tipo: "error",
    contiene: "permission denied",
    sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}select * from retail.${tabla} limit 1;\nrollback;`,
  })),
  {
    nombre: "2. lo que necesita para trabajar sigue legible: lotes, movimientos, orden y sus líneas",
    tipo: "exito",
    sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select cantidad_ingresada from retail.insumo_lotes where insumo_id = :'ins'),
       (select count(*) from retail.movimientos_insumo where insumo_id = :'ins'),
       (select estado from retail.producciones where id = :'ord'),
       (select cantidad_plan from retail.producciones where id = :'ord'),
       (select count(*) from retail.produccion_lineas where produccion_id = :'ord'),
       (select codigo_lote from retail.insumo_lotes where insumo_id = :'ins');
rollback;`,
    verificar: (c) => Number(c[0]) === 100 && Number(c[1]) === 2 && c[2] === "en_proceso" && Number(c[3]) === 10 && Number(c[4]) === 1 && c[5] === "L-A",
  },
  {
    nombre: "3a. un colaborador del Taller puede descontar y devolver insumos (las funciones leen el costo por él)",
    tipo: "exito",
    sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select retail.registrar_consumo_insumo(:'ord', :'ins', 10) as _c2 \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 15) as _d \\gset
select (select coalesce(sum(case when tipo in ('compra','devolucion') then cantidad else -cantidad end), 0) from retail.movimientos_insumo where insumo_id = :'ins');
rollback;`,
    verificar: (c) => Number(c[0]) === 75,
  },
  {
    nombre: "3b. un colaborador del Taller puede abrir, avanzar y cerrar una orden",
    tipo: "exito",
    sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select retail.abrir_produccion(:'taller', :'prod', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 5))) as ord2 \\gset
select retail.cerrar_produccion(:'ord2', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 5)), null, null, null) as _cierre \\gset
select estado, cantidad_buenas from retail.producciones where id = :'ord2';
rollback;`,
    verificar: (c) => c[0] === "terminada" && Number(c[1]) === 5,
  },
  {
    nombre: "3c. un colaborador del Taller puede recibir contra un comprobante (F4d)",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.guardar_proveedor_produccion(null, 'Textiles Prueba SAC', 'tela') as prov \\gset
select retail.registrar_comprobante_produccion(:'prov', 'F001', '700', 'credito', jsonb_build_array(jsonb_build_object('insumo_id', :'ins', 'cantidad', 50, 'costo_unitario', 22)), p_fecha_vencimiento => current_date + 30) as cid \\gset
select id as it from retail.comprobantes_produccion_items where comprobante_id = :'cid' \\gset
${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select retail.recibir_comprobante_produccion(:'cid', :'taller', jsonb_build_array(jsonb_build_object('item_id', :'it', 'cantidad', 50))) as _r \\gset
select count(*), sum(cantidad_ingresada) from retail.insumo_lotes where insumo_id = :'ins';
rollback;`,
    verificar: (c) => Number(c[0]) === 2 && Number(c[1]) === 150,
  },
  {
    nombre: "4a. el líder, directo, tampoco lee las columnas de dinero (solo por las funciones)",
    tipo: "error",
    contiene: "permission denied",
    sql: `${PREPARAR}${AUTENTICADO}select costo_tela from retail.producciones limit 1;\nrollback;`,
  },
  {
    nombre: "4b. el líder SÍ recibe los costos por las dos funciones, y coinciden con lo guardado",
    tipo: "exito",
    sql: `${PREPARAR}${AUTENTICADO}
select (select costo_unitario from retail.fn_costos_insumos_taller(:'taller') where lote_id = (select id from retail.insumo_lotes where insumo_id = :'ins')),
       (select costo_tela from retail.fn_costos_producciones(:'taller') where produccion_id = :'ord'),
       (select count(*) from retail.fn_costos_producciones(:'taller'));
rollback;`,
    // 100 m a S/ 2000 → 20 por metro; 30 m consumidos → tela de la orden S/ 600.
    verificar: (c) => Number(c[0]) === 20 && Number(c[1]) === 600 && Number(c[2]) >= 1,
  },
  {
    nombre: "4c. un colaborador del Taller recibe CERO filas de las dos funciones de costos",
    tipo: "exito",
    sql: `${PREPARAR}${MICAELA_AL_TALLER}${CAMBIA_A(MICAELA)}${AUTENTICADO}
select (select count(*) from retail.fn_costos_insumos_taller(:'taller')), (select count(*) from retail.fn_costos_producciones(:'taller'));
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 0,
  },
  {
    nombre: "5a. la vista v_insumo_saldos está cerrada a cualquier sesión (trae dinero de todas las ubicaciones)",
    tipo: "error",
    contiene: "permission denied",
    sql: `${PREPARAR}${AUTENTICADO}select * from retail.v_insumo_saldos limit 1;\nrollback;`,
  },
  {
    nombre: "6. guardia: toda columna que no es de dinero es legible por authenticated en las tres tablas",
    tipo: "exito",
    sql: `select count(*) filter (where not has_column_privilege('authenticated', format('retail.%I', c.table_name), c.column_name, 'select')),
       count(*) filter (where has_column_privilege('authenticated', format('retail.%I', c.table_name), c.column_name, 'select') and c.column_name in ('costo_unitario', 'costo_tela', 'costo_avios', 'costo_maquila')),
       count(*)
from information_schema.columns c
where c.table_schema = 'retail' and c.table_name in ('insumo_lotes', 'movimientos_insumo', 'producciones')
  and c.column_name not in ('costo_unitario', 'costo_tela', 'costo_avios', 'costo_maquila');`,
    // Ninguna columna sin dinero queda cerrada (primera cifra = 0) y hay columnas revisadas (tercera > 0).
    verificar: (c) => Number(c[0]) === 0 && Number(c[2]) > 0,
  },
  {
    nombre: "6b. guardia: ninguna columna de dinero es legible por authenticated",
    tipo: "exito",
    sql: `select count(*) from information_schema.columns c
where c.table_schema = 'retail'
  and ((c.table_name in ('insumo_lotes', 'movimientos_insumo') and c.column_name = 'costo_unitario')
    or (c.table_name = 'producciones' and c.column_name in ('costo_tela', 'costo_avios', 'costo_maquila', 'costo_unitario')))
  and has_column_privilege('authenticated', format('retail.%I', c.table_name), c.column_name, 'select');`,
    verificar: (c) => Number(c[0]) === 0,
  },
  {
    nombre: "7. las dos migraciones se pueden volver a pegar sin romper nada",
    tipo: "exito",
    sql: `${readFileSync(join(RAIZ, "supabase", "migrations", "20260921150000_candado_dinero_produccion_lectura_operativa.sql"), "utf8")}
${readFileSync(join(RAIZ, "supabase", "migrations", "20260921151000_candado_dinero_produccion_columnas.sql"), "utf8")}
select count(*) from information_schema.columns c where c.table_schema = 'retail' and c.table_name = 'producciones' and c.column_name = 'estado' and has_column_privilege('authenticated', 'retail.producciones', 'estado', 'select');`,
    verificar: (c) => Number(c[0]) === 1,
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
