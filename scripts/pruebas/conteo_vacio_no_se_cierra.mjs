#!/usr/bin/env node
/**
 * Pruebas del candado «un conteo sin nada verificado no se cierra» (ADR-0174, migración
 * `20260923120000_conteo_vacio_no_se_cierra.sql`; desde el rediseño de Conteo lo cumple `cerrar_conteo` de
 * `20260930010100_conteo_rediseno_funciones.sql`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que la regla viva EN LA BASE y no solo en el botón gris de la pantalla:
 *   · `cerrar_conteo` sobre un conteo abierto SIN NINGUNA VARIANTE VERIFICADA se rechaza (P0001, hint `conteo_vacio`,
 *     mensaje que dice qué hacer) y el conteo sigue ABIERTO, sin un solo movimiento nuevo. Desde el rediseño el conteo
 *     nace con una línea pendiente por cada variante con stock (la foto), así que «vacío» ya no es «sin filas» sino
 *     «sin filas verificadas»: una pendiente no cuenta como contada;
 *   · ese mismo conteo se puede cancelar con `anular_conteo` (la salida que se ofrece);
 *   · con al menos una variante verificada (y el resto cerrado como conteo PARCIAL), `cerrar_conteo` cierra y ajusta el
 *     stock; sin cierre parcial, las pendientes lo frenan (`conteo_pendientes`);
 *   · los rechazos de antes van primero: un conteo ya cerrado sigue diciendo «Ese conteo ya está cerrado»;
 *   · ADR-0189 (20260924120000): recontar renueva el «debe haber» (`cantidad_sistema`), y una venta entre el conteo y el
 *     cierre no descuadra el ajuste (contado − debe haber se aplica sobre el stock actual);
 *   · la marca del candado queda UNA sola vez en `cerrar_conteo` aunque se vuelvan a pegar las migraciones viejas:
 *     20260924120000 dos veces no cambia nada, y 20260923120000 ya no se puede pegar (busca `cerrar_conteo(uuid)`,
 *     que el rediseño eliminó): aborta sin tocar nada en vez de duplicar el bloque.
 * El detalle del rediseño (foto, reconteo, confirmación, caso P, controles) vive en `conteo_rediseno.mjs`.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs`: cada escenario corre en su propia transacción con
 * ROLLBACK (nunca se commitea nada), como Felipe (líder) con `set local request.jwt.claim.sub`. Antes de abrir el
 * conteo de prueba se anula, con la RPC real, cualquier conteo que otra sesión haya dejado abierto en Trujillo (solo
 * puede haber uno abierto por ubicación; el ROLLBACK lo revive).
 *
 * `--en-seco`: carga las migraciones del rediseño DENTRO de cada escenario, sin aplicarlas a la base compartida.
 *
 * USO
 *   pnpm pruebas:conteo-vacio            → migraciones ya aplicadas en el local
 *   pnpm pruebas:conteo-vacio --en-seco  → las carga en cada escenario, sin aplicarlas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede

const EN_SECO = process.argv.includes("--en-seco");
const leer = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
const SQL_REDISENO = `${leer("20260930010000_conteo_rediseno_columnas.sql")}\n${leer("20260930010100_conteo_rediseno_funciones.sql")}`;
const SQL_ADR_0189 = leer("20260924120000_concurrencia_cambios_devoluciones_conteo.sql");
const SQL_CONTEO_VACIO_VIEJA = leer("20260923120000_conteo_vacio_no_se_cierra.sql");
const PRELUDIO = EN_SECO ? SQL_REDISENO : "";

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

/** Tienda Trujillo con su piso de venta, la variante del seed, y sin ningún conteo abierto. Deja `:trujillo`, `:sub_piso`, `:var`. */
const TRUJILLO = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' \\gset
select id as var from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select (select count(*) from (select retail.anular_conteo(id) from retail.conteos where ubicacion_id = :'trujillo' and estado = 'abierto') x) as _anulo_previo \\gset
`;

/** Abre un conteo NUEVO en el piso: con la foto de lo que Trujillo tenga en el piso, todo pendiente. Deja `:conteo` y `:movs0`. */
const ABRIR = `
select retail.abrir_conteo(p_ubicacion_id => :'trujillo', p_sububicacion_id => :'sub_piso') as conteo \\gset
select count(*) as movs0 from retail.movimientos where motivo = 'conteo' \\gset
`;

/** La escena: un conteo NUEVO abierto en el piso, con nada verificado. */
const CONTEO_VACIO = `${TRUJILLO}${ABRIR}`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, sql, esperado });

exito(
  "conteo sin nada verificado: cerrar se rechaza con P0001 · hint conteo_vacio · «no se cierra … cancélalo», y el conteo sigue abierto sin movimientos",
  comoFelipe(`${CONTEO_VACIO}
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L)', :'conteo')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2),
  (split_part(:'r', '|', 3) like 'Este conteo no tiene ninguna variante verificada: no se cierra.%cancélalo.'),
  (select estado from retail.conteos where id = :'conteo'),
  (select count(*) from retail.movimientos where motivo = 'conteo') = :movs0;`),
  ["P0001", "conteo_vacio", "t", "abierto", "t"]
);

exito(
  "ni siquiera con cierre parcial: sin nada verificado sigue siendo conteo_vacio (una pendiente no es una variante contada)",
  comoFelipe(`${CONTEO_VACIO}
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L, true)', :'conteo')) as r \\gset
select split_part(:'r', '|', 1), split_part(:'r', '|', 2), (select estado from retail.conteos where id = :'conteo');`),
  ["P0001", "conteo_vacio", "abierto"]
);

exito(
  "ese mismo conteo vacío se cancela con anular_conteo (la salida que se ofrece)",
  comoFelipe(`${CONTEO_VACIO}
select retail.anular_conteo(:'conteo');
select estado from retail.conteos where id = :'conteo';`),
  ["anulado"]
);

exito(
  "con una variante verificada, cerrar funciona: cerrado como conteo parcial y un ajuste por conteo",
  comoFelipe(`${CONTEO_VACIO}
select coalesce(sum(cantidad), 0) + 1 as mas_uno from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
select retail.conteo_contar(:'conteo', :'var', :mas_uno);
select retail.conteo_confirmar_diferencia(:'conteo', :'var');
select lineas_ajustadas from retail.cerrar_conteo(:'conteo', true) \\gset
select (select estado from retail.conteos where id = :'conteo'), :lineas_ajustadas,
  (select count(*) from retail.movimientos where motivo = 'conteo') - :movs0;`),
  ["cerrado", "1", "1"]
);

exito(
  "con pendientes, cerrar exige el cierre parcial explícito (conteo_pendientes); con él cierra y deja la pendiente sin tocar",
  comoFelipe(`${TRUJILLO}
-- Una segunda prenda con stock en el piso: al abrir queda pendiente (la foto trae todo lo que hay).
select id as var2 from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'var2', :'trujillo', :'sub_piso', 'entrada', 2, 'prueba: prenda pendiente') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2') as _m \\gset
${ABRIR}
select coalesce(sum(cantidad), 0) as igual from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
select retail.conteo_contar(:'conteo', :'var', :igual);
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L)', :'conteo')) as r \\gset
select lineas_pendientes as pendientes from retail.cerrar_conteo(:'conteo', true) \\gset
select split_part(:'r', '|', 2), (select estado from retail.conteos where id = :'conteo'), :pendientes >= 1,
  (select cantidad_contada is null and diferencia is null from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'var2');`),
  ["conteo_pendientes", "cerrado", "t", "t"]
);

exito(
  "los rechazos de antes van primero: un conteo ya cerrado sigue diciendo «Ese conteo ya está cerrado»",
  comoFelipe(`${CONTEO_VACIO}
select coalesce(sum(cantidad), 0) as igual from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
select retail.conteo_contar(:'conteo', :'var', :igual);
select 1 from retail.cerrar_conteo(:'conteo', true);
select pg_temp.intento(format('select * from retail.cerrar_conteo(%L, true)', :'conteo')) as r \\gset
select split_part(:'r', '|', 3);`),
  ["Ese conteo ya está cerrado"]
);

// ---------------------------------------------------------------------------
// ADR-0189 (20260924120000): recontar renueva el «debe haber» (`cantidad_sistema`), y el cierre ajusta contado − debe
// haber sobre el stock ACTUAL. «Venta» = una salida de stock entre la lectura y el cierre (lo mismo que mueve
// registrar_venta). Deja `:stock0` = stock del piso antes (con colchón de 10 para poder vender 2).
// El colchón entra DESPUÉS de abrir el conteo: la variante no está en la foto y se cuenta como inesperada, a propósito
// (es el camino que más se parece a una prenda que aparece).
// ---------------------------------------------------------------------------
const CON_STOCK = `${CONTEO_VACIO}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'var', :'trujillo', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov_colchon \\gset
select retail.fn_aplicar_movimiento(:'mov_colchon') as _c \\gset
select coalesce(sum(cantidad), 0) as stock0 from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso' \\gset
`;
const VENDER_2 = `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'var', :'trujillo', :'sub_piso', 'salida', 2, 'prueba: venta entre foto y cierre') returning id as mov_venta \\gset
select retail.fn_aplicar_movimiento(:'mov_venta') as _v \\gset
`;
const STOCK_FINAL = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'var' and ubicacion_id = :'trujillo' and sububicacion_id = :'sub_piso')`;

exito(
  "recuento después de una venta: el cierre deja lo recontado, no lo recontado − lo vendido (ADR-0189)",
  comoFelipe(`${CON_STOCK}
select retail.conteo_contar(:'conteo', :'var', :stock0);
${VENDER_2}
select retail.conteo_contar(:'conteo', :'var', :stock0 - 2);
select 1 from retail.cerrar_conteo(:'conteo', true);
select ${STOCK_FINAL} = :stock0 - 2,
  (select cantidad_sistema = :stock0 - 2 from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'var');`),
  ["t", "t"]
);

exito(
  "venta entre el conteo y el cierre, sin recontar: el ajuste (contado − debe haber) se suma a lo que queda (ADR-0189)",
  comoFelipe(`${CON_STOCK}
select retail.conteo_contar(:'conteo', :'var', :stock0 + 1);
select retail.conteo_confirmar_diferencia(:'conteo', :'var');
${VENDER_2}
select 1 from retail.cerrar_conteo(:'conteo', true);
select ${STOCK_FINAL} = :stock0 - 2 + 1;`),
  ["t"]
);

// ---------------------------------------------------------------------------
// Las migraciones viejas que parcharon estas funciones se re-pegan en CI (ver `concurrencia_linea_de_venta.mjs`).
// ---------------------------------------------------------------------------
const MARCA = (firma, marca) =>
  `(select (length(d) - length(replace(d, '${marca}', ''))) / length('${marca}') from (select pg_get_functiondef('${firma}'::regprocedure) as d) x)`;

exito(
  "re-pegar 20260924120000 dos veces no cambia nada: la marca del candado queda UNA sola vez en cerrar_conteo",
  comoFelipe(`${SQL_ADR_0189}
${SQL_ADR_0189}
select ${MARCA("retail.cerrar_conteo(uuid,boolean)", "conteo_vacio_no_se_cierra")};`),
  ["1"]
);

exito(
  "re-pegar 20260923120000 ya no es posible (cerrar_conteo(uuid) se eliminó): aborta con «no existe la función», sin tocar nada; la marca sigue UNA vez",
  comoFelipe(`select pg_temp.intento($m$${SQL_CONTEO_VACIO_VIEJA}$m$) as r \\gset
select split_part(:'r', '|', 1), ${MARCA("retail.cerrar_conteo(uuid,boolean)", "conteo_vacio_no_se_cierra")};`),
  ["42883", "1"]
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: las migraciones del rediseño se cargan dentro de cada escenario (no se aplican a la base).\n");

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
