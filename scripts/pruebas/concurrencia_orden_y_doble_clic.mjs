#!/usr/bin/env node
/**
 * Prueba de ADR-0190 — candados en orden y doble clic
 * (`20260924130000_concurrencia_orden_y_doble_clic.sql`).
 *
 * QUÉ CUBRE
 *   · Dos sesiones reales: una operación que ya tiene tomada la prenda A (y después pide la B, como una venta de [A, B])
 *     contra `iniciar_traslado` y `registrar_venta` con el carrito al revés [B, A]. Antes de ADR-0190 Postgres cancelaba
 *     una de las dos (deadlock 40P01); ahora la segunda espera a la primera entera y termina bien.
 *   · Doble clic: el mismo `p_token` dos veces en `iniciar_traslado`, `recibir_lote`, `registrar_movimiento_caja`,
 *     `apartar_stock` y `recibir_insumo` devuelve el MISMO id y mueve stock/dinero una sola vez; otro token, otra fila;
 *     sin token, como antes.
 *   · Dos sesiones con el mismo token: la segunda espera a la primera (candado del token).
 *   · Las 5 funciones con parámetro nuevo quedan sin sobrecarga y con los mismos permisos (authenticated, no anon); las
 *     8 que pre-bloquean llevan la llamada.
 *
 * CÓMO. Mismo patrón que `caja_cierre_traslado.mjs` y la prueba de concurrencia de `fn_aplicar_movimiento.mjs`: cada
 * escenario en su transacción con ROLLBACK (nunca se commitea nada en el Postgres local compartido), sesión simulada con
 * `request.jwt.claim.sub`. Las pruebas de dos sesiones usan stock YA commiteado de Tienda Lima (solo se bloquea, nunca se
 * cambia fuera de la transacción que se revierte).
 *
 * USO
 *   pnpm pruebas:concurrencia-orden-doble-clic    → con la migración ya aplicada en el local
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );
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
    if (detalle) console.log(`    ${String(detalle).slice(0, 1500).replace(/\n/g, "\n    ")}`);
  }
}

function caso(nombre, sql, esperado) {
  const r = correr(sql);
  const ok = r.ok && r.salida.split("\n").pop() === esperado;
  esperar(nombre, ok, r.ok ? `esperaba «${esperado}», salió «${r.salida}»` : r.mensaje);
}

const LIDER = `begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n`;

// ---------------------------------------------------------------------------
// 1. La forma: sin sobrecargas, mismos permisos, pre-bloqueo presente
// ---------------------------------------------------------------------------

const CON_TOKEN = ["iniciar_traslado", "recibir_lote", "registrar_movimiento_caja", "apartar_stock", "recibir_insumo"];
const CON_PREBLOQUEO = [
  "registrar_venta", "separar_prendas", "entregar_separacion", "aprobar_devolucion",
  "recibir_compras", "recibir_envio", "iniciar_traslado", "recibir_lote",
];

function pruebasDeForma() {
  caso(
    "las 5 funciones con token tienen UNA sola versión, con p_token al final",
    `begin;
select bool_and(n = 1 and ultimo = 'p_token') from (
  select p.proname, count(*) over (partition by p.proname) as n, p.proargnames[array_upper(p.proargnames, 1)] as ultimo
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = any(array['${CON_TOKEN.join("','")}'])
) x;`,
    "t"
  );
  caso(
    "las 5 conservan sus permisos: authenticated sí; anon solo donde ya estaba (recibir_lote y registrar_movimiento_caja vienen con PUBLIC)",
    `begin;
select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
  and has_function_privilege('anon', p.oid, 'execute') = (p.proname in ('recibir_lote', 'registrar_movimiento_caja')))
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = any(array['${CON_TOKEN.join("','")}']);`,
    "t"
  );
  caso(
    "las 8 funciones que mueven varias prendas pre-bloquean en orden",
    `begin;
select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = any(array['${CON_PREBLOQUEO.join("','")}'])
  and pg_get_functiondef(p.oid) like '%fn_bloquear_en_orden(%';`,
    String(CON_PREBLOQUEO.length)
  );
  caso(
    "nadie puede llamar directo a fn_bloquear_en_orden",
    `begin;
select has_function_privilege('authenticated', 'retail.fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[])', 'execute');`,
    "f"
  );
  caso(
    "fn_ids_de_items: ids sin repetir, ignora nulos y tolera algo que no es lista",
    `begin;
select concat_ws(',',
  cardinality(retail.fn_ids_de_items('[{"variante_id":"22222222-2222-4222-8222-000000000001"},{"variante_id":"22222222-2222-4222-8222-000000000001"},{"variante_id":null},{"cantidad":1}]'::jsonb)),
  cardinality(retail.fn_ids_de_items('{"variante_id":"22222222-2222-4222-8222-000000000001"}'::jsonb)),
  cardinality(retail.fn_ids_de_items(null)));`,
    "1,0,0"
  );
}

// ---------------------------------------------------------------------------
// 2. Doble clic (una sesión, rollback)
// ---------------------------------------------------------------------------

const ESCENA = `
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prov from retail.proveedores order by created_at limit 1 \\gset
select id as v1 from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'lima', 'traslado_salida') as sub_sal \\gset
select retail.fn_sububicacion_por_defecto(:'lima', 'venta') as sub_venta \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'lima', :'sub_sal', 'entrada', 50, 'prueba ADR-0190: colchón') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'lima', :'sub_venta', 'entrada', 50, 'prueba ADR-0190: colchón') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
select gen_random_uuid() as tok \\gset
select gen_random_uuid() as tok2 \\gset
`;
const stockLima = `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'lima')`;
const ITEMS = `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2))`;

function pruebasDeDobleClic() {
  caso(
    "iniciar_traslado: el mismo token dos veces → el mismo traslado y el stock baja UNA vez",
    `${LIDER}${ESCENA}
select ${stockLima} as antes \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day', null, :'tok') as t1 \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day', null, :'tok') as t2 \\gset
select concat_ws(',', :'t1' = :'t2', :antes - ${stockLima}, (select count(*) from retail.transferencias where token_cliente = :'tok'));`,
    "t,2,1"
  );
  caso(
    "iniciar_traslado: otro token → otro traslado; sin token → como antes (dos traslados)",
    `${LIDER}${ESCENA}
select ${stockLima} as antes \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day', null, :'tok') as t1 \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day', null, :'tok2') as t2 \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day') as t3 \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day') as t4 \\gset
select concat_ws(',', :'t1' <> :'t2', :'t3' <> :'t4', :antes - ${stockLima});`,
    "t,t,8"
  );
  caso(
    "recibir_lote: el mismo token dos veces → el mismo lote y el stock sube UNA vez",
    `${LIDER}${ESCENA}
select ${stockLima} as antes \\gset
select retail.recibir_lote(:'lima', :'prov', ${ITEMS}, null, null, :'tok') as l1 \\gset
select retail.recibir_lote(:'lima', :'prov', ${ITEMS}, null, null, :'tok') as l2 \\gset
select concat_ws(',', :'l1' = :'l2', ${stockLima} - :antes, (select count(*) from retail.lotes where token_cliente = :'tok'));`,
    "t,2,1"
  );
  caso(
    "registrar_movimiento_caja: un retiro de S/ 200 con doble clic queda registrado UNA vez",
    `${LIDER}${ESCENA}
select (select count(*) from (
  select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'lima' and estado = 'abierta'
) x) as _previa \\gset
select retail.abrir_caja(:'lima', 100.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 200, 'Depósito bancario', 'Voucher-0190', false, :'tok') as c1 \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 200, 'Depósito bancario', 'Voucher-0190', false, :'tok') as c2 \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 200, 'Depósito bancario', 'Voucher-0190', false, :'tok2') as c3 \\gset
select concat_ws(',', :'c1' = :'c2', :'c1' <> :'c3', (select count(*) from retail.caja_movimientos where caja_id = :'caja' and monto = 200));`,
    "t,t,2"
  );
  caso(
    "apartar_stock: el mismo token dos veces → el mismo apartado y se aparta UNA vez",
    `${LIDER}${ESCENA}
select (select coalesce(sum(cantidad_apartada), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'lima') as antes \\gset
select retail.apartar_stock(:'v1', :'lima', 1, 'Clienta prueba', '999999999', retail.fn_hoy_lima() + 3, null, null, :'tok') as a1 \\gset
select retail.apartar_stock(:'v1', :'lima', 1, 'Clienta prueba', '999999999', retail.fn_hoy_lima() + 3, null, null, :'tok') as a2 \\gset
select concat_ws(',', :'a1' = :'a2',
  (select coalesce(sum(cantidad_apartada), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'lima') - :antes,
  (select count(*) from retail.apartados where token_cliente = :'tok'));`,
    "t,1,1"
  );
  caso(
    "recibir_insumo: el mismo token dos veces → el mismo lote de insumo",
    `${LIDER}${ESCENA}
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-0190', 'Lino ADR-0190', 'tela', 'metro') returning id as ins \\gset
select retail.recibir_insumo(:'ins', :'taller', 10, 200, 'L-0190', null, null, 'compra', null, :'tok') as i1 \\gset
select retail.recibir_insumo(:'ins', :'taller', 10, 200, 'L-0190', null, null, 'compra', null, :'tok') as i2 \\gset
select concat_ws(',', :'i1' = :'i2', (select count(*) from retail.insumo_lotes where insumo_id = :'ins'));`,
    "t,1"
  );
  caso(
    "un intento que falla no gasta el token: se corrige y el mismo token guarda",
    `${LIDER}${ESCENA}
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
select pg_temp.intento(format('select retail.iniciar_traslado(%L, %L, %L::jsonb, now() + interval ''1 day'', null, %L)',
  :'lima', :'tru', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 100000))::text, :'tok')) like 'Stock insuficiente%' as fallo \\gset
select retail.iniciar_traslado(:'lima', :'tru', ${ITEMS}, now() + interval '1 day', null, :'tok') as t1 \\gset
select concat_ws(',', :'fallo', (select count(*) from retail.transferencias where token_cliente = :'tok'));`,
    "t,1"
  );
}

// ---------------------------------------------------------------------------
// 3. Dos sesiones
// ---------------------------------------------------------------------------

/** Dos variantes A < B con stock commiteado en la sububicación que usa la operación, sin campaña y vendibles en Lima. */
function elegirPrendas(tipoSub) {
  const r = correr(`begin;
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.fn_sububicacion_por_defecto(:'lima', '${tipoSub}') as sub \\gset
select :'lima' || '|' || string_agg(x.variante_id::text || '~' || x.precio::text, '|' order by x.variante_id) from (
  select s.variante_id, v.precio from retail.stock s join retail.variantes v on v.id = s.variante_id
  where s.ubicacion_id = :'lima' and s.sububicacion_id is not distinct from nullif(:'sub', '')::uuid
    and s.cantidad - s.cantidad_apartada >= 1 and v.activo
    and v.id <> '22222222-2222-4222-8222-222222222222'
    and retail.fn_variante_permitida_en_sede(v.id, :'lima')
    and not exists (select 1 from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, array[v.id]))
  order by s.variante_id limit 2
) x;`);
  if (!r.ok) throw new Error(r.mensaje);
  const [lima, ...vs] = r.salida.split("\n").pop().split("|");
  if (vs.length < 2) throw new Error(`No hay dos prendas con stock commiteado en Tienda Lima (${tipoSub})`);
  const [a, b] = vs.map((s) => {
    const [id, precio] = s.split("~");
    return { id, precio };
  });
  return { lima, a, b };
}

/**
 * La sesión «rival» imita a una venta de [A, B] que ya tomó A: bloquea las filas de A, espera, y recién entonces pide B.
 * La sesión «probada» corre la función con el carrito AL REVÉS [B, A]. Con el recorrido en orden de carrito, la probada
 * toma B y espera A → la rival pide B → bloqueo mutuo. Con el pre-bloqueo, la probada espera A sin tener nada tomado.
 */
async function carrera(nombre, { lima, a, b }, llamada, preparar = "") {
  const rival = `
begin;
select count(*) from (select 1 from retail.stock where ubicacion_id = '${lima}' and variante_id = '${a.id}' order by sububicacion_id for update) x;
select pg_sleep(3);
select count(*) from (select 1 from retail.stock where ubicacion_id = '${lima}' and variante_id = '${b.id}' order by sububicacion_id for update) x;
select pg_sleep(0.3);
rollback;
`;
  const probada = `
${LIDER}${preparar}
select 'LISTO';
${llamada}
select 'TERMINO';
rollback;
`;
  const p1 = psqlAsync(rival);
  await dormir(400);
  const p2 = psqlAsync(probada);
  const [r1, r2] = await Promise.all([p1, p2]);
  const todo = `${r1.stdout}${r1.stderr}${r2.stdout}${r2.stderr}`.toLowerCase();
  const sinDeadlock = !todo.includes("deadlock");
  const ambasBien = r1.code === 0 && r2.code === 0 && r2.stdout.includes("TERMINO");
  const esperoALaRival = r2.ms > 2000;
  esperar(nombre, sinDeadlock && ambasBien && esperoALaRival,
    `sin_deadlock=${sinDeadlock} ambas_bien=${ambasBien} esperó=${esperoALaRival} (${r2.ms} ms)\n` +
      `rival: ${r1.stderr.trim()}\nprobada: ${r2.stderr.trim()}`);
}

async function pruebasDeDosSesiones() {
  const tr = elegirPrendas("traslado_salida");
  await carrera(
    "dos sesiones: iniciar_traslado de [B, A] contra otra operación que va por [A, B] — sin bloqueo mutuo",
    tr,
    `select retail.iniciar_traslado('${tr.lima}', (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'),
  jsonb_build_array(jsonb_build_object('variante_id', '${tr.b.id}', 'cantidad', 1), jsonb_build_object('variante_id', '${tr.a.id}', 'cantidad', 1)),
  now() + interval '1 day');`
  );

  const ve = elegirPrendas("venta");
  const total = (Number(ve.a.precio) + Number(ve.b.precio)).toFixed(2);
  await carrera(
    "dos sesiones: registrar_venta de [B, A] contra otra venta de [A, B] — sin bloqueo mutuo",
    ve,
    `select retail.registrar_venta('${ve.lima}',
  jsonb_build_array(jsonb_build_object('variante_id', '${ve.b.id}', 'cantidad', 1, 'precio_unitario', ${ve.b.precio}),
                    jsonb_build_object('variante_id', '${ve.a.id}', 'cantidad', 1, 'precio_unitario', ${ve.a.precio})),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${total})));`,
    `select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = '${ve.lima}' and estado = 'abierta'
) x) as _previa \\gset
select retail.abrir_caja('${ve.lima}', 100.00, 'prueba automatizada') as _caja \\gset
`
  );

  // El mismo token en dos sesiones: la segunda espera el candado del token hasta que la primera termina.
  const tok = crypto.randomUUID();
  const llamada = `select retail.iniciar_traslado('${tr.lima}', (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'),
  jsonb_build_array(jsonb_build_object('variante_id', '${tr.a.id}', 'cantidad', 1)), now() + interval '1 day', null, '${tok}');`;
  const p1 = psqlAsync(`${LIDER}${llamada}\nselect pg_sleep(1.5);\nrollback;\n`);
  await dormir(400);
  const p2 = psqlAsync(`${LIDER}${llamada}\nselect 'TERMINO';\nrollback;\n`);
  const [s1, s2] = await Promise.all([p1, p2]);
  esperar(
    "dos sesiones con el mismo token: la segunda espera a la primera (y como la primera se revirtió, guarda la suya)",
    s1.code === 0 && s2.code === 0 && s2.stdout.includes("TERMINO") && s2.ms > 900,
    `s1=${s1.code} ${s1.stderr.trim()} · s2=${s2.code} ${s2.stderr.trim()} (${s2.ms} ms)`
  );
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No encuentro el contenedor ${CONTENEDOR_LOCAL}. ¿Está corriendo \`npx supabase start\`?`);
    process.exit(1);
  }
  const soloCarrera = process.argv.includes("--solo-carrera");
  if (!soloCarrera) {
    pruebasDeForma();
    pruebasDeDobleClic();
  }
  try {
    await pruebasDeDosSesiones();
  } catch (e) {
    esperar("pruebas de dos sesiones", false, e.message ?? e);
  }
  console.log(`\n${total - fallos}/${total} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
