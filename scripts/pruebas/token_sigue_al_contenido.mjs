#!/usr/bin/env node
/**
 * Prueba de «el token sigue al contenido» (`20261013200000_token_sigue_al_contenido_parte1.sql` y `…_parte2.sql`).
 *
 * EL PROBLEMA QUE PRUEBA. /chaos (2026-10-13) vio que, tras una respuesta perdida, la pantalla reusaba el mismo token con
 * OTRO contenido (una prenda menos en el ticket, otro apartado) y la base devolvía lo que guardó el primer envío: la
 * pantalla anunciaba algo que no quedó guardado. Aquí, para cada una de las diez funciones de Ventas y Caja con token:
 *   · el mismo token con el MISMO contenido devuelve lo mismo (el reintento de siempre sigue funcionando);
 *   · el mismo token con OTRO contenido se rechaza con `token_reusado`;
 * (y `separar_pedido_para_apartar`, que busca su token antes de llamar a `separar_prendas`);
 * con controles (sin la llamada a `fn_intento_con_huella`, la venta y el pedido devuelven lo viejo: el hueco existía), y
 * `fn_resolver_intento`: «hecho» con lo guardado, «no llegó» definitivo (si aparece después, `intento_descartado`), otra
 * tienda no mira, y un resolver que llega mientras el envío todavía guarda espera a que termine.
 *
 * MISMO PATRÓN que `separaciones.mjs`: `docker exec … psql`, `set local request.jwt.claim.sub` y ROLLBACK siempre. La
 * prueba de concurrencia abre dos sesiones a la vez y las dos terminan en ROLLBACK.
 *
 * QUÉ DA POR SENTADO. `Tienda Trujillo`, `Tienda Lima` y las variantes `BLU-EMMA-NEG-M` y `BLU-EMMA-NEG-L` del seed; Felipe
 * (líder) y Micaela (colaboradora fija en Trujillo).
 *
 * USO: pnpm pruebas:token-sigue-al-contenido   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261013200000_token_sigue_al_contenido_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261013201000_token_sigue_al_contenido_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

/** Corre `sql` (que trae su propio `begin`) y siempre termina en ROLLBACK. Devuelve lo que imprimió y, si falló, el error. */
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

/** El bloque que la parte 2 inserta en `funcion`, para deshacerlo dentro de una transacción (los controles). */
function bloqueDe(funcion) {
  const m = PARTE2.match(new RegExp(`'retail\\.${funcion}\\(([^']*)\\)',\\s*\\$v\\$[^$]*\\$v\\$, \\d+,\\s*\\$v\\$([\\s\\S]*?)\\$v\\$,`));
  if (!m) throw new Error(`no encontré el bloque del token de ${funcion}`);
  return { firma: `retail.${funcion}(${m[1]})`, bloque: m[2] };
}
const FUNCIONES = ["registrar_venta", "entregar_separacion", "registrar_movimiento_caja", "registrar_ingreso_caja", "registrar_gasto",
  "separar_prendas", "abonar_separacion", "editar_separacion", "enviar_pedido_para_apartar", "registrar_cambio", "separar_pedido_para_apartar"];
const sinToken = (funcion) => {
  const { firma, bloque } = bloqueDe(funcion);
  return `do $d$ begin execute replace(pg_get_functiondef('${firma}'::regprocedure), $b$${bloque}$b$, ''); end $d$;\n`;
};

// Preparación como Felipe: caja propia en Trujillo, stock de sobra de dos tallas, series propias y, en Lima, un almacén
// con la prenda (para los pedidos a otra tienda). Al final, `quien` pasa a ser la sesión.
function preparar(quien = FELIPE) {
  return `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'ubic'::uuid]) u
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'ubic'::uuid, :'lima'::uuid]) u
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT98' when 'factura' then 'FT98' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as w from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
select retail.fn_sububicacion_por_defecto(:'lima', 'traslado_salida') as alm_lima \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'w', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'lima', :'alm_lima', 'entrada', 5, 'colchón de prueba Lima') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2, retail.fn_aplicar_movimiento(:'m3') as _a3 \\gset
select gen_random_uuid() as tok \\gset
set local request.jwt.claim.sub = '${quien}';
`;
}

const items = (cantidad = 1) =>
  `jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', ${cantidad}, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', 0))`;
const yape = (monto) => `jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', ${monto}))`;
const vender = (como, { cantidad = 1, token = ":'tok'", tipo = "null" } = {}) =>
  `select retail.registrar_venta(:'ubic', ${items(cantidad)}, ${yape(`:'precio'::numeric * ${cantidad}`)}, null, ${token}, ${tipo}) as ${como} \\gset\n`;
const separar = (como, { celular = "987111222", token = "null" } = {}) =>
  `select retail.separar_prendas(p_ubicacion_id => :'ubic', p_items => ${items(1)}, p_pagos => ${yape(30)},
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '${celular}',
    p_devolucion_medio => 'yape', p_token => ${token}) as ${como} \\gset\n`;
const pedir = (como) =>
  `select retail.pedir_prenda_para_apartar(:'ubic', :'lima', :'v', 1, 'Ana', 'Lozano', '987111222', 'la quiere para el sábado') as ${como} \\gset\n`;

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}

/**
 * Para una operación: `llamar(como, variante)` arma la llamada con el token de la escena. `'a'` es el contenido de la
 * primera vez y `'b'`, otro contenido. Se prueba: A dos veces devuelve lo mismo; después B con el mismo token se rechaza.
 */
function operacion(nombre, { prep = "", llamar }) {
  const r = correr(`${preparar()}${prep}${llamar("a1", "a")}${llamar("a2", "a")}
select 'mismo|' || (:'a1' = :'a2');
${llamar("b", "b")}`);
  esperar(`${nombre}: el mismo token con el mismo contenido devuelve lo mismo`, r.salida.includes("mismo|true"), r.salida || r.error);
  esperar(`${nombre}: el mismo token con OTRO contenido se rechaza (token_reusado)`, !r.ok && /token_reusado/.test(r.error), r.ok ? `pasó: ${r.salida}` : r.error);
}

// ---------------------------------------------------------------------------------------------------------------------
// Controles: sin la llamada, el hueco existía (lo que la pantalla anunciaba no era lo guardado)
// ---------------------------------------------------------------------------------------------------------------------
{
  const r = correr(`${preparar()}${sinToken("registrar_venta")}${vender("a1", { cantidad: 1 })}${vender("b", { cantidad: 2 })}
select 'hueco|' || (:'a1' = :'b') || '|' || (select sum(cantidad) from retail.venta_items where venta_id = :'b');`);
  esperar("CONTROL: sin la llamada, una venta de 2 prendas con el token de una de 1 recibe la venta VIEJA (de 1 prenda)",
    r.ok && r.salida.includes("hueco|true|1"), r.salida || r.error);
}
{
  const r = correr(`${preparar()}${sinToken("enviar_pedido_para_apartar")}${pedir("p1")}${pedir("p2")}
select retail.enviar_pedido_para_apartar(:'p1', now() + interval '1 day', :'tok') as t1 \\gset
select retail.enviar_pedido_para_apartar(:'p2', now() + interval '1 day', :'tok') as t2 \\gset
select 'hueco|' || (:'t1' = :'t2') || '|' || (select estado from retail.separacion_pedidos where id = :'p2');`);
  esperar("CONTROL: sin la llamada, el segundo pedido queda «en camino» colgado del traslado del primero",
    r.ok && r.salida.includes("hueco|true|en_camino"), r.salida || r.error);
}

// ---------------------------------------------------------------------------------------------------------------------
// Las diez operaciones
// ---------------------------------------------------------------------------------------------------------------------
operacion("registrar_venta", { llamar: (como, v) => vender(como, { cantidad: v === "a" ? 1 : 2 }) });

operacion("entregar_separacion", {
  prep: `${separar("s1")}${separar("s2")}`,
  llamar: (como, v) => `select retail.entregar_separacion(:'${v === "a" ? "s1" : "s2"}', ${yape(":'precio'::numeric - 30")}, :'tok') as ${como} \\gset\n`,
});

operacion("registrar_movimiento_caja", {
  llamar: (como, v) => `select retail.registrar_movimiento_caja(:'caja', 'ingreso', ${v === "a" ? 10 : 20}, 'Otro', 'prueba de token', false, :'tok') as ${como} \\gset\n`,
});

operacion("registrar_ingreso_caja", {
  llamar: (como, v) => `select retail.registrar_ingreso_caja(:'caja', 'otro', ${v === "a" ? 10 : 20}, 'prueba de token', null, null, :'tok') as ${como} \\gset\n`,
});

operacion("registrar_gasto", {
  llamar: (como, v) => `select retail.registrar_gasto(p_ubicacion_id => :'ubic', p_categoria => 'transporte', p_descripcion => 'taxi',
    p_fecha => retail.fn_hoy_lima(), p_monto_total => ${v === "a" ? 10 : 20}, p_medio_pago => 'efectivo', p_caja_id => :'caja', p_token => :'tok') as ${como} \\gset\n`,
});

operacion("separar_prendas", { llamar: (como, v) => separar(como, { celular: v === "a" ? "987111222" : "987111333", token: ":'tok'" }) });

operacion("abonar_separacion", {
  prep: separar("s1"),
  llamar: (como, v) => `select (retail.abonar_separacion(:'s1', ${yape(v === "a" ? 5 : 6)}, false, :'tok') ->> 'abono_id') as ${como} \\gset\n`,
});

operacion("editar_separacion", {
  prep: separar("s1"),
  llamar: (como, v) => `select (retail.editar_separacion(:'s1', '{}'::uuid[], ${items(v === "a" ? 1 : 2)}, :'tok') ->> 'edicion_id') as ${como} \\gset\n`,
});

operacion("enviar_pedido_para_apartar", {
  prep: `${pedir("p1")}${pedir("p2")}`,
  llamar: (como, v) => `select retail.enviar_pedido_para_apartar(:'${v === "a" ? "p1" : "p2"}', now() + interval '1 day', :'tok') as ${como} \\gset\n`,
});

operacion("registrar_cambio", {
  prep: `${vender("venta", { token: "null" })}select id as item from retail.venta_items where venta_id = :'venta' \\gset\n`,
  llamar: (como, v) => `select retail.registrar_cambio(:'item', :'ubic', :'w', 1, null, :'tok', '${v === "a" ? "talla_chica" : "talla_grande"}', 'vendible') as ${como} \\gset\n`,
});

// Apartar lo que llegó de otra tienda: dos pedidos que ya llegaron; el token viaja dentro de `p_datos`.
const recibirPedido = (ped, tr) => `select retail.enviar_pedido_para_apartar(:'${ped}', now() + interval '1 day') as ${tr} \\gset
select retail.registrar_recepcion_traslado(:'${tr}', :'v', 1) as _r_${tr} \\gset
select * from retail.confirmar_traslado(:'${tr}') \\gset
`;
operacion("separar_pedido_para_apartar", {
  prep: `${pedir("p1")}${pedir("p2")}${recibirPedido("p1", "t1")}${recibirPedido("p2", "t2")}`,
  llamar: (como, v) => `select retail.separar_pedido_para_apartar(:'${v === "a" ? "p1" : "p2"}', jsonb_build_object(
    'p_ubicacion_id', :'ubic', 'p_items', ${items(1)}, 'p_pagos', ${yape(30)}, 'p_clienta_nombres', 'Ana',
    'p_clienta_apellidos', 'Lozano', 'p_clienta_celular', '987111222', 'p_devolucion_medio', 'yape', 'p_token', :'tok')) as ${como} \\gset\n`,
});

// La entrada de plata llama por dentro a registrar_movimiento_caja con el MISMO token: su reintento no se confunde.
{
  const r = correr(`${preparar()}
select retail.registrar_ingreso_caja(:'caja', 'otro', 10, 'prueba de token', null, null, :'tok') as a1 \\gset
select retail.registrar_ingreso_caja(:'caja', 'otro', 10, 'prueba de token', null, null, :'tok') as a2 \\gset
select 'uno|' || (:'a1' = :'a2') || '|' || (select count(*) from retail.caja_movimientos where token_cliente = :'tok');`);
  esperar("registrar_ingreso_caja: el reintento de una entrada (que guarda por dentro con el mismo token) deja UN movimiento",
    r.ok && r.salida.includes("uno|true|1"), r.salida || r.error);
}

// ---------------------------------------------------------------------------------------------------------------------
// El resolver
// ---------------------------------------------------------------------------------------------------------------------
{
  const r = correr(`${preparar()}${vender("a1", { tipo: "'boleta'" })}
select retail.fn_resolver_intento('registrar_venta', :'tok') as res \\gset
select 'res|' || (:'res'::jsonb ->> 'estado') || '|' || ((:'res'::jsonb ->> 'venta_id') = :'a1') || '|' || ((:'res'::jsonb ->> 'total')::numeric = :'precio'::numeric)
  || '|' || coalesce(:'res'::jsonb -> 'comprobante' ->> 'tipo', '-');`);
  esperar("resolver: una venta que llegó dice «hecho», con su id, su total y su comprobante",
    r.ok && r.salida.includes("res|hecho|true|true|boleta"), r.salida || r.error);
}
{
  const r = correr(`${preparar()}
select (retail.fn_resolver_intento('registrar_venta', :'tok') ->> 'estado') as r1 \\gset
select (retail.fn_resolver_intento('registrar_venta', :'tok') ->> 'estado') as r2 \\gset
select 'res|' || :'r1' || '|' || :'r2';
${vender("tarde")}`);
  esperar("resolver: «no llegó» es definitivo (preguntar dos veces dice lo mismo)", r.salida.includes("res|no_llego|no_llego"), r.salida || r.error);
  esperar("resolver: un envío que aparece después de un «no llegó» se rechaza (intento_descartado)", !r.ok && /intento_descartado/.test(r.error),
    r.ok ? `pasó: ${r.salida}` : r.error);
}
{
  const r = correr(`${preparar()}
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lima' and estado = 'abierta') x) as _cl \\gset
select retail.abrir_caja(:'lima', 50.00, 'prueba automatizada') as caja_lima \\gset
select retail.registrar_movimiento_caja(:'caja_lima', 'ingreso', 10, 'Otro', 'prueba de token', false, :'tok') as m \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select retail.fn_resolver_intento('registrar_movimiento_caja', :'tok');`);
  esperar("resolver: una colaboradora de Trujillo no mira un envío de Lima", !r.ok && /intento_de_otra_sede/.test(r.error), r.ok ? `pasó: ${r.salida}` : r.error);
}
{
  const r = correr(`${preparar()}
select retail.fn_resolver_intento('borrar_todo', :'tok');`);
  esperar("resolver: una operación que no conoce se rechaza", !r.ok && /operacion_desconocida/.test(r.error), r.ok ? `pasó: ${r.salida}` : r.error);
}

// ---------------------------------------------------------------------------------------------------------------------
// Concurrencia: el resolver llega mientras el envío todavía guarda. Espera y responde lo que pasó (aquí el envío se
// deshace, así que «no llegó»). Las dos sesiones terminan en ROLLBACK.
// ---------------------------------------------------------------------------------------------------------------------
function sesion(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ ok: code === 0, salida: out.trim(), error: err, ms: Date.now() - inicio }));
    p.stdin.end(`${sql}\nrollback;\n`);
  });
}
{
  const TOK = "7a7a7a7a-0000-4000-8000-00000000c0de";
  const envio = sesion(`${preparar()}
select retail.registrar_movimiento_caja(:'caja', 'ingreso', 10, 'Otro', 'prueba de token', false, '${TOK}') as m \\gset
select pg_sleep(2.5);`);
  await new Promise((r) => setTimeout(r, 1200));
  const resolver = await sesion(`begin;
set local request.jwt.claim.sub = '${FELIPE}';
select 'res|' || (retail.fn_resolver_intento('registrar_movimiento_caja', '${TOK}') ->> 'estado');`);
  const e = await envio;
  esperar("concurrencia: el resolver espera al envío que todavía guarda y responde lo que de verdad pasó",
    e.ok && resolver.ok && resolver.salida.includes("res|no_llego") && resolver.ms >= 800,
    `envío: ${e.ok ? "ok" : e.error} · resolver (${resolver.ms} ms): ${resolver.salida || resolver.error}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Las migraciones
// ---------------------------------------------------------------------------------------------------------------------
{
  const cuenta = FUNCIONES.map((f) => `select '${f}|' || (length(d) - length(replace(d, 'fn_intento_con_huella(', ''))) / length('fn_intento_con_huella(')
  from pg_get_functiondef('${bloqueDe(f).firma}'::regprocedure) d;`).join("\n");
  const r = correr(`begin;\n${PARTE1}\n${PARTE2}\n${PARTE1}\n${PARTE2}\n${cuenta}`);
  const filas = r.salida.split("\n").filter((l) => FUNCIONES.some((f) => l.startsWith(`${f}|`)));
  esperar("las dos partes se pueden pegar dos veces: cada función llama UNA vez", r.ok && filas.length === FUNCIONES.length && filas.every((l) => l.endsWith("|1")),
    r.ok ? filas.join(" ") : r.error);
}
{
  const huellas = `select string_agg(md5(pg_get_functiondef(p.oid)), ',' order by p.proname) from pg_proc p
    where p.pronamespace = 'retail'::regnamespace and p.proname in (${FUNCIONES.map((f) => `'${f}'`).join(", ")});`;
  const r = correr(`begin;\n${huellas}\n${FUNCIONES.map(sinToken).join("")}\n${PARTE2}\n${huellas}`);
  const [antes, despues] = r.salida.split("\n").filter(Boolean);
  esperar("deshacer las diez llamadas y volver a pegar la parte 2 deja las funciones idénticas", r.ok && antes && antes === despues,
    r.ok ? `${antes?.slice(0, 40)} · ${despues?.slice(0, 40)}` : r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
