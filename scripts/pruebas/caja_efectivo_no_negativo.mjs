#!/usr/bin/env node
/**
 * Prueba de «el efectivo de una caja abierta nunca queda bajo cero» (`20261013202000_…_parte1.sql` y `…_parte2.sql`).
 *
 * EL PROBLEMA QUE PRUEBA. /chaos (2026-10-13) dejó una caja esperando −S/ 400 en el cajón: un retiro de S/ 500 con S/ 100
 * adentro, y dos retiros a la vez de S/ 300 contra S/ 390 pasaban los dos. Aquí, cada forma de sacar efectivo: un egreso, el
 * reembolso en efectivo de una devolución, el vuelto de un cambio, anular una venta en efectivo y pasar su pago a otro medio.
 * El borde exacto (dejar el cajón en S/ 0) se acepta; un céntimo más, no. Quien puede cerrar la caja ve la cifra; una integrante
 * no (arqueo ciego). Con un control: sin los disparadores, el egreso de más se guardaba.
 *
 * Los disparadores son DIFERIDOS (corren al confirmar): cada caso termina con `set constraints all immediate`, que los corre
 * dentro de la transacción, y después ROLLBACK. Nada queda escrito. La concurrencia abre dos sesiones que terminan en ROLLBACK.
 *
 * QUÉ DA POR SENTADO. `Tienda Trujillo` y las variantes `BLU-EMMA-NEG-M` / `BLU-EMMA-NEG-L` del seed; Felipe y Sandra (líderes)
 * y Micaela (colaboradora fija en Trujillo, con Caja en su rol).
 *
 * USO: pnpm pruebas:caja-efectivo-no-negativo   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261013202000_efectivo_de_caja_no_negativo_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261013203000_efectivo_de_caja_no_negativo_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder (aprueba lo que registró Felipe)
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
const DISPARADORES = [
  ["caja_movimientos", "caja_movimientos_efectivo_no_negativo"],
  ["devoluciones", "devoluciones_efectivo_no_negativo"],
  ["cambios", "cambios_efectivo_no_negativo"],
  ["ventas", "ventas_efectivo_no_negativo"],
  ["venta_pagos", "venta_pagos_efectivo_no_negativo"],
];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

// Caja propia en Trujillo con S/ 100 de apertura (el esperado arranca en 100), stock de sobra y series propias. Al final,
// la sesión es `quien`.
function preparar(quien = FELIPE, { apertura = 100 } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', ${apertura}, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT97' when 'factura' then 'FT97' when 'nota_credito' then 'BC97' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura', 'nota_credito');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as w from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'w', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
set local request.jwt.claim.sub = '${quien}';
`;
}

const egreso = (monto, como = "_e") => `select retail.registrar_movimiento_caja(:'caja', 'egreso', ${monto}, 'Retiro de efectivo', null, false, gen_random_uuid()) as ${como} \\gset\n`;
// Sin comprobante: una devolución no se aprueba mientras la boleta no esté aceptada por SUNAT (PR #1004), y aquí no se transmite nada.
const vender = (como, metodo = "efectivo") =>
  `select retail.registrar_venta(:'ubic', jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric, 'descuento_unitario', 0)),
    jsonb_build_array(jsonb_build_object('metodo', '${metodo}', 'monto', :'precio'::numeric)), null, gen_random_uuid(), null) as ${como} \\gset\n`;
const esperado = `select 'esperado|' || (select e.esperado from retail.fn_calcular_esperado_caja(:'caja') e);`;
const confirmar = "set constraints all immediate;";

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
const pasa = (r) => r.ok;
const rechaza = (r) => !r.ok && /efectivo_insuficiente/.test(r.error);

// --- El control: sin los disparadores, el egreso de más se guardaba ---
{
  const r = correr(`${preparar()}
${DISPARADORES.map(([t, d]) => `alter table retail.${t} disable trigger ${d};`).join("\n")}
${egreso(150)}${confirmar}
${esperado}`);
  esperar("CONTROL: sin los disparadores, un retiro de S/ 150 con S/ 100 en el cajón se guardaba (esperado −50)", r.ok && r.salida.includes("esperado|-50.00"), r.salida || r.error);
}

// --- Egresos ---
{
  const r = correr(`${preparar()}${egreso(100)}${confirmar}\n${esperado}`);
  esperar("un retiro que deja el cajón en S/ 0 justo se acepta", pasa(r) && r.salida.includes("esperado|0.00"), r.salida || r.error);
}
esperar("un retiro de un céntimo más que lo que hay se rechaza", rechaza(correr(`${preparar()}${egreso(100.01)}${confirmar}`)), "pasó");
{
  const r = correr(`${preparar()}${egreso(60, "e1")}${egreso(50, "e2")}${confirmar}`);
  esperar("dos retiros que juntos pasan lo que hay (60 + 50 con 100) se rechazan al confirmar", rechaza(r), r.ok ? `pasó: ${r.salida}` : r.error);
}
{
  const r = correr(`${preparar()}
select retail.registrar_movimiento_caja(:'caja', 'ingreso', 50, 'Otro', 'sencillo', false, gen_random_uuid()) as _i \\gset
${egreso(150)}${confirmar}
${esperado}`);
  esperar("con una entrada antes, el retiro hasta el nuevo total se acepta", pasa(r) && r.salida.includes("esperado|0.00"), r.salida || r.error);
}

// --- El mensaje: la cifra solo para quien cierra la caja ---
{
  const lider = correr(`${preparar()}${egreso(130)}${confirmar}`);
  esperar("el líder ve en cuánto quedaría el cajón (S/ -30.00)", rechaza(lider) && /S\/ -30\.00/.test(lider.error), lider.error);
  const integrante = correr(`${preparar(MICAELA)}
do $r$ begin
  -- Micaela, con un rol de prueba que ve Caja pero no la cierra: solo dentro de esta transacción.
  insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-0000000000c1', 'Solo vender (prueba de caja)', 'temporal');
  insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-0000000000c1', 'vender');
  update retail.colaboradores set rol_id = '44444444-4444-4444-8444-0000000000c1'
    where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
end $r$;
select retail.fn_puede_gestionar_caja() as gestiona \\gset
select set_config('request.jwt.claim.sub', '${FELIPE}', true) as _f \\gset
${egreso(130)}
select set_config('request.jwt.claim.sub', '${MICAELA}', true) as _m \\gset
${confirmar}`);
  esperar("una integrante que no cierra la caja no ve la cifra (arqueo ciego)", rechaza(integrante) && !/S\//.test(integrante.error.split("HINT")[0]), integrante.error);
}

// --- Las otras salidas ---
{
  const r = correr(`${preparar()}${vender("venta", "yape")}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as dev \\gset
set local request.jwt.claim.sub = '${SANDRA}';
select retail.aprobar_devolucion(:'dev', :'precio'::numeric, 'efectivo') as _ap \\gset
${confirmar}`);
  esperar("devolución: un reembolso en efectivo de S/ 79.90 con S/ 100 en el cajón se acepta", pasa(r), r.error);
  const r2 = correr(`${preparar()}${vender("venta", "yape")}${egreso(50)}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as dev \\gset
set local request.jwt.claim.sub = '${SANDRA}';
select retail.aprobar_devolucion(:'dev', :'precio'::numeric, 'efectivo') as _ap \\gset
${confirmar}`);
  esperar("devolución: el mismo reembolso con S/ 50 en el cajón se rechaza", rechaza(r2), r2.ok ? "pasó" : r2.error);
  const r3 = correr(`${preparar()}${vender("venta", "yape")}${egreso(100)}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba', 'otro') as dev \\gset
set local request.jwt.claim.sub = '${SANDRA}';
select retail.aprobar_devolucion(:'dev', :'precio'::numeric, 'yape') as _ap \\gset
${confirmar}`);
  esperar("devolución: con el cajón en S/ 0, el reembolso por Yape se acepta (no sale del cajón)", pasa(r3), r3.error);
}
{
  // Un cambio por una prenda más barata, con la diferencia devuelta en efectivo.
  const cambio = `update retail.variantes set precio = 10 where id = :'w';
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.registrar_cambio(:'item', :'ubic', :'w', 1, 'efectivo', gen_random_uuid(), 'otro_color', 'vendible') as _cb \\gset
${confirmar}`;
  const r = correr(`${preparar()}${vender("venta", "yape")}${cambio}`);
  esperar("cambio: devolver S/ 69.90 en efectivo con S/ 100 en el cajón se acepta", pasa(r), r.error);
  const r2 = correr(`${preparar()}${vender("venta", "yape")}${egreso(50)}${cambio}`);
  esperar("cambio: el mismo vuelto con S/ 50 en el cajón se rechaza", rechaza(r2), r2.ok ? "pasó" : r2.error);
}
{
  // Apertura 100 + venta en efectivo 79.90, y se retira todo (179.90): anular la dejaría en −79.90.
  const r = correr(`${preparar()}${vender("venta")}${egreso(179.9)}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.anular_venta(:'venta', 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
${confirmar}`);
  esperar("anular: una venta en efectivo cuya plata ya se retiró no se anula (el cajón quedaría en −79.90)", rechaza(r), r.ok ? "pasó" : r.error);
  const r2 = correr(`${preparar()}${vender("venta")}
select id as item from retail.venta_items where venta_id = :'venta' \\gset
select retail.anular_venta(:'venta', 'prueba', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
${confirmar}
${esperado}`);
  esperar("anular: con la plata en el cajón, la venta se anula", pasa(r2) && r2.salida.includes("esperado|100.00"), r2.salida || r2.error);
}
{
  const r = correr(`${preparar()}${vender("venta")}${egreso(179.9)}
select retail.corregir_pagos_venta(:'venta', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric)), 'se equivocó de medio') as _co \\gset
${confirmar}`);
  esperar("corregir el pago: pasar a Yape una venta en efectivo cuya plata ya se retiró se rechaza", rechaza(r), r.ok ? "pasó" : r.error);
  const r2 = correr(`${preparar()}${vender("venta")}
select retail.corregir_pagos_venta(:'venta', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric)), 'se equivocó de medio') as _co \\gset
${confirmar}`);
  esperar("corregir el pago: con la plata en el cajón, pasar a Yape se acepta (borrar e insertar no se mira a medio camino)", pasa(r2), r2.error);
}

// --- Concurrencia: dos retiros de S/ 300 contra S/ 390 a la vez. El segundo espera al primero. ---
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
  // Sin preparar en cada sesión (las dos verían cajas distintas): una caja abierta del seed, con un retiro de prueba que la deja
  // en lo que tenga; cada sesión retira el esperado completo, así la segunda, si no esperara, también pasaría.
  const caja = execFileSync("docker", ARGS, {
    input: "select c.id from retail.cajas c where c.estado = 'abierta' order by c.abierta_en desc limit 1;",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (!caja) esperar("concurrencia: hace falta una caja abierta en la base local", false, "no hay ninguna");
  else {
    const retiraTodo = (dormir) => `begin;
set local request.jwt.claim.sub = '${FELIPE}';
${PARTE1}
${PARTE2}
select (select e.esperado from retail.fn_calcular_esperado_caja('${caja}') e) as todo \\gset
select retail.registrar_movimiento_caja('${caja}', 'egreso', :'todo'::numeric, 'Retiro de efectivo', null, false, gen_random_uuid()) as _e \\gset
${confirmar}
select pg_sleep(${dormir});`;
    const primera = sesion(retiraTodo(2.5));
    await new Promise((r) => setTimeout(r, 1000));
    const segunda = await sesion(retiraTodo(0));
    const p = await primera;
    // La primera se deshace al final (ROLLBACK): la segunda, que esperó su candado, ve el cajón como estaba y pasa. Lo que se
    // prueba es que ESPERÓ (el candado por caja ordena las salidas), no el resultado.
    esperar("concurrencia: un segundo retiro de la misma caja espera a que el primero termine", p.ok && segunda.ok && segunda.ms >= 1000,
      `primera: ${p.ok ? "ok" : p.error} · segunda (${segunda.ms} ms): ${segunda.ok ? "ok" : segunda.error}`);
  }
}

// --- La migración ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE2}\n${PARTE1}\n${PARTE2}
select 'disparadores|' || count(*) from pg_trigger where tgname like '%efectivo_no_negativo';`);
  esperar("las dos partes se pueden pegar dos veces: quedan cinco disparadores", r.ok && r.salida.includes("disparadores|5"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
