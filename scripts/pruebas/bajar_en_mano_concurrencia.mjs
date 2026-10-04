#!/usr/bin/env node
/**
 * Prueba de concurrencia de ADR-0328, actividad 9 — `bajar_en_mano` («La tengo en la mano») con dos conexiones reales y
 * COMMIT.
 *
 * POR QUÉ APARTE. `bajar_en_mano.mjs` corre todo en ROLLBACK, y así no se ve lo que pasa cuando la PRIMERA llamada ya se
 * guardó (una transacción sin commit es invisible para la otra). La revisión adversarial lo encontró: quitar el candado de la
 * prenda (`fn_bloquear_en_orden`) o cambiar la clave del candado de la marca dejaba las 39 pruebas en verde. Esta prueba SÍ
 * commitea, y por eso solo corre en una base desechable: aborta si no se le pasa `BASE_DESECHABLE=1`. No va en el CI (su
 * Postgres es compartido por todos los pasos) y no limpia lo que deja (movimientos no se borra): cada corrida crea sus propias
 * prendas (producto «Blusa Mano Carrera <marca>») y solo cuenta sus filas.
 *
 * QUÉ CUBRE (la primera conexión toma el candado y se queda 1,5 s antes del commit; la segunda llega 0,4 s después)
 *   K1 la MISMA marca desde dos conexiones (doble toque, reintento tras un corte) → una corrección y una bajada; la segunda
 *      ESPERA el candado de la marca (la misma clave que `bajar_al_piso`) y responde `ya_registrada`.
 *   K2 dos marcas, la misma prenda, almacén 0 (dos asesoras con dos prendas iguales) → las dos corrigen y cuelgan: piso 2,
 *      almacén 0, dos correcciones, sin 40P01.
 *   K3 dos marcas, la misma prenda, almacén con 1 libre → la primera cuelga SIN corregir; la segunda ESPERA el candado de la
 *      prenda, lee el almacén ya en 0 y corrige. Ninguna falla. Sin el candado, la segunda leería «1 libre», no corregiría y
 *      `bajar_al_piso` la rechazaría con «pides 1 y en el almacén hay 0».
 *   K4 una bajada escaneada (`bajar_al_piso`) de la única libre contra «en la mano» de la misma prenda → la escaneada se
 *      lleva la libre y la de la mano corrige: piso 2, almacén 0, una corrección, sin 40P01.
 *   Al final, `fn_verificar_bajadas` y `fn_verificar_bajadas_en_mano` no ven nada de estas prendas.
 *
 * USO
 *   BASE_DESECHABLE=1 pnpm pruebas:bajar-en-mano-concurrencia    → SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA correcciones y bajadas reales (movimientos no se puede borrar). Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 pnpm pruebas:bajar-en-mano-concurrencia"
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

// El líder, sin terminal: firma él mismo (fn_actor_persona_id(true) sin x-responsable).
const LIDER = `begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

/**
 * Prendas propias con historia COMMITEADA en el almacén de Trujillo: A, B y D en 0 (tuvieron 1 y se fue), C y E con 1 libre.
 * Devuelve ids y la tienda.
 */
function preparar() {
  const marca = Date.now().toString(36);
  const salida = psql(`
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'tru', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Mano Carrera ${marca}', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as p1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'p1', t.id, :'color', 'MANOC-${marca}-' || t.n, 50 from (select id, row_number() over (order by valor, id) n from retail.tallas) t where t.n <= 5;
-- Todas entran con 1 al almacén; A, B y D se van (historia, almacén 0); C y E se quedan con 1 libre.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v.id, :'tru', :'alm', 'entrada', 1, 'prueba de carrera en la mano: llega' from retail.variantes v where v.producto_id = :'p1';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v.id, :'tru', :'alm', 'salida', 1, 'prueba de carrera en la mano: se fue'
    from retail.variantes v where v.producto_id = :'p1' and v.sku in ('MANOC-${marca}-1', 'MANOC-${marca}-2', 'MANOC-${marca}-4');
select count(*) as _n from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  join retail.variantes v on v.id = m.variante_id where v.producto_id = :'p1' order by m.created_at, m.tipo) x \\gset
commit;
select :'tru' || '|' || :'alm' || '|' || :'piso';
select string_agg(id::text, '|' order by sku) from retail.variantes where sku like 'MANOC-${marca}-%';
`);
  const [tienda, prendas] = salida.split("\n").slice(-2);
  const [tru, alm, piso] = tienda.split("|");
  const [A, B, C, D, E] = prendas.split("|");
  return { tru, alm, piso, A, B, C, D, E, todas: [A, B, C, D, E] };
}

const stockDe = (e, v, sub) =>
  Number(psql(`select coalesce((select cantidad from retail.stock where variante_id = '${v}' and ubicacion_id = '${e.tru}' and sububicacion_id = '${sub}'), 0);`));
const ajustesDe = (v) =>
  Number(psql(`select count(*) from retail.movimientos where tipo = 'ajuste' and motivo = 'reposicion' and variante_id = '${v}';`));
const manoSql = (e, v, tok) => `select retail.bajar_en_mano('${e.tru}', '${v}', null, '${tok}');`;
const bajarSql = (e, v, tok) =>
  `select retail.bajar_al_piso('${e.tru}', '${JSON.stringify([{ variante_id: v, cantidad: 1 }])}'::jsonb, '${tok}');`;
const sinBloqueo = (...s) => !s.map((x) => `${x.stdout}${x.stderr}`.toLowerCase()).join("").match(/deadlock|40p01/);

/** Corre `primero` (que espera 1,5 s antes del commit) y, 0,4 s después, `segundo`. */
async function carrera(primero, segundo) {
  const p1 = psqlAsync(`${LIDER}${primero}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${segundo}\ncommit;\n`);
  return Promise.all([p1, p2]);
}

async function k1(e) {
  const tok = randomUUID();
  const [s1, s2] = await carrera(manoSql(e, e.A, tok), manoSql(e, e.A, tok));
  const [r1] = jsons(s1.stdout);
  const [r2] = jsons(s2.stdout);
  const filas = psql(`select concat_ws(',', (select count(*) from retail.bajadas_piso where token_cliente = '${tok}'),
    (select count(*) from retail.bajadas_en_mano m join retail.bajadas_piso b on b.id = m.bajada_id where b.token_cliente = '${tok}'));`);
  const ok =
    s1.code === 0 && s2.code === 0 && r1 && r2 &&
    r1.ya_registrada === false && r1.corregida === true && r2.ya_registrada === true && r1.bajada_id === r2.bajada_id &&
    filas === "1,1" && ajustesDe(e.A) === 1 && stockDe(e, e.A, e.piso) === 1 && stockDe(e, e.A, e.alm) === 0 && s2.ms > 900;
  esperar("K1 · la misma marca desde dos conexiones: una corrección y una bajada; la segunda espera y responde «ya registrada»",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r1=${JSON.stringify(r1)} · r2=${JSON.stringify(r2)} · filas=${filas}`);
}

async function k2(e) {
  const [s1, s2] = await carrera(manoSql(e, e.B, randomUUID()), manoSql(e, e.B, randomUUID()));
  const [r1] = jsons(s1.stdout);
  const [r2] = jsons(s2.stdout);
  const ok =
    s1.code === 0 && s2.code === 0 && sinBloqueo(s1, s2) && r1?.corregida === true && r2?.corregida === true &&
    stockDe(e, e.B, e.piso) === 2 && stockDe(e, e.B, e.alm) === 0 && ajustesDe(e.B) === 2 && s2.ms > 900;
  esperar("K2 · dos marcas, misma prenda, almacén 0: las dos corrigen y cuelgan (piso 2, almacén 0, 2 correcciones), sin 40P01",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r1=${JSON.stringify(r1)} · r2=${JSON.stringify(r2)}`);
}

async function k3(e) {
  const [s1, s2] = await carrera(manoSql(e, e.C, randomUUID()), manoSql(e, e.C, randomUUID()));
  const [r1] = jsons(s1.stdout);
  const [r2] = jsons(s2.stdout);
  const ok =
    s1.code === 0 && s2.code === 0 && sinBloqueo(s1, s2) && r1?.corregida === false && r2?.corregida === true &&
    stockDe(e, e.C, e.piso) === 2 && stockDe(e, e.C, e.alm) === 0 && ajustesDe(e.C) === 1 && s2.ms > 900;
  esperar("K3 · almacén con 1 libre: la primera cuelga sin corregir; la segunda ESPERA el candado de la prenda, ve el 0 y corrige",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r1=${JSON.stringify(r1)} · r2=${JSON.stringify(r2)}`);
}

async function k4(e) {
  const [s1, s2] = await carrera(bajarSql(e, e.E, randomUUID()), manoSql(e, e.E, randomUUID()));
  const [r2] = jsons(s2.stdout);
  const ok =
    s1.code === 0 && s2.code === 0 && sinBloqueo(s1, s2) && r2?.corregida === true &&
    stockDe(e, e.E, e.piso) === 2 && stockDe(e, e.E, e.alm) === 0 && ajustesDe(e.E) === 1 && s2.ms > 900;
  esperar("K4 · una bajada escaneada de la única libre contra «en la mano» de la misma prenda: piso 2, almacén 0, 1 corrección, sin 40P01",
    ok, `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · r2=${JSON.stringify(r2)}`);
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
  const ids = `array['${e.todas.join("','")}']::uuid[]`;
  const diagnostico = psql(`select concat_ws(',',
    (select count(*) from retail.fn_verificar_bajadas() v join retail.bajada_piso_items i on i.bajada_id = v.bajada_id where i.variante_id = any (${ids})),
    (select count(*) from retail.fn_verificar_bajadas_en_mano()));`);
  esperar("los diagnósticos (fn_verificar_bajadas y fn_verificar_bajadas_en_mano) no ven nada de estas carreras", diagnostico === "0,0", diagnostico);
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
