#!/usr/bin/env node
/**
 * Cuánto pesa cada sub-cuenta de Finanzas ▸ Resumen (2026-11-13, «Resumen por bloques»): `fn_resumen_finanzas` y `fn_balance_por_tienda`,
 * pieza por pieza, con los MISMOS argumentos con que ellas se llaman por dentro.
 *
 * EL PROBLEMA. `fn_resumen_finanzas` deja su `ms` por parte en los logs (`finanzas_resumen_ms`), pero eso dice cuánto tardó en producción con la
 * carga de ese momento, no cuántos bloques lee cada parte ni por qué. Y `fn_balance_por_tienda` no mide nada. Para decidir qué bajar primero
 * hace falta medir cada pieza sola, con volumen, y contar bloques (no dependen de lo ocupada que esté la máquina).
 *
 * QUÉ HACE. Contra una copia del Postgres local con un año sintético (`pnpm carga:preparar`, `cayla_carga`, ADR-0194/0622), como el líder
 * del seed y con RLS, en transacción que se deshace: una llamada para calentar y `CORRIDAS` llamadas con `explain (analyze, buffers)` por pieza.
 * Imprime la mediana de ms y los bloques de 8 kB (memoria + disco + temporales) de la corrida mediana, ordenadas de la más pesada a la más liviana.
 * Los bloques de un `Function Scan` cuentan todo lo que la función leyó por dentro.
 *
 * DÓNDE. Nunca contra `postgres` (la comparten otras sesiones) ni contra producción: se niega.
 *
 * USO
 *   node scripts/rendimiento/medir-resumen-finanzas.mjs                 → cayla_carga, 3 corridas
 *   BASE=cayla_otra CORRIDAS=5 node scripts/rendimiento/medir-resumen-finanzas.mjs
 *   node scripts/rendimiento/medir-resumen-finanzas.mjs --json          → la tabla en JSON (para pegarla en el backlog)
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const BASE = process.env.BASE ?? "cayla_carga";
const CORRIDAS = Number(process.env.CORRIDAS ?? 3);
const LIDER = "22222222-2222-4222-8222-000000000001"; // el líder del seed (Felipe)

if (BASE === "postgres") throw new Error("No se mide en la base compartida (postgres): usa una copia, como cayla_carga.");

// Las fechas son las mismas que calcula `fn_resumen_finanzas` (`v_mes`, `v_hoy`, `v_mes_ant`, `v_fin_ant`), mirando CAYLA entera.
const FECHAS = `
  (select retail.fn_hoy_lima()) as hoy,
  (select date_trunc('month', retail.fn_hoy_lima())::date) as mes,
  (select (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date) as mes_ant,
  (select (date_trunc('month', retail.fn_hoy_lima()) - interval '1 day')::date) as fin_ant`;

/**
 * Cada pieza: dónde vive, su nombre, la llamada (con `f.hoy`, `f.mes`… de FECHAS) y, si no se llama como el líder, «dueno»: las `fn_bal_*` no
 * se dan a `authenticated` (las llama `fn_balance_por_tienda`, que es `security definer`), así que se miden como su dueño, como corren por dentro.
 */
const PIEZAS = [
  ["resumen", "(entera)", "select retail.fn_resumen_finanzas(null, false) from f"],
  ["resumen", "resultados_mes", "select count(*) from f, retail.fn_estado_resultados(f.mes, f.hoy, null)"],
  ["resumen", "resultados_anterior", "select count(*) from f, retail.fn_estado_resultados(f.mes_ant, f.fin_ant, null)"],
  ["resumen", "presupuesto", "select count(*) from f, retail.fn_presupuesto_vs_real(f.mes, null, null)"],
  ["resumen", "cuentas", "select count(*) from f, retail.fn_cuentas_dinero_saldos(f.hoy, null)"],
  ["resumen", "por_pagar", "select count(*) from retail.fn_por_pagar_consolidado(null, null, false)"],
  ["resumen", "flujo", "select retail.fn_flujo_caja_proyeccion(6)"],
  ["resumen", "igv", "select retail.fn_impuestos_panel(f.mes) from f"],
  ["resumen", "campanas", "select count(*) from retail.fn_campanas_reporte(null)"],
  ["resumen", "egresos", "select count(*) from retail.fn_egresos_sin_clasificar(null, 1000)"],
  ["resumen", "fijos", "select count(*) from f, retail.fn_gastos_fijos_mes(f.mes, null, false)"],
  ["resumen", "raros", "select count(*) from retail.fn_gastos_fuera_de_lo_normal(null, false, null)"],
  ["resumen", "cierre", "select count(*) from f, retail.fn_periodos_mes(f.mes_ant)"],
  ["resumen", "sin_cuenta", "select count(*) from f, retail.fn_dinero_sin_cuenta(f.mes, f.hoy)"],
  ["balance", "(entera)", "select count(*) from f, retail.fn_balance_por_tienda(f.hoy)"],
  ["balance", "fn_estado_resultados (mes a hoy)", "select count(*) from f, retail.fn_estado_resultados(f.mes, f.hoy, null)"],
  ["balance", "fn_bal_dinero", "select count(*) from f, retail.fn_bal_dinero(f.hoy)", "dueno"],
  ["balance", "fn_bal_stock", "select count(*) from f, retail.fn_bal_stock(f.hoy)", "dueno"],
  ["balance", "fn_bal_activos", "select count(*) from f, retail.fn_bal_activos(f.hoy)", "dueno"],
  ["balance", "fn_bal_facturas_de_tienda", "select count(*) from f, retail.fn_bal_facturas_de_tienda(f.hoy)", "dueno"],
];

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-U", "supabase_admin", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-q", "-At", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const comoLider = `set local role authenticated;
set local request.jwt.claims = '{"sub":"${LIDER}","role":"authenticated"}';
set local request.jwt.claim.sub = '${LIDER}';
set local request.jwt.claim.role = 'authenticated';`;

/** Una corrida de una pieza: { ms, bloques } desde `explain (analyze, buffers, format json)`. */
function medir(llamada, rol) {
  const salida = psql(`begin;
${comoLider}
${rol === "dueno" ? "set local role postgres;" : ""}
explain (analyze, buffers, format json) with f as materialized (select ${FECHAS}) ${llamada};
rollback;`);
  const json = JSON.parse(salida.slice(salida.indexOf("[")));
  const plan = json[0].Plan;
  const b = (k) => Number(plan[k] ?? 0);
  return {
    ms: Math.round(json[0]["Execution Time"]),
    bloques: b("Shared Hit Blocks") + b("Shared Read Blocks") + b("Local Hit Blocks") + b("Local Read Blocks") + b("Temp Read Blocks") + b("Temp Written Blocks"),
  };
}

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const filas = [];
for (const [donde, pieza, llamada, rol] of PIEZAS) {
  medir(llamada, rol); // calentar
  const corridas = Array.from({ length: CORRIDAS }, () => medir(llamada, rol));
  const ms = mediana(corridas.map((c) => c.ms));
  const bloques = corridas.find((c) => c.ms === ms)?.bloques ?? corridas[0].bloques;
  filas.push({ donde, pieza, ms, bloques, corridas: corridas.map((c) => c.ms).join(" / ") });
}

const orden = (a, b) => (a.donde === b.donde ? (a.pieza === "(entera)" ? -1 : b.pieza === "(entera)" ? 1 : b.ms - a.ms) : a.donde.localeCompare(b.donde) * -1);
filas.sort(orden);
if (process.argv.includes("--json")) console.log(JSON.stringify(filas, null, 2));
else {
  console.log(`Base ${BASE}, ${CORRIDAS} corridas por pieza (mediana), como el líder del seed:`);
  console.table(filas);
}
