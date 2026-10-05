#!/usr/bin/env node
/**
 * Prueba de concurrencia de «Cerrar la cola de arranque» (ADR-0334) — `cerrar_cola_arranque` con dos conexiones reales y COMMIT.
 *
 * POR QUÉ APARTE. `cola_arranque.mjs` corre todo en ROLLBACK; así no se puede ver qué pasa cuando la PRIMERA operación ya se
 * guardó (una transacción sin commit es invisible para la otra). Esta SÍ commitea, y por eso solo corre en una base
 * desechable: aborta si no se le pasa `BASE_DESECHABLE=1`. No va en el CI (su Postgres es compartido por todos los pasos) y no
 * limpia lo que deja: cada corrida vende sus propias prendas sin registrar y solo cuenta las suyas.
 *
 * QUÉ CUBRE
 *   C1 dos cierres de la misma sede al mismo tiempo → UN solo cierre con las prendas; el segundo espera el candado de las
 *      filas y, al despertar, no encuentra nada pendiente: `cola_vacia` (nunca un cierre vacío ni prendas cerradas dos veces).
 *   C2 un `regularizar_prenda` en marcha sobre una fila y un cierre en bloque a la vez → gana quien llegó primero a la fila: la
 *      regularizada se queda regularizada (el cierre no la pisa) y el cierre cuenta solo las demás.
 *   C3 dos líderes confirman la MISMA sugerencia (`regularizar_prendas_sugeridas`) a la vez → se regulariza una sola vez, el stock baja
 *      exactamente 1 y el segundo recibe `prenda_ya_regularizada` (nunca un doble descuento).
 *
 * USO
 *   BASE_DESECHABLE=1 pnpm pruebas:cola-arranque-concurrencia    → SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";

if (process.env.BASE_DESECHABLE !== "1") {
  console.error(
    "Esta prueba COMMITEA ventas y cierres reales. Córrela solo contra un Postgres desechable:\n" +
      "  BASE_DESECHABLE=1 pnpm pruebas:cola-arranque-concurrencia"
  );
  process.exit(1);
}

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed): opera cualquier tienda
const CENTINELA = "22222222-2222-4222-8222-222222222222";
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

/** Vende `n` prendas sin registrar en Tienda Lima, COMMITEADAS, con las anteriores apartadas hacia el futuro.
 *  Con `comoV1`, las ventas llevan la categoría, talla y color de BLU-EMMA-NEG-M (:v1): son las que una sugerencia puede unir a ella. */
function preparar(n, comoV1 = false) {
  const salida = psql(`
begin;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
set local request.jwt.claim.sub = '${FELIPE}';
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba de concurrencia') as caja_id \\gset
-- Lo que ya estuviera pendiente (corridas anteriores, otra sesión) se aparta: el cierre solo ve lo de esta corrida.
update retail.prendas_por_regularizar set vendido_en = now() + interval '1 day' where ubicacion_id = :'ubic' and estado = 'pendiente';
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'prueba de concurrencia de la cola de arranque') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
${comoV1 ? `select pr.categoria_id as cat, v.talla_id as talla, v.color_codigo as color from retail.variantes v join retail.productos pr on pr.id = v.producto_id where v.id = :'v1' \\gset` : ""}
${Array.from({ length: n }, (_, i) => `
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', ${40 + i}, 'descuento_unitario', 0,
    'descripcion_libre', 'Blusa concurrencia ${i}', 'categoria_id', :'cat', 'talla_id', :'talla', 'color_codigo', :'color')),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${40 + i})),
  null, gen_random_uuid()) as venta_${i} \\gset`).join("")}
commit;
select :'ubic' || '|' || :'v1';
select string_agg(p.id::text, '|' order by p.id) from retail.prendas_por_regularizar p
  where p.ubicacion_id = :'ubic' and p.estado = 'pendiente' and p.vendido_en <= now();
`);
  const [ubicv1, ids] = salida.split("\n").slice(-2);
  const [ubic, v1] = ubicv1.split("|");
  return { ubic, v1, ids: ids.split("|") };
}

const cerrarSql = (e) => `select retail.cerrar_cola_arranque('${e.ubic}', now(), 'no_se_sabe', null);`;

async function c1() {
  const e = preparar(3);
  const p1 = psqlAsync(`${LIDER}${cerrarSql(e)}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${cerrarSql(e)}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const cierres = psql(`select count(distinct cierre_id), count(*) from retail.prendas_por_regularizar where id in ('${e.ids.join("','")}') and estado = 'cerrada_sin_prenda';`);
  const filas = psql(`select filas from retail.cierres_cola_arranque where id = (select cierre_id from retail.prendas_por_regularizar where id = '${e.ids[0]}');`);
  const ok = s1.code === 0 && s2.code !== 0 && s2.stderr.includes("cola_vacia") && s2.ms > 900 && cierres === "1|3" && filas === "3";
  esperar("C1 · dos cierres a la vez: un solo cierre con las 3 prendas; el segundo espera y recibe «cola_vacia»", ok,
    `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · cierres|cerradas=${cierres} · filas=${filas}`);
}

async function c2() {
  const e = preparar(3);
  const [r1] = e.ids;
  const regulariza = `select retail.regularizar_prenda('${r1}', '${e.v1}', 'ya_registrada');`;
  const p1 = psqlAsync(`${LIDER}${regulariza}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${cerrarSql(e)}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const estados = psql(`select string_agg(estado, ',' order by id) from retail.prendas_por_regularizar where id in ('${e.ids.join("','")}');`);
  const orden = e.ids.map((_, i) => (i === 0 ? "regularizada" : "cerrada_sin_prenda")).join(",");
  const filas = psql(`select filas from retail.cierres_cola_arranque where id = (select cierre_id from retail.prendas_por_regularizar where id = '${e.ids[1]}');`);
  const todo = `${s1.stderr}${s2.stderr}`.toLowerCase();
  const ok = s1.code === 0 && s2.code === 0 && !todo.includes("deadlock") && s2.ms > 900 && estados === orden && filas === "2";
  esperar("C2 · regularizar una fila mientras se cierra la cola: la regularizada se queda regularizada y el cierre cuenta solo 2", ok,
    `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · estados=${estados} (esperado ${orden}) · filas=${filas}`);
}

async function c3() {
  const e = preparar(1, true);
  const [r1] = e.ids;
  const stock = () => Number(psql(`select coalesce(sum(cantidad), 0) from retail.stock where variante_id = '${e.v1}' and ubicacion_id = '${e.ubic}';`));
  const antes = stock();
  const confirma = `select retail.regularizar_prendas_sugeridas('${e.ubic}', '[{"prenda_id":"${r1}","variante_id":"${e.v1}"}]'::jsonb);`;
  const p1 = psqlAsync(`${LIDER}${confirma}\nselect pg_sleep(1.5);\ncommit;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${confirma}\ncommit;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  const estado = psql(`select estado from retail.prendas_por_regularizar where id = '${r1}';`);
  const baja = antes - stock();
  const ok = s1.code === 0 && s2.code !== 0 && s2.stderr.includes("prenda_ya_regularizada") && s2.ms > 900 && estado === "regularizada" && baja === 1;
  esperar("C3 · dos líderes confirman la MISMA sugerencia a la vez: se regulariza una vez, el stock baja exactamente 1 y la segunda recibe «prenda_ya_regularizada»", ok,
    `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms) · estado=${estado} · baja=${baja}`);
}

(async () => {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}.`);
    process.exit(1);
  }
  await c1();
  await c2();
  await c3();
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
})();
