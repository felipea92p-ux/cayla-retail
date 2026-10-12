#!/usr/bin/env node
/**
 * Prueba de concurrencia de ADR-0328, actividad 10 — Dañadas (`20261005140000_danadas_reportar_y_se_arreglo.sql`) con dos
 * conexiones reales y COMMIT.
 *
 * POR QUÉ APARTE. `danadas_reportar_arreglar.mjs` corre todo en ROLLBACK, y una transacción sin commit es invisible para la otra:
 * así no se ve qué pasa cuando la PRIMERA ya se guardó. Por eso, en la revisión, quitar cualquiera de los tres candados (el
 * `for update` de la dañada, `fn_bloquear_en_orden` o el candado consultivo de la marca) dejaba las 36 pruebas en verde. Esta
 * SÍ commitea y solo corre en una base desechable: aborta sin `BASE_DESECHABLE=1`. No va en el CI (su Postgres es compartido
 * por todos los pasos) y no limpia lo que deja (movimientos no se borra): cada corrida crea sus propias prendas (producto
 * «Blusa Dañada Concurrencia <marca>») y solo cuenta sus filas. Mismo patrón que `bajada_al_piso_concurrencia.mjs`.
 *
 * QUÉ CUBRE (cada caso mata una mutación que las pruebas con ROLLBACK no ven)
 *   K1 el MISMO reporte (misma marca) desde dos conexiones a la vez → un movimiento y una dañada; la segunda espera y
 *      responde ya_registrada. Sin el candado consultivo, la segunda choca con el índice único (o dice «no alcanza»).
 *   K2 dos reportes distintos por la ÚLTIMA libre del piso → gana uno; el otro recibe el mensaje de negocio
 *      (`danada_sin_alcance`, «hay 0 libres»), sin 40P01. Sin `fn_bloquear_en_orden`, la segunda lee lo libre sin candado y
 *      el rechazo llega del motor, no de la pantalla.
 *   K3 dos líderes «Se arregló» a la vez sobre la MISMA dañada, con otra dañada del mismo código en la cuarentena → uno pasa,
 *      el otro `arreglo_ya_resuelta`, y la cuarentena cuadra con la fila que queda. Sin el `for update`, las dos pasan y se
 *      llevan las unidades de la OTRA dañada (su fila diría 2 y la cuarentena 1).
 *   K4 «Se arregló» contra «Se botó» la misma dañada → gana la primera; la segunda dice «Esta prenda ya se resolvió como
 *      se_arreglo», el texto EXACTO que la pantalla traduce (`textoErrorDeResolucion`).
 *   K5 reportar contra apartar para un cliente la última libre, en los dos órdenes → nunca se usa dos veces: si gana el
 *      reporte, el apartado no alcanza; si gana el apartado, el reporte dice «hay 0 libres (1 apartada…)».
 *
 * USO
 *   BASE_DESECHABLE=1 pnpm pruebas:danadas-concurrencia    → SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA reportes reales (movimientos no se puede borrar). Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 pnpm pruebas:danadas-concurrencia"
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

/**
 * Prendas propias con stock COMMITEADO en Trujillo (piso y almacén) y, para K3 y K4, dañadas ya reportadas. Cada variante es
 * de un solo caso: A (K1, piso 5), B (K2, piso 1), C (K3: dos dañadas de 1 y 2), D (K4: una dañada de 1), E y F (K5, piso 1).
 */
function preparar() {
  const marca = Date.now().toString(36);
  const salida = psql(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', x.nombre, x.tipo from (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) x(nombre, tipo)
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = x.tipo);
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Dañada Concurrencia ${marca}', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as p \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'p', t.id, :'color', 'DANC-${marca}-' || t.n, 50 from (select id, row_number() over (order by valor, id) n from retail.tallas) t where t.n <= 6;
-- A 5, B 1, C 3, D 1, E 1, F 1: todo en el piso.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v.id, :'tru', :'piso', 'entrada',
         case right(v.sku, 2) when '-1' then 5 when '-3' then 3 else 1 end, 'prueba de concurrencia de dañadas: colchón'
    from retail.variantes v where v.producto_id = :'p';
select count(*) as _n from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  join retail.variantes v on v.id = m.variante_id where v.producto_id = :'p' and m.tipo = 'entrada') x \\gset
select id as vc from retail.variantes where sku = 'DANC-${marca}-3' \\gset
select id as vd from retail.variantes where sku = 'DANC-${marca}-4' \\gset
-- K3: dos dañadas del MISMO código en la cuarentena (1 y 2). K4: una de 1.
select retail.reportar_danada(:'tru', :'vc', 1, 'piso', 'Mancha en la manga', gen_random_uuid()) ->> 'id' as c1 \\gset
select retail.reportar_danada(:'tru', :'vc', 2, 'piso', 'Botón descosido', gen_random_uuid()) ->> 'id' as c2 \\gset
select retail.reportar_danada(:'tru', :'vd', 1, 'piso', 'Roto en la costura', gen_random_uuid()) ->> 'id' as d1 \\gset
commit;
select :'tru' || '|' || :'piso' || '|' || :'alm' || '|' || :'cua' || '|' || :'c1' || '|' || :'c2' || '|' || :'d1';
select string_agg(id::text, '|' order by sku) from retail.variantes where sku like 'DANC-${marca}-%';
`);
  const [sede, variantes] = salida.split("\n").slice(-2);
  const [tru, piso, alm, cua, c1, c2, d1] = sede.split("|");
  const [A, B, C, D, E, F] = variantes.split("|");
  return { tru, piso, alm, cua, c1, c2, d1, A, B, C, D, E, F };
}

const stockDe = (e, v, sub) =>
  Number(psql(`select coalesce((select cantidad from retail.stock where variante_id = '${v}' and ubicacion_id = '${e.tru}' and sububicacion_id = '${sub}'), 0);`));
const apartadasDe = (e, v, sub) =>
  Number(psql(`select coalesce((select cantidad_apartada from retail.stock where variante_id = '${v}' and ubicacion_id = '${e.tru}' and sububicacion_id = '${sub}'), 0);`));
const reportarSql = (e, v, n, tok, motivo = "Mancha en la manga") => `select retail.reportar_danada('${e.tru}', '${v}', ${n}, 'piso', '${motivo}', '${tok}');`;
const arreglarSql = (id, tok) => `select retail.arreglar_prenda_danada('${id}', 'Se cosió el botón', '${tok}');`;
const apartarSql = (e, v) => `select retail.apartar_stock('${v}', '${e.tru}', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, '${e.piso}', null);`;
/** La primera toma lo suyo y espera 1,5 s antes de confirmar; la segunda sale 0,4 s después y tiene que esperarla. */
async function carrera(primera, segunda) {
  const p1 = psqlAsync(`${LIDER}${primera}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${segunda}\ncommit;\n`);
  return Promise.all([p1, p2]);
}
const sinDeadlock = (...rs) => !rs.map((r) => `${r.stdout}${r.stderr}`).join("").toLowerCase().match(/deadlock|40p01/);

async function k1(e) {
  const tok = randomUUID();
  const [s1, s2] = await carrera(reportarSql(e, e.A, 1, tok), reportarSql(e, e.A, 1, tok));
  const [r1] = jsons(s1.stdout);
  const [r2] = jsons(s2.stdout);
  const filas = psql(`select concat_ws(',', (select count(*) from retail.prendas_danadas where variante_id = '${e.A}'),
    (select count(*) from retail.movimientos where variante_id = '${e.A}' and tipo = 'traslado'));`);
  const ok =
    s1.code === 0 && s2.code === 0 && r1 && r2 &&
    r1.ya_registrada === false && r2.ya_registrada === true && r1.id === r2.id && r1.movimiento_id === r2.movimiento_id &&
    filas === "1,1" && stockDe(e, e.A, e.piso) === 4 && stockDe(e, e.A, e.cua) === 1 && s2.ms > 900;
  esperar("K1 · el mismo reporte desde dos conexiones: un movimiento y una dañada; la segunda espera y responde ya_registrada",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r1=${JSON.stringify(r1)} · r2=${JSON.stringify(r2)} · filas=${filas}`);
}

async function k2(e) {
  const [s1, s2] = await carrera(reportarSql(e, e.B, 1, randomUUID()), reportarSql(e, e.B, 1, randomUUID(), "Otra mancha"));
  const piso = stockDe(e, e.B, e.piso);
  const cua = stockDe(e, e.B, e.cua);
  const danadas = psql(`select count(*) from retail.prendas_danadas where variante_id = '${e.B}';`);
  const ok =
    s1.code === 0 && s2.code !== 0 && s2.stderr.includes("danada_sin_alcance") &&
    s2.stderr.includes(": pides 1 y en el piso hay 0 libres") && sinDeadlock(s1, s2) &&
    piso === 0 && cua === 1 && danadas === "1" && s2.ms > 900;
  esperar("K2 · dos reportes por la última libre del piso: gana uno; el otro recibe «pides 1 y en el piso hay 0 libres» (danada_sin_alcance)",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · piso=${piso} cuarentena=${cua} dañadas=${danadas}`);
}

async function k3(e) {
  const almAntes = stockDe(e, e.C, e.alm);
  const [s1, s2] = await carrera(arreglarSql(e.c1, randomUUID()), arreglarSql(e.c1, randomUUID()));
  const cua = stockDe(e, e.C, e.cua);
  const alm = stockDe(e, e.C, e.alm);
  const filas = psql(`select string_agg(estado || '/' || cantidad, ',' order by cantidad) from retail.prendas_danadas where variante_id = '${e.C}';`);
  const pendiente = Number(psql(`select coalesce(sum(cantidad), 0) from retail.prendas_danadas where variante_id = '${e.C}' and estado = 'en_cuarentena';`));
  const ok =
    s1.code === 0 && s2.code !== 0 && s2.stderr.includes("arreglo_ya_resuelta") && s2.stderr.includes("«Se arregló»") &&
    sinDeadlock(s1, s2) && cua === 2 && cua === pendiente && alm - almAntes === 1 && filas === "se_arreglo/1,en_cuarentena/2" && s2.ms > 900;
  esperar("K3 · dos líderes «Se arregló» a la vez sobre la misma dañada: uno pasa, el otro «ya se resolvió», y la cuarentena cuadra con la otra dañada",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · cuarentena=${cua} pendiente=${pendiente} almacén+${alm - almAntes} filas=${filas}`);
}

async function k4(e) {
  const resolver = `select retail.resolver_prenda_danada('${e.d1}', 'se_boto', 'Sin arreglo');`;
  const [s1, s2] = await carrera(arreglarSql(e.d1, randomUUID()), resolver);
  const estado = psql(`select estado from retail.prendas_danadas where id = '${e.d1}';`);
  const ok =
    s1.code === 0 && s2.code !== 0 && /ERROR:\s+Esta prenda ya se resolvió como se_arreglo$/m.test(s2.stderr) &&
    estado === "se_arreglo" && stockDe(e, e.D, e.cua) === 0 && stockDe(e, e.D, e.alm) === 1 && s2.ms > 900;
  esperar("K4 · «Se arregló» contra «Se botó» la misma dañada: gana la primera; la segunda dice «ya se resolvió como se_arreglo» (lo que la pantalla traduce)",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · estado=${estado}`);
}

async function k5(e) {
  // Gana el reporte: el apartado ya no encuentra la libre.
  const [a1, a2] = await carrera(reportarSql(e, e.E, 1, randomUUID()), apartarSql(e, e.E));
  const okReporte =
    a1.code === 0 && a2.code !== 0 && sinDeadlock(a1, a2) &&
    stockDe(e, e.E, e.piso) === 0 && stockDe(e, e.E, e.cua) === 1 && apartadasDe(e, e.E, e.piso) === 0;
  esperar("K5 · reportar y después apartar la última libre: gana el reporte y el apartado no alcanza (nunca se usa dos veces)",
    okReporte, `a1=${a1.code} ${a1.stderr.trim()} · a2=${a2.code} ${a2.stderr.trim()} · piso=${stockDe(e, e.E, e.piso)} cuarentena=${stockDe(e, e.E, e.cua)}`);
  // Gana el apartado: el reporte dice que no hay libres y por qué.
  const [b1, b2] = await carrera(apartarSql(e, e.F), reportarSql(e, e.F, 1, randomUUID()));
  const okApartado =
    b1.code === 0 && b2.code !== 0 && b2.stderr.includes("danada_sin_alcance") && b2.stderr.includes("hay 0 libres (1 apartada para un cliente") &&
    sinDeadlock(b1, b2) && stockDe(e, e.F, e.piso) === 1 && apartadasDe(e, e.F, e.piso) === 1 && stockDe(e, e.F, e.cua) === 0;
  esperar("K5 · apartar y después reportar la última libre: gana el apartado y el reporte dice «hay 0 libres (1 apartada…)»",
    okApartado, `b1=${b1.code} ${b1.stderr.trim()} · b2=${b2.code} ${b2.stderr.trim()} · piso=${stockDe(e, e.F, e.piso)} apartadas=${apartadasDe(e, e.F, e.piso)}`);
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No encuentro el contenedor ${CONTENEDOR_LOCAL}.`);
    process.exit(1);
  }
  const e = preparar();
  await k1(e);
  await k2(e);
  await k3(e);
  await k4(e);
  await k5(e);
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
