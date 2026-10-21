#!/usr/bin/env node
/**
 * Prueba de concurrencia del pago de Producción — `registrar_pago_comprobante_produccion` con dos conexiones reales y
 * COMMIT. Migración: `20261012214000_pago_produccion_token_tras_candado.sql`.
 *
 * EL PROBLEMA QUE VIGILA. Doble clic en «Pagar S/ 300» sobre un comprobante del Taller de S/ 1.000: dos llamadas con el
 * MISMO token. Si la función mira el token ANTES de bloquear el comprobante, las dos lo miran a la vez, ninguna ve el
 * pago de la otra y las dos insertan: quedan S/ 600 pagados. Con el token mirado DESPUÉS del candado, la segunda espera,
 * ve el pago de la primera y devuelve el mismo grupo sin repetirlo.
 *
 * POR QUÉ APARTE (como `bajada_al_piso_concurrencia.mjs`). Una transacción sin COMMIT es invisible para la otra, así que
 * en ROLLBACK no se puede ver el caso. Esta prueba SÍ commitea (un proveedor, un comprobante y sus pagos propios) y por
 * eso solo corre contra una base DESECHABLE: aborta sin `BASE_DESECHABLE=1` y sin `--base`. No va en el CI.
 * Una base desechable se arma copiando la local dentro del mismo contenedor:
 *   docker exec supabase_db_cayla-retail bash -c "createdb -U postgres prueba_tokens && pg_dump -U postgres -d postgres --no-owner | psql -q -U postgres -d prueba_tokens"
 *   (y al terminar: docker exec supabase_db_cayla-retail dropdb -U postgres prueba_tokens)
 *
 * QUÉ CUBRE
 *   T1 el MISMO token desde dos conexiones a la vez → un solo pago de S/ 300, y las dos respuestas devuelven el mismo grupo.
 *   T2 dos tokens distintos a la vez (dos pagos de verdad) → los dos entran, S/ 600 en total, sin bloqueo mutuo.
 *   T3 la definición viva mira el token después del `for update` (la forma que vigila la migración).
 *
 * USO
 *   BASE_DESECHABLE=1 node scripts/pruebas/pago_produccion_concurrencia.mjs --base prueba_tokens
 *   … --sin-migracion  → no carga la migración antes (para ver la prueba en rojo contra la función vieja)
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : null;
if (process.env.BASE_DESECHABLE !== "1" || !BASE || BASE === "postgres") {
  console.error(
    "Esta prueba COMMITEA pagos reales. Córrela solo contra una base desechable (nunca `postgres`):\n" +
      "  BASE_DESECHABLE=1 node scripts/pruebas/pago_produccion_concurrencia.mjs --base prueba_tokens"
  );
  process.exit(1);
}

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261012214000_pago_produccion_token_tras_candado.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2000).replace(/\n/g, "\n    ")}`);
  }
}

const LIDER = `set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;

/** Un comprobante a crédito de S/ 1.000 (sin IGV, para que las cuentas sean redondas), COMMITEADO. */
function comprobante() {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  return psql(`begin;
${LIDER}
select retail.registrar_comprobante_produccion(
  retail.guardar_proveedor_produccion(null, 'Proveedor concurrencia ${marca}', 'tela', null, p_plazo_credito_dias => 30),
  'F001', '${marca}', 'credito',
  jsonb_build_array(jsonb_build_object('descripcion', 'Flete concurrencia', 'cantidad', 1, 'costo_unitario', 1000)),
  p_fecha_vencimiento => current_date + 30);
commit;`);
}

/** Una llamada de pago en su propia conexión; `espera` la mantiene abierta con el candado tomado. */
function pagar(cid, token, espera = 0) {
  return psqlAsync(`begin;
${LIDER}
select retail.registrar_pago_comprobante_produccion('${cid}', '[{"metodo":"transferencia","monto":300}]'::jsonb, null, '${token}');
select pg_sleep(${espera});
commit;`);
}
const pagado = (cid) => Number(psql(`select coalesce(sum(monto), 0) from retail.comprobantes_produccion_pagos where comprobante_id = '${cid}';`));

if (!process.argv.includes("--sin-migracion")) psql(MIGRACION);

// T1 — mismo token, a la vez. La primera se queda 1,5 s con el comprobante bloqueado; la segunda llega mientras tanto.
{
  const cid = comprobante().split("\n").at(-1);
  const token = randomUUID();
  const a = pagar(cid, token, 1.5);
  await dormir(300);
  const b = pagar(cid, token);
  const [ra, rb] = await Promise.all([a, b]);
  esperar("T1 las dos llamadas con el mismo token terminan sin error", ra.code === 0 && rb.code === 0, `${ra.stderr}\n${rb.stderr}`);
  esperar("T1 las dos devuelven el mismo grupo (el token)", ra.stdout.split("\n")[0] === token && rb.stdout.split("\n")[0] === token, `${ra.stdout} / ${rb.stdout}`);
  const p = pagado(cid);
  esperar(`T1 queda UN pago de S/ 300 (hay S/ ${p})`, p === 300);
}

// T2 — dos tokens, a la vez: son dos pagos de verdad, entran los dos.
{
  const cid = comprobante().split("\n").at(-1);
  const a = pagar(cid, randomUUID(), 1);
  await dormir(300);
  const b = pagar(cid, randomUUID());
  const [ra, rb] = await Promise.all([a, b]);
  esperar("T2 dos tokens distintos: los dos pagos entran", ra.code === 0 && rb.code === 0, `${ra.stderr}\n${rb.stderr}`);
  const p = pagado(cid);
  esperar(`T2 quedan S/ 600 pagados (hay S/ ${p})`, p === 600);
}

// T3 — la forma: el token se mira después del candado.
{
  const def = psql(`select pg_get_functiondef('retail.registrar_pago_comprobante_produccion(uuid,jsonb,date,uuid)'::regprocedure);`);
  const token = def.indexOf("where grupo_id = p_token");
  const candado = def.indexOf("for update");
  esperar("T3 la función mira el token DESPUÉS del for update del comprobante", candado > 0 && token > candado);
}

console.log(`\n${total - fallos}/${total} comprobaciones pasaron`);
process.exit(fallos ? 1 : 0);
