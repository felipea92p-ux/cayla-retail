#!/usr/bin/env node
/**
 * Prueba de ADR-0195 F1 — meta del día y fondo de caja, unidos a las campañas
 * (`20260924210000_configuracion_meta_y_fondo_por_campana.sql`).
 *
 * QUÉ CUBRE
 *   · `fn_parametros_caja`: meta del día de la semana, fondo normal, y las campañas que rigen; si dos se cruzan, gana la
 *     mayor (meta_pct más alto, fondo más alto); una campaña limitada a otras sedes no cambia esta tienda;
 *   · `fn_meta_mes` = la suma de las metas de cada día;
 *   · solo el líder guarda (`guardar_metas_tienda`, `guardar_efecto_campana`) y cada cambio queda en el historial;
 *   · los candados: metas solo en tiendas, efectos solo en campañas con fechas, nada se escribe por fuera de las RPC;
 *   · al cerrar una caja, el disparador anota el fondo que regía (`cajas.fondo_requerido`) sin cambiar `cerrar_caja`.
 *     Si esa regla falla, el cierre sigue igual (el dato queda vacío);
 *   · ni el líder lee las tablas nuevas directo: RLS sin políticas (ver la cabecera de la migración: en Supabase
 *     `create policy` bloquea auth y storage, y eso causó el deadlock al pegarla el 2026-09-24).
 *
 * CÓMO. Igual que `caja_cierre_traslado.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el
 * Postgres local compartido), sesión simulada con `request.jwt.claim.sub`, `pg_temp.intento` para leer el error.
 *
 * USO
 *   pnpm pruebas:configuracion-caja    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

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
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
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
`;

/** Trujillo con metas (lun–dom 1500, 1500, 1600, 1700, 2000, 2500, 2000), fondo 300; Fiestas Patrias +25 % y fondo 400;
 *  Día del Gato +5 % sin fondo. Deja `:tru`, `:lim`, `:taller`, `:fp`, `:gato`, `:cyber`, `:madre`. */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as fp from retail.etiquetas where nombre = 'Fiestas Patrias' \\gset
select id as gato from retail.etiquetas where nombre = 'Día Internacional del Gato' \\gset
select id as cyber from retail.etiquetas where nombre = 'CyberWow' \\gset
select id as madre from retail.etiquetas where nombre = 'Día de la Madre' \\gset
select id as noesc from retail.etiquetas where estilo <> 'campana' limit 1 \\gset
select retail.guardar_metas_tienda(:'tru', array[1500,1500,1600,1700,2000,2500,2000]::numeric[], 300) as _m \\gset
select retail.guardar_efecto_campana(:'fp', :'tru', 25, 400) as _a \\gset
select retail.guardar_efecto_campana(:'gato', :'tru', 5, null) as _b \\gset
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 600)}`);
  }
}

// 1. Lo normal y las campañas cruzadas.
{
  const r = correr(`${ESCENA}
select meta, fondo, meta_pct from retail.fn_parametros_caja(:'tru', '2026-09-24');
select meta, fondo, meta_pct, jsonb_array_length(campanas) from retail.fn_parametros_caja(:'tru', '2026-07-27');
select meta, fondo, meta_pct from retail.fn_parametros_caja(:'tru', '2026-08-03');
select retail.fn_meta_mes(:'tru', '2026-09-01');`);
  const [normal, cruce, soloGato, mes] = r.ok ? r.salida.split("\n") : [];
  esperar("un jueves normal: meta 1700, fondo 300, sin campaña", r.ok && normal === "1700|300.00|0", r);
  esperar("27 jul (Fiestas Patrias + Gato): gana la mayor → meta 1875 (+25 %), fondo 400, 2 campañas", r.ok && cruce === "1875|400.00|25.00|2", r);
  esperar("3 ago (solo el Gato, sin fondo): meta 1575 (+5 %) y el fondo normal", r.ok && soloGato === "1575|300.00|5.00", r);
  esperar("la meta de septiembre es la suma de los días: 54300", r.ok && Number(mes) === 54300, r);
}

// 2. Una campaña limitada a otras sedes no cambia esta tienda.
{
  const r = correr(`${ESCENA}
update retail.etiquetas set sedes_permitidas = array[:'lim']::uuid[] where id = :'fp';
select meta, fondo from retail.fn_parametros_caja(:'tru', '2026-07-20');`);
  esperar("Fiestas Patrias solo para Lima: el 20 jul Trujillo sigue normal (lunes 1500, fondo 300)", r.ok && r.salida === "1500|300.00", r);
}

// 3. Candados.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_metas_tienda(%L, array[1,1,1,1,1,1,1]::numeric[], 10)', :'taller'));
select pg_temp.intento(format('select retail.guardar_efecto_campana(%L, %L, 10, null)', :'cyber', :'tru'));
select pg_temp.intento(format('select retail.guardar_efecto_campana(%L, %L, 10, null)', :'noesc', :'tru'));
select pg_temp.intento(format('select retail.guardar_metas_tienda(%L, array[1,1]::numeric[], 10)', :'tru'));
select pg_temp.intento(format('select retail.guardar_metas_tienda(%L, array[1,1,1,1,1,1,1]::numeric[], -5)', :'tru'));
select pg_temp.intento('insert into retail.campana_efecto_caja (etiqueta_id, ubicacion_id, meta_pct) values (''' || :'madre' || ''', ''' || :'tru' || ''', 0)');`);
  const [taller, cyber, noesc, dias, negativo, vacio] = r.ok ? r.salida.split("\n") : [];
  esperar("metas en el Taller: rechazado (solo tiendas)", r.ok && taller.startsWith("La meta y el fondo de caja son solo de tiendas"), r);
  esperar("efecto en una campaña sin fechas (CyberWow): rechazado", r.ok && cyber.startsWith("La campaña no tiene fechas"), r);
  esperar("efecto en una etiqueta que no es campaña: rechazado", r.ok && noesc.startsWith("Solo una campaña"), r);
  esperar("menos de 7 metas: rechazado", r.ok && dias.startsWith("Faltan las metas"), r);
  esperar("fondo negativo: rechazado", r.ok && negativo.startsWith("El fondo de caja no puede"), r);
  esperar("una fila de efecto vacía no puede existir", r.ok && vacio.includes("campana_efecto_caja_no_vacio"), r);
}

// 4. Volver a lo normal borra el efecto y queda en el historial.
{
  const r = correr(`${ESCENA}
select retail.guardar_efecto_campana(:'gato', :'tru', 0, null) as _c \\gset
select count(*) from retail.campana_efecto_caja where etiqueta_id = :'gato';
select count(*) from retail.configuracion_historial where hecho_en >= now() - interval '1 minute';`);
  const [quedan, hist] = r.ok ? r.salida.split("\n") : [];
  esperar("0 % y sin fondo = volver a lo normal: la fila se quita", r.ok && Number(quedan) === 0, r);
  esperar("los 4 cambios quedan en el historial", r.ok && Number(hist) === 4, r);
}

// 5. Solo el líder guarda; la colaboradora lee lo que rige hoy (la caja lo necesita) pero no la configuración.
{
  const r = correr(`${ESCENA}${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.guardar_metas_tienda(%L, array[1,1,1,1,1,1,1]::numeric[], 10)', :'tru'));
select pg_temp.intento(format('select retail.guardar_efecto_campana(%L, %L, 10, null)', :'fp', :'tru'));
select pg_temp.intento('select retail.fn_configuracion_tiendas()');
select meta from retail.fn_parametros_caja(:'tru', '2026-09-24');
set local role authenticated;
select pg_temp.intento('update retail.ubicacion_metas_dia set meta = 1');`);
  const [metas, efecto, config, lee, directo] = r.ok ? r.salida.split("\n") : [];
  esperar("la colaboradora no cambia metas", r.ok && metas.startsWith("Solo el líder"), r);
  esperar("la colaboradora no cambia campañas", r.ok && efecto.startsWith("Solo el líder"), r);
  esperar("la colaboradora no lee la configuración", r.ok && config.startsWith("Solo el líder"), r);
  esperar("la colaboradora sí lee la meta de hoy (la ve en Caja)", r.ok && Number(lee) === 1700, r);
  esperar("nadie escribe la tabla por fuera de la RPC", r.ok && directo.includes("permission denied"), r);
}

// 6. Al cerrar, el disparador anota el fondo que regía (cerrar_caja no cambia).
{
  const r = correr(`${ESCENA}
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
select monto_fondo from retail.cerrar_caja(:'caja', 100, 80, 'caja_fuerte');
select fondo_requerido, monto_fondo < fondo_requerido from retail.cajas where id = :'caja';`);
  const [fondo, anotado] = r.ok ? r.salida.split("\n") : [];
  esperar("cerrar dejando S/ 20 deja monto_fondo 20", r.ok && Number(fondo) === 20, r);
  esperar("el cierre anota fondo_requerido 300 y se ve que dejó menos (sin bloquear)", r.ok && anotado === "300.00|t", r);
}

// 7. Si la regla del fondo falla, el cierre sigue: el dato queda vacío (nunca se bloquea una caja por esto).
{
  const r = correr(`${ESCENA}
create or replace function retail.fn_parametros_caja(p_ubicacion_id uuid, p_fecha date)
returns table (meta numeric, meta_base numeric, meta_pct numeric, fondo numeric, fondo_base numeric, campanas jsonb)
language plpgsql as $f$ begin raise exception 'regla rota a propósito'; end $f$;
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba automatizada') as caja \\gset
select (select count(*) from retail.cerrar_caja(:'caja', 100, 80, 'caja_fuerte')) as _cierre \\gset
select estado, fondo_requerido is null from retail.cajas where id = :'caja';`);
  esperar("con la regla rota, la caja se cierra igual y fondo_requerido queda vacío", r.ok && r.salida === "cerrada|t", r);
}

// 8. Ni el líder lee estas tablas directo: RLS sin políticas y revoke (todo pasa por las funciones). Sin políticas a
//    propósito: en Supabase `create policy`/`drop policy` bloquean las tablas de auth y storage (el deadlock del 24-sep).
{
  const r = correr(`${ESCENA}
set local role authenticated;
select pg_temp.intento('select count(*) from retail.ubicacion_metas_dia');
select pg_temp.intento('select count(*) from retail.campana_efecto_caja');
select pg_temp.intento('select count(*) from retail.configuracion_historial');
select meta from retail.fn_parametros_caja(:'tru', '2026-09-24');`);
  const [metas, efectos, hist, lee] = r.ok ? r.salida.split("\n") : [];
  esperar("el líder no lee las tablas directo (permiso denegado en las tres)", r.ok && [metas, efectos, hist].every((m) => m.includes("permission denied")), r);
  esperar("…pero la función sí le da la meta de hoy", r.ok && Number(lee) === 1700, r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
