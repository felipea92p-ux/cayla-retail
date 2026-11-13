#!/usr/bin/env node
/**
 * El presupuesto de rendimiento (ADR-0656, cambiar-de-modulo#14): cuántos BLOQUES lee cada función con la que entra un módulo.
 *
 * EL PROBLEMA. Ninguna prueba del CI medía rendimiento. ADR-0622 encontró 6 funciones de más de 8 s que llegaron a producción sin que
 * nada avisara, y una sesión puede volver correlativa a `fn_mis_modulos` sin querer: el PR sale verde y cada página carga 30 ms más.
 *
 * QUÉ MIDE. Sobre un volumen chico, fijo y con forma de verdad (`presupuesto-volumen.sql`: 3 tiendas, 12.000 variantes, ~3.000 ventas,
 * cargado en una transacción que se deshace), cada función de `MEDIDAS` se llama una vez para calentar y dos veces con
 * `explain (analyze, buffers)`, como la cuenta que la llama de verdad. Se queda con los bloques de 8 kB que tocó (de memoria o de disco,
 * más los de tablas temporales), el menor de las dos. Bloques y no milisegundos: los bloques no dependen de la máquina ni de lo
 * ocupada que esté, y una consulta que pierde su índice o se vuelve correlativa lee muchos más. Los milisegundos se muestran, no frenan.
 *
 * QUÉ FRENA. Una función que lee más del 25 % sobre su presupuesto (y al menos 20 bloques más: por debajo es ruido de una función
 * chica), una que falla, una sin presupuesto o un presupuesto de una función que ya no se mide. Una que lee mucho MENOS no frena:
 * avisa para que se acepte el número nuevo y la mejora quede protegida.
 *
 * DÓNDE. En el CI, en una tanda de `scripts/ci/pruebas-postgres.mjs` (su base es limpia: migraciones + semilla). En local la base es
 * compartida y suele tener productos de otras sesiones: si los tiene, la comparación se informa y no frena, y aceptar desde ella se
 * niega salvo con `--forzar`. El presupuesto bueno sale del CI: `--aceptar --desde-ci <id de la corrida>` lo lee de su registro.
 *
 * USO
 *   pnpm pruebas:presupuesto-rendimiento                    → mide y compara con presupuesto.json
 *   pnpm rendimiento:aceptar                                → mide y reescribe presupuesto.json (después de entender por qué cambió)
 *   pnpm rendimiento:aceptar -- --desde-ci <id>             → toma las medidas de una corrida del CI (`gh run list`)
 *   RETAIL_CONTENEDOR_PG=<otra pila> pnpm pruebas:presupuesto-rendimiento
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const PRESUPUESTO = join(AQUI, "presupuesto.json");
const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";

/** Cuánto más puede leer una función sobre su presupuesto antes de frenar el PR, y el mínimo absoluto que cuenta. */
export const TOLERANCIA = 0.25;
export const HOLGURA_MINIMA = 20;
/** La semilla trae una decena de productos; con más de esto, la base local tiene datos de otras sesiones. */
const PRODUCTOS_DE_UNA_BASE_LIMPIA = 40;

const QUIEN = {
  lider: "22222222-2222-4222-8222-000000000001", // Felipe: líder y Admin (semilla)
  colaboradora: "22222222-2222-4222-8222-000000000003", // Micaela: colaboradora de Tienda Trujillo (semilla)
};
const TRUJILLO = "(select id from retail.ubicaciones where nombre = 'Tienda Trujillo')";

/**
 * Lo que se mide: las seis funciones del marco (`apps/web/lib/persona-actual.ts`, en cada render del servidor), como líder y como
 * colaboradora, y la función con que entra cada módulo pesado, como el líder (que ve todo). `sql` se arma con `format` ANTES de medir,
 * para que lo medido sea solo la llamada.
 */
export const MEDIDAS = [
  ...["lider", "colaboradora"].flatMap((quien) => [
    { clave: `fn_persona_actual_resumen@${quien}`, quien, sql: "'select * from retail.fn_persona_actual_resumen()'" },
    { clave: `fn_mi_terminal@${quien}`, quien, sql: "'select retail.fn_mi_terminal()'" },
    { clave: `fn_mis_modulos@${quien}`, quien, sql: "'select * from retail.fn_mis_modulos()'" },
    { clave: `fn_mi_persona_id@${quien}`, quien, sql: "'select retail.fn_mi_persona_id()'" },
    { clave: `fn_es_admin@${quien}`, quien, sql: "'select retail.fn_es_admin()'" },
    { clave: `fn_mi_pantalla_principal@${quien}`, quien, sql: "'select retail.fn_mi_pantalla_principal()'" },
  ]),
  // Catálogo ▸ Productos: los conteos de los filtros y la primera página, sin filtros (como se entra).
  { clave: "fn_productos_facetas@lider", quien: "lider", sql: "'select retail.fn_productos_facetas()'" },
  { clave: "fn_productos_listado@lider", quien: "lider", sql: "'select * from retail.fn_productos_listado(p_pagina => 1, p_por_pagina => 20)'" },
  // Inventario: el plan del piso y el ritmo de venta de los últimos 30 días de una tienda.
  { clave: "fn_piso_plan_lectura@lider", quien: "lider", sql: `format('select retail.fn_piso_plan_lectura(%L)', ${TRUJILLO})` },
  {
    clave: "fn_resumen_variantes_json@lider",
    quien: "lider",
    sql: `format('select retail.fn_resumen_variantes_json(%L, %L, %L)', ${TRUJILLO}, retail.fn_hoy_lima() - 29, retail.fn_hoy_lima())`,
  },
  // Existencias, Traslados: el stock de todas las sedes en un solo jsonb.
  { clave: "fn_stock_por_sede_json@lider", quien: "lider", sql: "'select retail.fn_stock_por_sede_json()'" },
  // Finanzas ▸ Resumen, todas las tiendas.
  { clave: "fn_resumen_finanzas@lider", quien: "lider", sql: "'select retail.fn_resumen_finanzas(null, false)'" },
];

// `pg_temp.bloques(sql)`: calienta (catálogo y planes en memoria), mide dos veces y devuelve «bloques|ms» del menor, o «error|mensaje».
const PRELUDIO = `
create function pg_temp.bloques(p_sql text) returns text language plpgsql as $f$
declare
  v_plan jsonb;
  v_n bigint;
  v_min bigint;
  v_ms numeric;
begin
  execute p_sql;
  for k in 1..2 loop
    execute 'explain (analyze, buffers, format json) ' || p_sql into v_plan;
    v_n := coalesce((v_plan -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0)
         + coalesce((v_plan -> 0 -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0)
         + coalesce((v_plan -> 0 -> 'Plan' ->> 'Local Hit Blocks')::bigint, 0)
         + coalesce((v_plan -> 0 -> 'Plan' ->> 'Local Read Blocks')::bigint, 0)
         + coalesce((v_plan -> 0 -> 'Plan' ->> 'Temp Read Blocks')::bigint, 0)
         + coalesce((v_plan -> 0 -> 'Plan' ->> 'Temp Written Blocks')::bigint, 0);
    if v_min is null or v_n < v_min then
      v_min := v_n;
      v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    end if;
  end loop;
  return v_min || '|' || round(v_ms);
exception when others then
  return 'error|' || replace(sqlerrm, E'\\n', ' ');
end $f$;
grant execute on function pg_temp.bloques(text) to authenticated;
`;

const comoCuenta = (id) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claim.role = 'authenticated';\n`;
const comoNadie = "reset role;\nreset request.jwt.claim.sub;\nreset request.jwt.claim.role;\n";

/** El script entero: una transacción que carga el volumen, mide y se deshace. Cada medida deja una línea «clave|bloques|ms». */
export function armarScript(volumen, medidas = MEDIDAS) {
  const lineas = medidas.map((m) => `${comoCuenta(QUIEN[m.quien])}select '${m.clave}|' || pg_temp.bloques(${m.sql});\n${comoNadie}`);
  return [
    "begin;",
    PRELUDIO,
    `select 'base|' || count(*) from retail.productos;`,
    volumen,
    "reset search_path;",
    ...lineas,
    "rollback;",
    "",
  ].join("\n");
}

/** Las líneas de la salida → `{ productos, medidas: { clave: { bloques, ms } | { error } } }`. */
export function leerSalida(salida) {
  const medidas = {};
  let productos = null;
  for (const linea of salida.split("\n")) {
    const [clave, a, b] = linea.trim().split("|");
    if (clave === "base") productos = Number(a);
    else if (a === "error") medidas[clave] = { error: linea.split("|").slice(2).join("|") };
    else if (clave && /^\d+$/.test(a ?? "")) medidas[clave] = { bloques: Number(a), ms: Number(b) };
  }
  return { productos, medidas };
}

/**
 * Compara lo medido con el presupuesto. Devuelve una fila por clave (medida o presupuestada) con su veredicto:
 * `ok`, `bajo` (leyó mucho menos: aceptar), `excede`, `error`, `sin-presupuesto` o `sobra` (presupuesto de algo que ya no se mide).
 */
export function comparar(medidas, presupuesto, claves = MEDIDAS.map((m) => m.clave)) {
  const filas = [];
  for (const clave of claves) {
    const m = medidas[clave];
    const tope = presupuesto[clave];
    if (!m) filas.push({ clave, veredicto: "error", detalle: "no se midió (¿la base cortó antes?)" });
    else if (m.error) filas.push({ clave, veredicto: "error", detalle: m.error });
    else if (tope === undefined) filas.push({ clave, veredicto: "sin-presupuesto", bloques: m.bloques, ms: m.ms });
    else {
      const limite = Math.max(tope * (1 + TOLERANCIA), tope + HOLGURA_MINIMA);
      const veredicto = m.bloques > limite ? "excede" : m.bloques < tope * (1 - TOLERANCIA) && tope - m.bloques > HOLGURA_MINIMA ? "bajo" : "ok";
      filas.push({ clave, veredicto, bloques: m.bloques, ms: m.ms, tope });
    }
  }
  for (const clave of Object.keys(presupuesto)) {
    if (!claves.includes(clave)) filas.push({ clave, veredicto: "sobra", tope: presupuesto[clave] });
  }
  return filas;
}

const FRENA = new Set(["excede", "error", "sin-presupuesto", "sobra"]);

function leerPresupuesto() {
  return JSON.parse(readFileSync(PRESUPUESTO, "utf8")).bloques ?? {};
}

function escribirPresupuesto(bloques, origen) {
  const ordenado = Object.fromEntries(Object.entries(bloques).sort(([a], [b]) => a.localeCompare(b)));
  const json = {
    _: "ADR-0656. Bloques de 8 kB que lee cada función de entrada de módulo sobre el volumen de presupuesto-volumen.sql. No se edita a mano: pnpm rendimiento:aceptar.",
    origen,
    bloques: ordenado,
  };
  writeFileSync(PRESUPUESTO, `${JSON.stringify(json, null, 2)}\n`);
}

/**
 * Antes de medir, `vacuum` de toda la base (fuera de la transacción: no se puede dentro; 0,35 s en local). Un ROLLBACK no borra las
 * filas que insertó: quedan muertas hasta el próximo vacuum, y la medida las leería también. Medido el 2026-11-13 en local: tres
 * corridas seguidas sin vacuum daban 145 mil, 208 mil y 230 mil bloques para la misma función; y `fn_mis_modulos`, que no toca el
 * volumen, iba de 78 a 118 por las filas muertas que otras pruebas dejan en `rol_modulos`. En el CI pasa igual: las pruebas de la
 * misma tanda que corrieron antes dejan filas muertas, y cuáles son cambia con el reparto.
 */
function psqlAdmin(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

function medir() {
  const volumen = readFileSync(join(AQUI, "presupuesto-volumen.sql"), "utf8");
  psqlAdmin("vacuum;\n");
  return leerSalida(psqlAdmin(armarScript(volumen)));
}

const ICONO = { ok: "✓", bajo: "↓", excede: "✗", error: "✗", "sin-presupuesto": "✗", sobra: "✗" };

function informar(filas) {
  for (const f of filas) {
    const cifras = f.bloques !== undefined ? `${f.bloques} bloques${f.tope !== undefined ? ` (presupuesto ${f.tope})` : ""} · ${f.ms} ms` : `presupuesto ${f.tope}`;
    console.log(`${ICONO[f.veredicto]} ${f.clave}: ${f.detalle ?? cifras}${f.veredicto === "ok" ? "" : ` → ${f.veredicto}`}`);
    // `--desde-ci` lee estas líneas del registro de la corrida.
    if (f.bloques !== undefined) console.log(`📦 ${f.clave} ${f.bloques}`);
  }
}

function aceptarDesdeCi(id) {
  const log = execFileSync("gh", ["run", "view", id, "--log"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 });
  const bloques = {};
  for (const [, clave, n] of log.matchAll(/📦 (\S+) (\d+)/g)) bloques[clave] = Number(n);
  const faltan = MEDIDAS.map((m) => m.clave).filter((c) => !(c in bloques));
  if (faltan.length) throw new Error(`La corrida ${id} no trae ${faltan.join(", ")}: ¿corrió el presupuesto en esa versión?`);
  escribirPresupuesto(Object.fromEntries(MEDIDAS.map((m) => [m.clave, bloques[m.clave]])), `CI, corrida ${id}`);
  console.log(`✓ Presupuesto reescrito desde la corrida ${id} del CI (${MEDIDAS.length} funciones).`);
}

function main() {
  const args = process.argv.slice(2);
  const enCi = process.env.GITHUB_ACTIONS === "true";
  if (args.includes("--aceptar") && args.includes("--desde-ci")) return aceptarDesdeCi(args[args.indexOf("--desde-ci") + 1]);

  const { productos, medidas } = medir();
  const sucia = !enCi && productos > PRODUCTOS_DE_UNA_BASE_LIMPIA;
  if (sucia) {
    console.log(
      `⚠ La base local tiene ${productos} productos (la semilla trae una decena): son de otras sesiones y las funciones del catálogo leen más.\n` +
        "  Aquí la comparación informa y no frena; el CI, con su base limpia, sí frena.\n",
    );
  }

  if (args.includes("--aceptar")) {
    const errores = Object.entries(medidas).filter(([, m]) => m.error);
    if (errores.length) throw new Error(`No se acepta un presupuesto con errores: ${errores.map(([c, m]) => `${c} (${m.error})`).join("; ")}`);
    if (sucia && !args.includes("--forzar")) {
      throw new Error("Con la base local sucia no se acepta: usa `--desde-ci <id>` con una corrida del CI, o `--forzar` si sabes lo que haces.");
    }
    escribirPresupuesto(Object.fromEntries(Object.entries(medidas).map(([c, m]) => [c, m.bloques])), enCi ? "CI" : `local${sucia ? " (base con datos de otras sesiones)" : ""}`);
    console.log(`✓ Presupuesto reescrito (${Object.keys(medidas).length} funciones). Revisa el diff antes de commitear.`);
    return;
  }

  const filas = comparar(medidas, leerPresupuesto());
  informar(filas);
  const frenan = filas.filter((f) => FRENA.has(f.veredicto));
  const bajan = filas.filter((f) => f.veredicto === "bajo");
  if (bajan.length) console.log(`\n↓ ${bajan.length} función(es) leen mucho menos que su presupuesto: acéptalo para que la mejora quede protegida (pnpm rendimiento:aceptar).`);
  if (frenan.length === 0) return console.log(`\n✓ Las ${MEDIDAS.length} funciones están dentro de su presupuesto.`);
  console.log(
    `\n✗ ${frenan.length} fuera de presupuesto: ${frenan.map((f) => f.clave).join(", ")}.\n` +
      "  Si leer más es a propósito (una función que ahora hace más), mira el plan con `explain (analyze, buffers)` y acepta el número\n" +
      "  nuevo con `pnpm rendimiento:aceptar -- --desde-ci <id>` (o desde una base local limpia). Si no, algo se volvió más caro.",
  );
  if (!sucia) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
