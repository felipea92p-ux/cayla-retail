#!/usr/bin/env node
/**
 * Pruebas del candado «un conteo sin prendas no se cierra» (ADR-0172, migración
 * `20260923120000_conteo_vacio_no_se_cierra.sql`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que la regla viva EN LA BASE y no solo en el botón gris de la pantalla:
 *   · `cerrar_conteo` sobre un conteo abierto SIN prendas se rechaza (P0001, hint `conteo_vacio`, mensaje que dice
 *     qué hacer) y el conteo sigue ABIERTO, sin un solo movimiento nuevo;
 *   · ese mismo conteo se puede cancelar con `anular_conteo` (la salida que se ofrece);
 *   · con al menos una prenda contada, `cerrar_conteo` cierra como siempre y ajusta el stock;
 *   · los rechazos de antes van primero: un conteo ya cerrado sigue diciendo «Ese conteo ya está cerrado»;
 *   · la migración se puede pegar dos veces: el bloque queda UNA sola vez en la función.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs`: cada escenario corre en su propia transacción con
 * ROLLBACK (nunca se commitea nada), como Felipe (líder) con `set local request.jwt.claim.sub`. Antes de abrir el
 * conteo de prueba se anula, con la RPC real, cualquier conteo que otra sesión haya dejado abierto en Trujillo (solo
 * puede haber uno abierto por ubicación; el ROLLBACK lo revive).
 *
 * `--en-seco`: carga la migración DENTRO de cada escenario, sin aplicarla a la base compartida.
 *
 * USO
 *   pnpm pruebas:conteo-vacio            → migración ya aplicada en el local
 *   pnpm pruebas:conteo-vacio --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260923120000_conteo_vacio_no_se_cierra.sql"), "utf8");
const PRELUDIO = EN_SECO ? SQL_MIGRACION : "";

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

/**
 * `pg_temp.intento(sql)`: ejecuta la sentencia en un sub-bloque y devuelve «SQLSTATE|hint|mensaje», o «SIN_ERROR».
 * Un error dentro del sub-bloque no aborta la transacción: después se verifica que la base quedó intacta.
 */
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

const comoFelipe = (sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${FELIPE}';
${INTENTO}
${sql}
rollback;
`;

/**
 * La escena: Tienda Trujillo con su piso de venta, la variante del seed, y un conteo NUEVO abierto en el piso, sin
 * prendas. Deja `:trujillo`, `:sub_piso`, `:var`, `:conteo`, `:movs0` (movimientos de ajuste por conteo antes).
 */
const CONTEO_VACIO = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' \\gset
select id as var from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select (select count(*) from (select retail.anular_conteo(id) from retail.conteos where ubicacion_id = :'trujillo' and estado = 'abierto') x) as _anulo_previo \\gset
select retail.abrir_conteo(p_ubicacion_id => :'trujillo', p_sububicacion_id => :'sub_piso') as conteo \\gset
select count(*) as movs0 from retail.movimientos where motivo = 'conteo' \\gset
`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, sql, esperado });

exito(
  "conteo sin prendas: cerrar se rechaza con P0001 · hint conteo_vacio · «no se cierra … cancélalo», y el conteo sigue abierto sin movimientos",
  comoFelipe(`${CONTEO_VACIO}
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L)', :'conteo')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  (split_part(:'r', '|', 3) like 'Este conteo no tiene ninguna prenda contada: no se cierra.%cancélalo.'),
  (select estado from retail.conteos where id = :'conteo'),
  (select count(*) from retail.movimientos where motivo = 'conteo') = :movs0;`),
  ["P0001", "conteo_vacio", "t", "abierto", "t"]
);

exito(
  "ese mismo conteo vacío se cancela con anular_conteo (la salida que se ofrece)",
  comoFelipe(`${CONTEO_VACIO}
select retail.anular_conteo(:'conteo');
select estado from retail.conteos where id = :'conteo';`),
  ["anulado"]
);

exito(
  "con una prenda contada, cerrar funciona como siempre: cerrado y un ajuste por conteo",
  comoFelipe(`${CONTEO_VACIO}
select coalesce(sum(cantidad), 0) + 1 as mas_uno from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
select retail.conteo_contar(:'conteo', :'var', :mas_uno);
select lineas_ajustadas from retail.cerrar_conteo(:'conteo') \\gset
select (select estado from retail.conteos where id = :'conteo'), :lineas_ajustadas,
  (select count(*) from retail.movimientos where motivo = 'conteo') - :movs0;`),
  ["cerrado", "1", "1"]
);

exito(
  "los rechazos de antes van primero: un conteo ya cerrado sigue diciendo «Ese conteo ya está cerrado»",
  comoFelipe(`${CONTEO_VACIO}
select coalesce(sum(cantidad), 0) as igual from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
select retail.conteo_contar(:'conteo', :'var', :igual);
select 1 from retail.cerrar_conteo(:'conteo');
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L)', :'conteo')) as r \\gset
select split_part(:'r', '|', 3);`),
  ["Ese conteo ya está cerrado"]
);

exito(
  "la migración se puede pegar dos veces: el candado queda UNA sola vez en cerrar_conteo",
  comoFelipe(`${SQL_MIGRACION}
${SQL_MIGRACION}
select (length(d) - length(replace(d, 'conteo_vacio_no_se_cierra', ''))) / length('conteo_vacio_no_se_cierra')
  from (select pg_get_functiondef('retail.cerrar_conteo(uuid)'::regprocedure) as d) x;`),
  ["1"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: la migración se carga dentro de cada escenario (no se aplica a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      continue;
    }
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

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
