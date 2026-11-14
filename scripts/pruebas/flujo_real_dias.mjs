#!/usr/bin/env node
/**
 * «Movimientos» en una sola lectura da, día por día, exactamente lo de `fn_flujo_caja_real(d, d)` (ADR-0661 act. 2026-11-14;
 * `20261114010000_movimientos_en_una_lectura.sql`).
 *
 * POR QUÉ. Finanzas ▸ Resumen ▸ «Movimientos» pedía `fn_flujo_caja_real` seis veces (un día cada una) y cada una leía los saldos de todas las cuentas
 * tres veces. `fn_flujo_caja_real_dias` los lee una vez por fecha y suma el disponible y lo que vuelve a los fondos con las MISMAS reglas de
 * `fn_flujo_disponible` y `fn_flujo_por_volver`, que quedan escritas en dos lugares: esta prueba falla si dejan de coincidir.
 *
 * QUÉ CUBRE (cada escena en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`)
 *   · CADA DÍA ES EL DE SIEMPRE: los últimos 31 días, cada uno igual a `fn_flujo_caja_real(d, d)` al byte; y días sueltos, desordenados y repetidos.
 *     Control: la comparación no es vacía (hay días distintos entre sí).
 *   · `fn_flujo_caja_real` ES EL ENVOLTORIO de `fn_flujo_caja_real_de` (la regla en un lugar).
 *   · LO QUE NO SE PUEDE: sin días, más de 31, un día vacío o un día futuro son error, nunca una respuesta a medias.
 *   · PERMISOS IGUALES: quien no ve los estados de CAYLA entera recibe el mismo 42501 que en la llamada sola; `anon` no llama; la `…_de` no la
 *     llama nadie de afuera.
 *
 * USO
 *   pnpm pruebas:flujo-real-dias                  → con las migraciones aplicadas en el local
 *   pnpm pruebas:flujo-real-dias --base cayla_x   → otra base del mismo contenedor (una copia)
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo (seed)

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (id) => `set local role authenticated;
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local request.jwt.claim.sub = '${id}';
set local request.jwt.claim.role = 'authenticated';`;

let casos = 0;
let fallas = 0;
function esperar(nombre, ok, detalle) {
  casos++;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${!ok && detalle ? `\n    ${String(detalle).slice(0, 600)}` : ""}`);
}

// ---- A. Cada día es el de siempre ---------------------------------------------------------------------------------------
{
  const r = correr(`${como(FELIPE)}
create temp table _d on commit drop as select (retail.fn_hoy_lima() - n) as d from generate_series(0, 30) n;
create temp table _j on commit drop as select retail.fn_flujo_caja_real_dias(array(select d from _d)) as j;
select count(*) filter (where (_j.j -> _d.d::text) = retail.fn_flujo_caja_real(_d.d, _d.d)), count(*),
       (select count(*) from jsonb_object_keys((select j from _j))),
       (select count(distinct (_j.j -> _d.d::text) - 'desde' - 'hasta') from _d, _j) > 1
  from _d, _j;`);
  const [iguales, total, llaves, distintos] = r.ok ? r.salida.split("|") : [];
  esperar("A · los últimos 31 días, cada uno igual a fn_flujo_caja_real(d, d) al byte", r.ok && iguales === "31" && total === "31" && llaves === "31", r.ok ? r.salida : r.mensaje);
  esperar("A · control — los días no son todos iguales entre sí (la comparación no es vacía)", r.ok && distintos === "t", r.ok ? r.salida : r.mensaje);
}
{
  const r = correr(`${como(FELIPE)}
create temp table _j on commit drop as
  select retail.fn_flujo_caja_real_dias(array[retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), retail.fn_hoy_lima() - 3, retail.fn_hoy_lima() - 20]) as j;
select (select count(*) from jsonb_object_keys(j)) = 3
   and (j -> (retail.fn_hoy_lima() - 3)::text) = retail.fn_flujo_caja_real(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima() - 3)
   and (j -> retail.fn_hoy_lima()::text) = retail.fn_flujo_caja_real(retail.fn_hoy_lima(), retail.fn_hoy_lima())
   and (j -> (retail.fn_hoy_lima() - 20)::text) = retail.fn_flujo_caja_real(retail.fn_hoy_lima() - 20, retail.fn_hoy_lima() - 20)
  from _j;`);
  esperar("A · días sueltos, desordenados y repetidos: una llave por día, cada una la de siempre", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}

// ---- B. La regla en un lugar ----------------------------------------------------------------------------------------------
{
  const r = correr(`select position('fn_flujo_caja_real_de(p_desde, p_hasta, null, null, null)' in prosrc) > 0
  from pg_proc where oid = 'retail.fn_flujo_caja_real(date,date)'::regprocedure;`);
  esperar("B · fn_flujo_caja_real es el envoltorio de fn_flujo_caja_real_de", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}

// ---- C. Lo que no se puede ------------------------------------------------------------------------------------------------
for (const [nombre, dias, mensaje] of [
  ["sin días", "array[]::date[]", /Los días del flujo no son válidos/],
  ["más de 31 días", "array(select retail.fn_hoy_lima() - n from generate_series(0, 31) n)", /Los días del flujo no son válidos/],
  ["un día vacío", "array[retail.fn_hoy_lima(), null]::date[]", /Los días del flujo no son válidos/],
  ["un día futuro", "array[retail.fn_hoy_lima() + 1]", /El rango de fechas no es válido/],
]) {
  const r = correr(`${como(FELIPE)}\nselect retail.fn_flujo_caja_real_dias(${dias});`);
  esperar(`C · ${nombre} es un error, no una respuesta a medias`, !r.ok && mensaje.test(r.mensaje), r.ok ? r.salida : r.mensaje);
}

// ---- D. Permisos iguales --------------------------------------------------------------------------------------------------
{
  const sola = correr(`${como(MICAELA)}\nselect retail.fn_flujo_caja_real(retail.fn_hoy_lima(), retail.fn_hoy_lima());`);
  const junta = correr(`${como(MICAELA)}\nselect retail.fn_flujo_caja_real_dias(array[retail.fn_hoy_lima()]);`);
  const linea = (r) => (r.mensaje ?? "").split("\n").find((l) => l.includes("ERROR")) ?? "";
  esperar("D · quien no ve los estados de CAYLA entera recibe el mismo error que en la llamada sola", !sola.ok && !junta.ok && linea(sola) === linea(junta), `${linea(sola)} / ${linea(junta)}`);
}
{
  const r = correr(`select not has_function_privilege('anon', 'retail.fn_flujo_caja_real_dias(date[])', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_flujo_caja_real_dias(date[])', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_flujo_caja_real_de(date,date,numeric,numeric,numeric)', 'execute')
  and not has_function_privilege('anon', 'retail.fn_flujo_caja_real_de(date,date,numeric,numeric,numeric)', 'execute')
  and (select provolatile = 's' and prosecdef from pg_proc where oid = 'retail.fn_flujo_caja_real_dias(date[])'::regprocedure);`);
  esperar("D · anon no llama; authenticated sí a la de días; la «…_de» no la llama nadie de afuera; STABLE y security definer", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}, contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
