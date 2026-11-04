#!/usr/bin/env node
/**
 * Pruebas del CANAL de venta (`20261104004000_ventas_online_canal.sql`, ADR-0607) contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. CAYLA empieza a vender por TikTok. Cada venta online es un apartado, pero no es una venta de tienda: no
 * debe mezclarse en Apartados, ni en las metas, ni en lo que mira el piso. Lo que las separa es el CANAL (una marca del apartado y de
 * la venta que nace de él), no el rol. Este archivo prueba que la marca es real: que `separar_prendas_online` marca el apartado en
 * la misma transacción, que no deja pasar un envío sin dirección ni un canal que no es online, que pide el módulo, que la venta
 * hereda el canal al entregar, y que un apartado de tienda sigue siendo exactamente lo que era.
 *
 * MISMO PATRÓN que `apartados_proformas_candados.mjs`: `docker exec … psql`, la migración dentro de la transacción y ROLLBACK siempre
 * — nada se commitea contra el Postgres que comparten varios worktrees.
 *
 * USO   pnpm pruebas:ventas-online-canal   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261104004000_ventas_online_canal.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — ve todos los módulos y opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — sin el módulo nuevo
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

function preparar({ sinMigracion = false } = {}) {
  return `
begin;
${sinMigracion ? "" : MIGRACION}
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT93' when 'factura' then 'FT93' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', 50, 'colchón de prueba') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
`;
}

const comunes = `p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', :'precio'::numeric)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 30)),
  p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987111222',
  p_devolucion_medio => 'transferencia', p_devolucion_cci => '00212345678901234567'`;

/** Una venta online. `extra` sirve para el token. */
const online = (canal, modo, direccion, como = "sep", extra = "") =>
  `select retail.separar_prendas_online('${canal}', '${modo}', ${direccion === null ? "null" : `'${direccion}'`}, ${comunes}${extra}) as ${como} \\gset
select 'canal|' || canal || '|' || modo_entrega || '|' || coalesce(direccion_envio, '-') from retail.separaciones where id = :'${como}';`;

const deTienda = `select retail.separar_prendas(${comunes}) as sep \\gset
select 'canal|' || canal || '|' || modo_entrega || '|' || coalesce(direccion_envio, '-') from retail.separaciones where id = :'sep';`;

/** Entrega el apartado `sep` cobrando el saldo, y dice el canal de la venta que nace. */
const entregar = (como = "sep") => `select retail.entregar_separacion(:'${como}',
  (select jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', total - adelanto)) from retail.separaciones where id = :'${como}'),
  gen_random_uuid()) as venta \\gset
select 'venta|' || canal from retail.ventas where id = :'venta';`;

const comoMicaela = `set local request.jwt.claim.sub = '${MICAELA}';\n`;

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechazaCon = (hint) => (r) => !r.ok && r.error.includes(hint);

// --- Control ---
{
  const r = correr(`${preparar({ sinMigracion: true })}select 'col|' || count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'separaciones' and column_name = 'canal';`);
  esperar("CONTROL: sin la migración, el apartado no sabe de qué canal es", r.ok && r.salida.includes("col|0"), r.salida || r.error);
}

// --- Venta online registrada ---
{
  const r = correr(`${preparar()}${online("tiktok", "recojo", null)}`);
  esperar("TikTok con recojo: el apartado queda marcado «tiktok», recojo, sin dirección", r.ok && r.salida.includes("canal|tiktok|recojo|-"), r.salida || r.error);
  const e = correr(`${preparar()}${online("tiktok", "envio", "Jr. Pizarro 123, Trujillo - Olva")}`);
  esperar("TikTok con envío: guarda la dirección", e.ok && e.salida.includes("canal|tiktok|envio|Jr. Pizarro 123, Trujillo - Olva"), e.salida || e.error);
  const t = correr(`${preparar()}${deTienda}`);
  esperar("un apartado de tienda (separar_prendas de siempre) sigue siendo «tienda», recojo", t.ok && t.salida.includes("canal|tienda|recojo|-"), t.salida || t.error);
}

// --- Lo que se rechaza ---
esperar("un envío sin dirección se rechaza", rechazaCon("direccion_envio_falta")(correr(`${preparar()}${online("tiktok", "envio", null)}`)), "pasó");
esperar("un envío con dirección de espacios se rechaza", rechazaCon("direccion_envio_falta")(correr(`${preparar()}${online("tiktok", "envio", "    ")}`)), "pasó");
esperar("un canal que no es online («tienda») se rechaza", rechazaCon("canal_invalido")(correr(`${preparar()}${online("tienda", "recojo", null)}`)), "pasó");
esperar("un canal que no existe se rechaza", rechazaCon("canal_invalido")(correr(`${preparar()}${online("instagram", "recojo", null)}`)), "pasó");
esperar("un modo de entrega inventado se rechaza", rechazaCon("modo_entrega_invalido")(correr(`${preparar()}${online("tiktok", "paloma", null)}`)), "pasó");
esperar("sin el módulo «Ventas online» se rechaza (integrante)", rechazaCon("venta_online_sin_modulo")(correr(`${preparar()}${comoMicaela}${online("tiktok", "recojo", null)}`)), "pasó");

// --- Candado directo en la tabla ---
{
  const r = correr(`${preparar()}${deTienda}
update retail.separaciones set modo_entrega = 'envio', direccion_envio = 'Av. Larco 1' where id = :'sep';`);
  esperar("un apartado de tienda no puede pasar a envío por la puerta de atrás", !r.ok && r.error.includes("separaciones_entrega_coherente"), r.salida || r.error);
  const r2 = correr(`${preparar()}${online("tiktok", "recojo", null)}
update retail.separaciones set enviado_en = now(), enviado_por = '${FELIPE}' where id = :'sep';`);
  esperar("«enviado» no existe en un recojo", !r2.ok && r2.error.includes("separaciones_entrega_coherente"), r2.salida || r2.error);
}

// --- Reintento con la misma marca ---
{
  const token = "aaaaaaaa-0000-4000-8000-000000000001";
  const r = correr(`${preparar()}${online("tiktok", "recojo", null, "uno", `, p_token => '${token}'`)}
${online("tiktok", "recojo", null, "dos", `, p_token => '${token}'`)}
select 'mismo|' || (:'uno' = :'dos');`);
  esperar("el mismo reintento devuelve el mismo apartado", r.ok && r.salida.includes("mismo|t"), r.salida || r.error);
}

// --- La venta hereda el canal ---
{
  const r = correr(`${preparar()}${online("tiktok", "recojo", null)}${entregar()}`);
  esperar("al entregar, la venta de TikTok nace con canal «tiktok»", r.ok && r.salida.includes("venta|tiktok"), r.salida || r.error);
  const t = correr(`${preparar()}${deTienda}${entregar()}`);
  esperar("al entregar, la venta de un apartado de tienda sigue en «tienda»", t.ok && t.salida.includes("venta|tienda"), t.salida || t.error);
}

// --- Los canales ---
{
  const r = correr(`${preparar()}select 'canales|' || string_agg(clave, ',' order by clave) from retail.fn_canales_venta();`);
  esperar("fn_canales_venta devuelve tienda y tiktok", r.ok && r.salida.includes("canales|tienda,tiktok"), r.salida || r.error);
}

// --- La migración ---
{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}
select 'canales|' || count(*) from retail.canales_venta;
select 'roles|' || count(*) from retail.rol_modulos where modulo = 'ventas_online';`);
  esperar("la migración se puede pegar dos veces: 2 canales y ningún rol con el módulo", r.ok && ["canales|2", "roles|0"].every((x) => r.salida.includes(x)), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
