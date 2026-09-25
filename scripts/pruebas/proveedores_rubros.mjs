#!/usr/bin/env node
/**
 * Pruebas de «varios rubros por proveedor» (ADR-0211) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un proveedor pueda tener todos los rubros que vende SIN poder quedar en un estado imposible:
 *   · `registrar_proveedor` y `actualizar_proveedor` reciben la lista y la limpian (espacios, vacíos, NULL y
 *     repetidos sin tildes ni mayúsculas fuera), conservando el orden en que se eligieron;
 *   · mandar la lista vacía o nada deja al proveedor sin rubro (`{}`), nunca NULL;
 *   · el CHECK de la tabla rechaza por su cuenta una lista sucia o repetida, y NOT NULL rechaza el NULL;
 *   · `fn_proveedores()` devuelve la lista; cada función tiene UNA sola firma (sin la vieja de `p_rubro text`);
 *   · el proveedor que nace desde Gastos lleva `{Gastos}`, como antes;
 *   · la migración se puede pegar dos veces sin tocar lo ya guardado.
 *
 * CÓMO. Mismo patrón que `proveedores_cuentas_pago.mjs`: cada escenario corre en su propia transacción con
 * ROLLBACK, nunca se commitea nada; simula a Felipe (líder) con `set local request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:proveedores-rubros   → con la migración 20260926100000 ya aplicada en el local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260926100000_proveedores_varios_rubros.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Una transacción con la sesión del líder. Termina sin COMMIT. */
const como = (authUserId, sql) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
rollback;
`;

const nombre = (n) => `'Rubros prueba ${n} ' || gen_random_uuid()`;
const registrar = (n, rubros) => `select retail.registrar_proveedor(p_nombre => ${nombre(n)}, p_rubros => ${rubros}) as prov \\gset\n`;
const VER = `select array_to_string(rubros, ',', '∅'), cardinality(rubros) from retail.proveedores where id = :'prov';`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Registrar y editar: la lista se guarda limpia
// ===========================================================================

exito(
  "registrar con varios rubros: se guardan todos, en el orden en que se eligieron",
  como(FELIPE, `${registrar(1, `array['Polos', 'Casacas', 'Jeans']`)}${VER}`),
  ["Polos,Casacas,Jeans", "3"]
);

exito(
  "registrar con repetidos, espacios, vacíos y NULL: queda uno de cada uno, recortado (gana el primero)",
  como(FELIPE, `${registrar(2, `array['  Camisas   y Blusas ', 'polos', 'Pólos ', '', '   ', null, 'camisas y blusas']`)}${VER}`),
  ["Camisas y Blusas,polos", "2"]
);

exito(
  "registrar sin rubros (nada): queda {} y no NULL",
  como(FELIPE, `select retail.registrar_proveedor(p_nombre => ${nombre(3)}) as prov \\gset\n${VER}`),
  ["", "0"]
);

exito(
  "editar reemplaza la lista entera (no suma)",
  como(
    FELIPE,
    `${registrar(4, `array['Polos', 'Casacas']`)}select retail.actualizar_proveedor(p_proveedor_id => :'prov', p_nombre => 'Rubros prueba 4 editado', p_rubros => array['Vestidos', 'Faldas']);\n${VER}`
  ),
  ["Vestidos,Faldas", "2"]
);

exito(
  "editar con la lista vacía deja al proveedor sin rubro",
  como(
    FELIPE,
    `${registrar(5, `array['Polos']`)}select retail.actualizar_proveedor(p_proveedor_id => :'prov', p_nombre => 'Rubros prueba 5 editado', p_rubros => '{}'::text[]);\n${VER}`
  ),
  ["", "0"]
);

exito(
  "editar sin mandar rubros también lo deja sin rubro (el formulario manda siempre la lista completa)",
  como(
    FELIPE,
    `${registrar(6, `array['Polos']`)}select retail.actualizar_proveedor(p_proveedor_id => :'prov', p_nombre => 'Rubros prueba 6 editado');\n${VER}`
  ),
  ["", "0"]
);

exito(
  "fn_proveedores() devuelve la lista del proveedor",
  como(FELIPE, `${registrar(7, `array['Polos', 'Chompas']`)}select array_to_string(f.rubros, ',') from retail.fn_proveedores() f where f.id = :'prov';`),
  ["Polos,Chompas"]
);

exito(
  "el proveedor que nace desde Gastos lleva el rubro «Gastos»",
  como(FELIPE, `select retail.registrar_proveedor_de_gasto(${nombre(8)}) as prov \\gset\n${VER}`),
  ["Gastos", "1"]
);

// ===========================================================================
// 2. La tabla se defiende sola (sin pasar por las funciones)
// ===========================================================================

error(
  "CHECK: un rubro repetido (sin tildes ni mayúsculas) no entra",
  como(FELIPE, `insert into retail.proveedores (nombre, rubros) values (${nombre(9)}, array['Polos', 'pólos']);`),
  "proveedores_rubros_limpios"
);
error(
  "CHECK: un rubro vacío no entra",
  como(FELIPE, `insert into retail.proveedores (nombre, rubros) values (${nombre(10)}, array['Polos', '']);`),
  "proveedores_rubros_limpios"
);
error(
  "CHECK: un rubro con espacios sobrantes no entra",
  como(FELIPE, `insert into retail.proveedores (nombre, rubros) values (${nombre(11)}, array[' Polos']);`),
  "proveedores_rubros_limpios"
);
error(
  "NOT NULL: «sin rubro» se escribe {} y nunca NULL",
  como(FELIPE, `insert into retail.proveedores (nombre, rubros) values (${nombre(12)}, null);`),
  "rubros"
);

// ===========================================================================
// 3. Una sola firma, sin la columna vieja, y la migración se puede repetir
// ===========================================================================

exito(
  "una sola firma de registrar/actualizar_proveedor, las dos con p_rubros text[]",
  como(
    FELIPE,
    `select count(*) filter (where p.proname = 'registrar_proveedor'), count(*) filter (where p.proname = 'actualizar_proveedor'),
            bool_and(pg_get_function_identity_arguments(p.oid) like '%p_rubros text[]%')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'retail' and p.proname in ('registrar_proveedor', 'actualizar_proveedor');`
  ),
  ["1", "1", "t"]
);

exito(
  "la columna vieja `rubro` ya no existe",
  como(FELIPE, `select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'proveedores' and column_name = 'rubro';`),
  ["0"]
);

exito(
  "pegar la migración otra vez no toca lo guardado",
  `begin;
set local request.jwt.claim.sub = '${FELIPE}';
${registrar(13, `array['Polos', 'Casacas']`)}reset request.jwt.claim.sub;
${MIGRACION}
${VER}
rollback;
`,
  ["Polos,Casacas", "2"]
);

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
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
