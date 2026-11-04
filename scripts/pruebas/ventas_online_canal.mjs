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
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

function preparar({ sinMigracion = false } = {}) {
  // En el CI la base ya trae la migración: para «sin la migración» se le quita la columna dentro de la transacción (ROLLBACK).
  return `
begin;
${sinMigracion ? "alter table retail.separaciones drop column if exists canal cascade;" : MIGRACION}
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

const rolDe = (persona) => `(select c.rol_id from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${persona}')`;
const darCanal = (persona, canal) => `insert into retail.rol_canales (rol_id, canal) select ${rolDe(persona)}, '${canal}' on conflict do nothing;\n`;
const quitarCanal = (persona, canal) => `delete from retail.rol_canales where rol_id = ${rolDe(persona)} and canal = '${canal}';\n`;
const cuentaPara = (persona, id, etiqueta) => `set local request.jwt.claim.sub = '${persona}';
select '${etiqueta}|' || count(*) from retail.buscar_separaciones(:'ubic') where id = :'${id}';`;

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
esperar("un integrante que no opera el canal TikTok se rechaza", rechazaCon("canal_sin_permiso")(correr(`${preparar()}${comoMicaela}${online("tiktok", "recojo", null)}`)), "pasó");

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

// --- El candado al actuar por id (actividad 6) ---
{
  const soloTikTok = (persona) => `${darCanal(persona, "tiktok")}${quitarCanal(persona, "tienda")}`;
  const aplazar = (persona, id = "sep") => `set local request.jwt.claim.sub = '${persona}';\nselect retail.aplazar_separacion(:'${id}', retail.fn_hoy_lima() + 9) as _a \\gset\n`;
  const ambas = `${preparar()}${online("tiktok", "recojo", null, "on")}${deTienda.replace(/as sep/, "as tn").replace(/:'sep'/g, ":'tn'")}
`;
  let r = correr(`${ambas}${soloTikTok(MICAELA)}${aplazar(MICAELA, "tn")}`);
  esperar("quien solo opera TikTok no puede aplazar un apartado de la tienda (por id)", rechazaCon("canal_sin_permiso")(r), r.salida || r.error);
  r = correr(`${ambas}${aplazar(MICAELA, "on")}`);
  esperar("quien solo opera la tienda no puede aplazar un apartado de TikTok (por id)", rechazaCon("canal_sin_permiso")(r), r.salida || r.error);
  r = correr(`${ambas}${soloTikTok(MICAELA)}${aplazar(MICAELA, "on")}select 'ok|' || count(*) from retail.separaciones where id = :'on';`);
  esperar("quien opera TikTok sí aplaza uno de TikTok", r.ok && r.salida.includes("ok|1"), r.salida || r.error);
  r = correr(`${ambas}${aplazar(FELIPE, "on")}${aplazar(FELIPE, "tn")}select 'ok';`);
  esperar("el líder opera los dos canales", r.ok, r.error || r.salida);
  r = correr(`${ambas}${soloTikTok(MICAELA)}set local request.jwt.claim.sub = '${MICAELA}';\n${deTienda.replace(/as sep/, "as otra").replace("'Ana'", "'Eva'").replace("987111222", "987333444")}`);
  esperar("quien solo opera TikTok no crea un apartado de la tienda con separar_prendas directo", rechazaCon("canal_sin_permiso")(r), r.error || r.salida);
  r = correr(`${preparar()}${soloTikTok(MICAELA)}${comoMicaela}${online("tiktok", "recojo", null)}`);
  esperar("quien solo opera TikTok sí registra una venta de TikTok por la puerta online", r.ok && r.salida.includes("canal|tiktok|recojo|-"), r.salida || r.error);
  // El vencimiento solo no se bloquea: libera sin nombrar a nadie, aunque lo dispare quien no opera el canal.
  r = correr(`${ambas}${soloTikTok(MICAELA)}update retail.separaciones set vence_el = retail.fn_hoy_lima() - 5 where id in (:'on', :'tn');
set local request.jwt.claim.sub = '${MICAELA}';
select retail.fn_vencer_separaciones(:'ubic') as _v \\gset
select 'estados|' || string_agg(id::text || ':' || estado, ',' order by canal) from retail.separaciones where id in (:'on', :'tn');`);
  esperar("el vencimiento solo corre aunque quien abre Apartados no opere el canal del apartado vencido", r.ok, r.salida || r.error);
}

// --- Marcar enviado ---
{
  const marcar = (persona, guia = "null", id = "sep") => `set local request.jwt.claim.sub = '${persona}';\nselect retail.marcar_separacion_enviada(:'${id}', ${guia}) as env \\gset\n`;
  const estado = (id = "sep") => `select 'enviado|' || (enviado_en is not null) || '|' || coalesce(guia_envio, '-') || '|' || (enviado_por is not null) from retail.separaciones where id = :'${id}';`;
  const envio = online("tiktok", "envio", "Jr. Pizarro 123, Trujillo");
  let r = correr(`${preparar()}${envio}${marcar(FELIPE, "'Olva guía 998877'")}${estado()}`);
  esperar("marcar enviado guarda la fecha, quién y la guía", r.ok && r.salida.includes("enviado|true|Olva guía 998877|true"), r.salida || r.error);
  r = correr(`${preparar()}${envio}${marcar(FELIPE)}select :'env' as primera \\gset\n${marcar(FELIPE, "'otra guía'")}select 'misma|' || (:'env' = :'primera');${estado()}`);
  esperar("repetirlo (doble toque) devuelve la misma fecha y no cambia nada", r.ok && r.salida.includes("misma|t") && r.salida.includes("enviado|true|-|true"), r.salida || r.error);
  esperar("un apartado para recoger no se marca como enviado", rechazaCon("no_es_envio")(correr(`${preparar()}${online("tiktok", "recojo", null)}${marcar(FELIPE)}`)), "pasó");
  esperar("un apartado de tienda no se marca como enviado", rechazaCon("no_es_envio")(correr(`${preparar()}${deTienda}${marcar(FELIPE)}`)), "pasó");
  esperar("quien no opera el canal no lo marca (integrante)", rechazaCon("canal_sin_permiso")(correr(`${preparar()}${envio}${marcar(MICAELA)}`)), "pasó");
  esperar("una guía de más de 120 letras se rechaza", rechazaCon("guia_larga")(correr(`${preparar()}${envio}${marcar(FELIPE, `'${"x".repeat(121)}'`)}`)), "pasó");
  {
    const lib = correr(`${preparar()}${envio}update retail.separaciones set estado = 'liberada', liberada_en = now(), liberada_por = (select id from public.personas where auth_user_id = '${FELIPE}'), liberada_motivo = 'clienta_desistio' where id = :'sep';\n${marcar(FELIPE)}`);
    esperar("un apartado liberado no se marca como enviado", rechazaCon("apartado_cerrado")(lib), lib.error ?? lib.salida);
  }
  r = correr(`${preparar()}${envio}${marcar(FELIPE, "'Olva 1'")}${entregar()}`);
  esperar("un envío ya enviado se entrega y su venta nace en TikTok", r.ok && r.salida.includes("venta|tiktok"), r.salida || r.error);
  r = correr(`${preparar()}${envio}update retail.separaciones set guia_envio = 'x' where id = :'sep';`);
  esperar("la guía no existe sin haberse enviado (candado)", !r.ok && r.error.includes("separaciones_entrega_coherente"), r.salida || r.error);
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

// --- Qué canales opera cada rol ---
{
  const ambas = `${preparar()}${online("tiktok", "recojo", null, "on")}${deTienda.replace(/as sep/, "as tn").replace(/:'sep'/g, ":'tn'")}
`;
  const r = correr(`${ambas}${cuentaPara(FELIPE, "on", "lider_on")}${cuentaPara(FELIPE, "tn", "lider_tn")}${cuentaPara(MICAELA, "on", "mic_on")}${cuentaPara(MICAELA, "tn", "mic_tn")}`);
  esperar(
    "el líder ve las dos; un integrante que solo opera tienda ve la de tienda y no la de TikTok",
    r.ok && ["lider_on|1", "lider_tn|1", "mic_on|0", "mic_tn|1"].every((x) => r.salida.includes(x)),
    r.salida || r.error,
  );
  const r2 = correr(`${ambas}${darCanal(MICAELA, "tiktok")}${quitarCanal(MICAELA, "tienda")}${cuentaPara(MICAELA, "on", "mic_on")}${cuentaPara(MICAELA, "tn", "mic_tn")}`);
  esperar(
    "con TikTok y sin tienda, el integrante ve la de TikTok y no la de tienda (aislamiento)",
    r2.ok && ["mic_on|1", "mic_tn|0"].every((x) => r2.salida.includes(x)),
    r2.salida || r2.error,
  );
  const res = (persona) => `set local request.jwt.claim.sub = '${persona}';\nselect 'por_recoger|' || por_recoger from retail.resumen_separaciones(:'ubic');`;
  const num = (txt) => Number((txt.match(/por_recoger\|(\d+)/g) ?? []).map((x) => x.split("|")[1])[0]);
  const rl = correr(`${ambas}${res(FELIPE)}`);
  const rm = correr(`${ambas}${darCanal(MICAELA, "tiktok")}${quitarCanal(MICAELA, "tienda")}${res(MICAELA)}`);
  esperar("el resumen del integrante solo cuenta sus canales (una menos que el del líder)", rl.ok && rm.ok && num(rl.salida) - num(rm.salida) === 1, `${rl.salida} / ${rm.salida}`);
}
{
  // La puerta: con el canal dado al rol, el integrante sí puede registrar la venta de TikTok.
  const r = correr(`${preparar()}${darCanal(MICAELA, "tiktok")}${comoMicaela}${online("tiktok", "recojo", null)}`);
  esperar("con el canal dado a su rol, el integrante registra la venta de TikTok", r.ok && r.salida.includes("canal|tiktok|recojo|-"), r.salida || r.error);
}
{
  const rolMic = rolDe(MICAELA);
  const guardar = (persona, canales, version = "null") => `set local request.jwt.claim.sub = '${persona}';\nselect retail.guardar_canales_rol(${rolMic}, ${canales}, ${version}) as v \\gset\n`;
  const conRol = (extra) => `${preparar()}${extra}`;
  let r = correr(conRol(`${guardar(FELIPE, "array['tienda','tiktok']")}select 'canales|' || string_agg(canal, ',' order by canal) from retail.rol_canales where rol_id = ${rolMic};
select 'historial|' || count(*) from retail.roles_historial where rol_id = ${rolMic} and accion = 'canales';`));
  esperar("el líder guarda los canales de un rol y queda en el historial", r.ok && r.salida.includes("canales|tienda,tiktok") && r.salida.includes("historial|1"), r.salida || r.error);
  r = correr(conRol(`select version as v0 from retail.roles where id = ${rolMic} \\gset\n${guardar(FELIPE, "array['tiktok']")}select 'sube|' || (:v > :v0);`));
  esperar("guardar los canales sube la versión del rol", r.ok && r.salida.includes("sube|t"), r.salida || r.error);
  esperar("una versión vieja se rechaza", rechazaCon("version_cambiada")(correr(conRol(guardar(FELIPE, "array['tienda']", "0")))), "pasó");
  esperar("un canal que no existe se rechaza", !correr(conRol(guardar(FELIPE, "array['instagram']"))).ok, "pasó");
  esperar("al Líder no se le quitan canales", rechazaCon("lider_todos_los_canales")(correr(`${preparar()}select retail.guardar_canales_rol((select id from retail.roles where fijo limit 1), array['tienda'], null);`)), "pasó");
  esperar("quien no administra roles no guarda canales (integrante)", !correr(conRol(guardar(MICAELA, "array['tienda','tiktok']"))).ok, "pasó");
  r = correr(conRol(`select 'sin_fijo|' || count(*) from retail.roles r where not r.fijo and not exists (select 1 from retail.rol_canales rc where rc.rol_id = r.id and rc.canal = 'tienda');`));
  esperar("todo rol que existe sigue operando «tienda» (nada cambia para nadie)", r.ok && r.salida.includes("sin_fijo|0"), r.salida || r.error);
  r = correr(conRol(`select retail.crear_rol('Ventas online de prueba') as nr \\gset\nselect 'nace|' || string_agg(canal, ',') from retail.rol_canales where rol_id = :'nr';`));
  esperar("un rol nuevo nace operando «tienda»", r.ok && r.salida.includes("nace|tienda"), r.salida || r.error);
}

// --- La migración ---
{
  const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}
select 'canales|' || count(*) from retail.canales_venta;
select 'canales_rol|' || count(*) from retail.rol_canales where canal = 'tienda' and rol_id in (select id from retail.roles where not fijo);`);
  esperar("la migración se puede pegar dos veces: 2 canales y la tienda de cada rol una sola vez", r.ok && ["canales|2"].every((x) => r.salida.includes(x)), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
