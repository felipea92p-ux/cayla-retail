#!/usr/bin/env node
/**
 * Pruebas del REDONDEO DEL EFECTIVO (ADR-0310) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261003100000_redondeo_efectivo_regla.sql`: la regla `retail.fn_redondeo_efectivo` — lo que se cobra de menos
 * al pagar en efectivo. S/ 0.10 es la moneda más chica que circula y la ley solo permite bajar: 100.19 → se cobra 100.10
 * (redondeo 0.09), nunca 100.20. En los 99 999 montos de S/ 0.01 a S/ 999.99 el redondeo es de 0.00 a 0.09, deja el efectivo
 * en múltiplo de 0.10 y es el ÚNICO que lo logra: por eso `registrar_venta` podrá exigir «el redondeo exacto de la ley».
 *
 * (La caja tendrá su gemela en TypeScript cuando Vender la use —actividad 5—; entonces esta prueba también compara las dos en
 * los 99 999 montos. Hoy ninguna pantalla la llama y el repo no admite una regla sin uso.)
 *
 * CÓMO. El patrón de `campana_redondeo.mjs`: todo dentro de una transacción con ROLLBACK, contra la base real. Nunca se
 * commitea nada en el Postgres local que comparten los worktrees.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261003100000_redondeo_efectivo_regla.sql` mete la migración
 * dentro de la transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace CI).
 *
 * USO
 *   pnpm pruebas:redondeo-efectivo    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION_REGLA = "supabase/migrations/20261003100000_redondeo_efectivo_regla.sql";

const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 900)}`);
  }
}

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. Los ejemplos de la ley (INDECOPI) y de Felipe: [deuda en efectivo, se cobra, redondeo] ----
  const EJEMPLOS = [
    [2.69, 2.6, 0.09], [5.99, 5.9, 0.09], [8.97, 8.9, 0.07], [5.46, 5.4, 0.06], [12.56, 12.5, 0.06], [2.75, 2.7, 0.05], [9.99, 9.9, 0.09],
    [100.02, 100, 0.02], [100.12, 100.1, 0.02], [100.19, 100.1, 0.09], [100.1, 100.1, 0], [100, 100, 0],
    // los bordes: lo que no llega a una moneda no se cobra; el descuento exacto de ADR-0302 deja estos céntimos
    [0.09, 0, 0.09], [0.05, 0, 0.05], [0.1, 0.1, 0], [0.29, 0.2, 0.09], [0.01, 0, 0.01],
    [67.91, 67.9, 0.01], [79.9, 79.9, 0], [33.15, 33.1, 0.05], [484.54, 484.5, 0.04], [62.15, 62.1, 0.05], [309.59, 309.5, 0.09],
    [4.35, 4.3, 0.05], [1.15, 1.1, 0.05], [8.2, 8.2, 0], [0.57, 0.5, 0.07],
  ];
  const r1 = correr(`begin;\n${APLICAR_ANTES}\n` +
    EJEMPLOS.map(([d]) => `select '${d}|' || retail.fn_redondeo_efectivo(${d});`).join("\n") + "\nrollback;");
  if (!r1.ok) {
    esperar("fn_redondeo_efectivo existe y responde", false, r1.mensaje);
  } else {
    const dio = new Map(r1.salida.split("\n").filter(Boolean).map((l) => { const [d, r] = l.split("|"); return [d, Number(r)]; }));
    const malos = EJEMPLOS.filter(([d, , red]) => dio.get(String(d)) !== red).map(([d, , red]) => `S/ ${d}: esperaba redondeo ${red}, dio ${dio.get(String(d))}`);
    esperar(`fn_redondeo_efectivo da lo que dice la ley en ${EJEMPLOS.length} ejemplos (100.19 → 0.09, 100.12 → 0.02, 2.69 → 0.09…)`, malos.length === 0, malos.join(" · "));
    // El efectivo a cobrar = deuda − redondeo: lo que sale de la tabla.
    const malosCobro = EJEMPLOS.filter(([d, cobra, red]) => Math.round(d * 100) - Math.round(red * 100) !== Math.round(cobra * 100));
    esperar("en la tabla, deuda − redondeo es lo que se cobra (la tabla es consistente consigo misma)", malosCobro.length === 0, malosCobro.join(" · "));
  }

  // ---- 2. En TODOS los montos de 0.01 a 999.99 (99 999): redondeo de 0 a 0.09, el efectivo queda en múltiplo de 0.10, y es el único ----
  // Único: de los diez redondeos posibles (0.00 … 0.09) exactamente uno deja el efectivo en múltiplo de 0.10. Si hubiera dos, la
  // base no podría exigir «el redondeo exacto de la ley» y un cliente manipulado podría mandar otro. También se comprueba que
  // nunca sube (el efectivo a cobrar jamás supera la deuda) y que es monótona (más deuda nunca cobra menos).
  const r2 = correr(`begin;
${APLICAR_ANTES}
with t as (
  select g, (retail.fn_redondeo_efectivo(g / 100.0) * 100)::int as red from generate_series(1, 99999) g
)
select 'n|' || count(*)
  || '|fuera_de_rango|' || count(*) filter (where red < 0 or red > 9)
  || '|no_multiplo|' || count(*) filter (where (g - red) % 10 <> 0)
  || '|sube|' || count(*) filter (where g - red > g)
  || '|no_unico|' || count(*) filter (where (select count(*) from generate_series(0, 9) r where (g - r) % 10 = 0) <> 1 or red <> g % 10)
  || '|no_monotona|' || (select count(*) from (select g - red as cobra, lag(g - red) over (order by g) as ant from t) m where ant is not null and cobra < ant)
from t;
rollback;`);
  esperar(
    "en los 99 999 montos (0.01 a 999.99): redondeo de 0 a 0.09, efectivo en múltiplo de 0.10, nunca sube, es monótona y el redondeo es el único posible",
    r2.ok && r2.salida === "n|99999|fuera_de_rango|0|no_multiplo|0|sube|0|no_unico|0|no_monotona|0",
    r2.ok ? r2.salida : r2.mensaje,
  );

  // ---- 3. Lo que no hay que redondear: sin monto, cero, negativo ----
  const r3 = correr(`begin;\n${APLICAR_ANTES}\nselect 'v|' || retail.fn_redondeo_efectivo(0) || '|' || retail.fn_redondeo_efectivo(-5) || '|' || retail.fn_redondeo_efectivo(null);\nrollback;`);
  esperar("sin monto, cero o negativo no hay redondeo", r3.ok && r3.salida.includes("v|0|0|0"), r3.ok ? r3.salida : r3.mensaje);

  // ---- 4. La migración se puede pegar dos veces seguidas ----
  const migracion = readFileSync(MIGRACION_REGLA, "utf8");
  const r4 = correr(`begin;\n${migracion}\n${migracion}\nselect 'r|' || retail.fn_redondeo_efectivo(100.19);\nrollback;`);
  esperar("la migración de la regla es re-ejecutable (dos veces seguidas) y deja 100.19 → 0.09", r4.ok && r4.salida.includes("r|0.09"), r4.ok ? r4.salida : r4.mensaje);

  // ---- 5. Es una función pura y solo la ven quienes iniciaron sesión ----
  const r5 = correr(`select 'p|' || p.provolatile::text || '|' || has_function_privilege('anon', 'retail.fn_redondeo_efectivo(numeric)', 'execute') || '|' || has_function_privilege('authenticated', 'retail.fn_redondeo_efectivo(numeric)', 'execute')
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_redondeo_efectivo';`);
  esperar("fn_redondeo_efectivo es inmutable, no la ejecuta anon y sí authenticated", r5.ok && r5.salida.includes("p|i|false|true"), r5.ok ? r5.salida : r5.mensaje);

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
