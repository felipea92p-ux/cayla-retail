#!/usr/bin/env node
/**
 * Prueba de concurrencia de ADR-0208 «Frescura del piso», paso 1 — `bajar_al_piso` con dos conexiones reales y COMMIT.
 *
 * POR QUÉ APARTE. `bajada_al_piso.mjs` corre todo en ROLLBACK; así no se puede ver lo que pasa cuando la PRIMERA
 * bajada ya se guardó (una transacción sin commit es invisible para la otra). Esta prueba SÍ commitea, y por eso solo
 * corre en una base desechable: aborta si no se le pasa `BASE_DESECHABLE=1`. No va en el CI (su Postgres es compartido
 * por todos los pasos) y no limpia lo que deja (movimientos no se borra): cada corrida crea sus propias prendas
 * (producto «Blusa Concurrencia <marca>») y solo cuenta sus filas.
 *
 * QUÉ CUBRE
 *   C1 el MISMO token desde dos conexiones a la vez → un solo documento y un solo juego de movimientos
 *      (una respuesta con ya_registrada = false y la otra true; la segunda espera el candado del token).
 *   C2 dos tokens, la misma prenda con 4 en el almacén y cada uno pide 3 → gana uno; el otro recibe «pides 3 y en el
 *      almacén hay 1» (el mensaje de negocio, no el del motor), stock final sin negativos, sin bloqueo mutuo.
 *   C3 dos bajadas con las mismas prendas en orden inverso [A, B] y [B, A] → ninguna termina en 40P01.
 *   C4 una bajada grande (20 prendas, lista al revés) contra `iniciar_traslado` de las mismas prendas en el otro orden
 *      (también pre-bloquea con fn_bloquear_en_orden) → ninguna con 40P01, ambas terminan, y la espera es real (reloj).
 *   C5 respuesta perdida: repetir el pedido ya confirmado desde otra conexión → ya_registrada = true; el mismo token
 *      con una línea de más → bajada_token_reusado, «… con 1 prenda. No se repitió: la pantalla te deja solo lo que
 *      faltaba.», y el DETAIL con lo ya guardado ([{variante_id, cantidad}]) tal como le llega a la pantalla.
 *
 * USO
 *   BASE_DESECHABLE=1 pnpm pruebas:bajada-al-piso-concurrencia    → SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA bajadas reales (movimientos no se puede borrar). Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 pnpm pruebas:bajada-al-piso-concurrencia"
  );
  process.exit(1);
}

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed): opera cualquier tienda
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const jsons = (texto) => texto.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));

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

const LIDER = `begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;
const lista = (...pares) => `'${JSON.stringify(pares.map(([v, n]) => ({ variante_id: v, cantidad: n })))}'::jsonb`;

/** Prendas propias con stock COMMITEADO en el almacén de Trujillo. Devuelve ids y la tienda. */
function preparar() {
  const marca = Date.now().toString(36);
  const salida = psql(`
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Concurrencia ${marca}', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as p1 \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Falda Concurrencia ${marca}', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as p2 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'p1', t.id, :'color', 'BAJC-${marca}-' || t.n, 50 from (select id, row_number() over (order by valor, id) n from retail.tallas) t where t.n <= 6;
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'p2', t.id, :'color', 'BAJG-${marca}-' || t.n, 50 from (select id, row_number() over (order by valor, id) n from retail.tallas) t where t.n <= 20;
-- A, B, D, E, F: 10; C: 4; G1..G20: 5.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v.id, :'tru', :'alm', 'entrada', case when v.sku = 'BAJC-${marca}-3' then 4 when v.sku like 'BAJG-%' then 5 else 10 end,
         'prueba de concurrencia de la bajada: colchón'
    from retail.variantes v where v.producto_id in (:'p1', :'p2');
select count(*) as _n from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  join retail.variantes v on v.id = m.variante_id where v.producto_id in (:'p1', :'p2') and m.tipo = 'entrada') x \\gset
commit;
select :'tru' || '|' || :'lim' || '|' || :'alm' || '|' || :'piso';
select string_agg(id::text, '|' order by sku) from retail.variantes where sku like 'BAJC-${marca}-%';
select string_agg(id::text, '|' order by id) from retail.variantes where sku like 'BAJG-${marca}-%';
`);
  const [tienda, chicas, grandes] = salida.split("\n").slice(-3);
  const [tru, lim, alm, piso] = tienda.split("|");
  const [A, B, C, D, E, F] = chicas.split("|");
  return { tru, lim, alm, piso, A, B, C, D, E, F, G: grandes.split("|") };
}

const stockDe = (e, v, sub) =>
  Number(psql(`select coalesce((select cantidad from retail.stock where variante_id = '${v}' and ubicacion_id = '${e.tru}' and sububicacion_id = '${sub}'), 0);`));
const bajarSql = (e, items, tok) => `select retail.bajar_al_piso('${e.tru}', ${items}, '${tok}');`;

async function c1(e) {
  const tok = randomUUID();
  const antes = stockDe(e, e.A, e.alm);
  const llamada = bajarSql(e, lista([e.A, 1]), tok);
  const p1 = psqlAsync(`${LIDER}${llamada}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${llamada}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const [r1] = jsons(s1.stdout);
  const [r2] = jsons(s2.stdout);
  const filas = psql(`select concat_ws(',', (select count(*) from retail.bajadas_piso where token_cliente = '${tok}'),
    (select count(*) from retail.bajada_piso_items i join retail.bajadas_piso b on b.id = i.bajada_id where b.token_cliente = '${tok}'));`);
  const ok =
    s1.code === 0 && s2.code === 0 && r1 && r2 &&
    r1.ya_registrada === false && r2.ya_registrada === true && r1.bajada_id === r2.bajada_id &&
    filas === "1,1" && antes - stockDe(e, e.A, e.alm) === 1 && s2.ms > 900;
  esperar("C1 · el mismo token desde dos conexiones: un documento, un movimiento; la segunda espera y responde ya_registrada",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r1=${JSON.stringify(r1)} · r2=${JSON.stringify(r2)} · filas=${filas}`);
  return tok;
}

async function c2(e) {
  const p1 = psqlAsync(`${LIDER}${bajarSql(e, lista([e.C, 3]), randomUUID())}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${bajarSql(e, lista([e.C, 3]), randomUUID())}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const todo = `${s1.stderr}${s2.stderr}`.toLowerCase();
  const almacen = stockDe(e, e.C, e.alm);
  const piso = stockDe(e, e.C, e.piso);
  const ok =
    s1.code === 0 && s2.code !== 0 && s2.stderr.includes(": pides 3 y en el almacén hay 1") &&
    s2.stderr.includes("bajada_sin_alcance") && !todo.includes("deadlock") &&
    almacen === 1 && piso === 3 && s2.ms > 900;
  esperar("C2 · dos bajadas de la misma prenda (4 en el almacén, cada una pide 3): gana una, la otra recibe «pides 3 y en el almacén hay 1»",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · almacén=${almacen} piso=${piso}`);
}

async function c3(e) {
  const p1 = psqlAsync(`${LIDER}${bajarSql(e, lista([e.D, 1], [e.E, 1]), randomUUID())}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${bajarSql(e, lista([e.E, 1], [e.D, 1]), randomUUID())}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const todo = `${s1.stdout}${s1.stderr}${s2.stdout}${s2.stderr}`.toLowerCase();
  const ok = s1.code === 0 && s2.code === 0 && !todo.includes("deadlock") && !todo.includes("40p01") && s2.ms > 900 &&
    stockDe(e, e.D, e.piso) === 2 && stockDe(e, e.E, e.piso) === 2;
  esperar("C3 · dos bajadas con las mismas prendas en orden inverso [A, B] y [B, A]: ninguna con 40P01, la segunda espera",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms)`);
}

async function c4(e) {
  const alReves = [...e.G].reverse();
  const bajada = bajarSql(e, lista(...alReves.map((v) => [v, 1])), randomUUID());
  const traslado = `select retail.iniciar_traslado('${e.tru}', '${e.lim}', ${lista(...e.G.map((v) => [v, 1]))}, now() + interval '1 day', 'prueba de concurrencia de la bajada', '${randomUUID()}');`;
  const p1 = psqlAsync(`${LIDER}${bajada}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${traslado}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const todo = `${s1.stdout}${s1.stderr}${s2.stdout}${s2.stderr}`.toLowerCase();
  const saldos = psql(`select string_agg(distinct coalesce(a.cantidad, 0) || '/' || coalesce(p.cantidad, 0), ',')
    from unnest(array['${e.G.join("','")}']::uuid[]) v(id)
    left join retail.stock a on a.variante_id = v.id and a.ubicacion_id = '${e.tru}' and a.sububicacion_id = '${e.alm}'
    left join retail.stock p on p.variante_id = v.id and p.ubicacion_id = '${e.tru}' and p.sububicacion_id = '${e.piso}';`);
  const ok = s1.code === 0 && s2.code === 0 && !todo.includes("deadlock") && s2.ms > 900 && saldos === "3/1";
  esperar("C4 · bajada de 20 prendas (al revés) contra iniciar_traslado de las mismas (al derecho): ambas terminan, sin 40P01, con espera real",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · almacén/piso=${saldos}`);
}

async function c5(e, tok) {
  const antes = stockDe(e, e.A, e.alm);
  const r = await psqlAsync(`${LIDER}${bajarSql(e, lista([e.A, 1]), tok)}\ncommit;\n`);
  const [res] = jsons(r.stdout);
  const otra = await psqlAsync(`${LIDER}${bajarSql(e, lista([e.A, 1], [e.B, 1]), tok)}\ncommit;\n`);
  let guardado = null;
  try {
    guardado = JSON.parse(otra.stderr.match(/^DETAIL:\s+(.*)$/m)?.[1] ?? "null");
  } catch {
    guardado = null;
  }
  const ok = r.code === 0 && res?.ya_registrada === true && stockDe(e, e.A, e.alm) === antes &&
    otra.code !== 0 && otra.stderr.includes("bajada_token_reusado") &&
    /Esa bajada ya se guardó a las \d\d:\d\d con 1 prenda\. No se repitió: la pantalla te deja solo lo que faltaba\./.test(otra.stderr) &&
    Array.isArray(guardado) && guardado.length === 1 && Object.keys(guardado[0]).length === 2 &&
    guardado[0].variante_id === e.A && guardado[0].cantidad === 1 && stockDe(e, e.B, e.piso) === 0;
  esperar("C5 · respuesta perdida: repetir lo ya confirmado → ya_registrada sin mover; con una línea de más → «ya se guardó… con 1 prenda» y el DETAIL con lo guardado",
    ok, `r=${r.code} ${JSON.stringify(res)} ${r.stderr.trim()} · otra=${otra.code} ${otra.stderr.trim()} · detail=${JSON.stringify(guardado)}`);
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No encuentro el contenedor ${CONTENEDOR_LOCAL}.`);
    process.exit(1);
  }
  const e = preparar();
  const tok = await c1(e);
  await c2(e);
  await c3(e);
  await c4(e);
  await c5(e, tok);
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
