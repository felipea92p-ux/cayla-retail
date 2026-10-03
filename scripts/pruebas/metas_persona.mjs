#!/usr/bin/env node
/**
 * Prueba de `20260930050200_metas_por_persona.sql` — la meta de la sede baja a cada persona por sus horas programadas (ADR-0318).
 *
 * QUÉ CUBRE
 *   · REPARTO: las partes de un día suman EXACTO la meta de la sede (con una meta múltiplo de 10 y con una que no lo es), cada una según
 *     sus horas; un descanso (`turnos`) vale 0 y su parte no se le carga a las demás; un turno explícito reemplaza al horario; sin horarios,
 *     partes iguales entre quienes marcaron asistencia; sin meta de la sede, ninguna fila (nunca inventa una);
 *   · AJUSTE: la líder de la sede cambia la meta del mes de una persona; queda una fila en el historial (con el antes), una línea en la actividad,
 *     y la del día se recalcula en proporción; volver a la automática también queda anotado;
 *   · ESTADOS IMPOSIBLES: sin motivo, meta ≤ 0, mayor que la de la sede, «otro» sin decir qué, persona de otra tienda, mes pasado, tienda sin meta,
 *     la propia meta (solo un Admin), una cuenta sin el módulo Rendimiento, una terminal, una meta que cambió mientras se editaba;
 *   · el historial no se edita ni se borra, y la web no lo toca directo;
 *   · LO QUE PINTA RENDIMIENTO: lo vendido por persona (hoy, 7 días, mes; sin anuladas, de prueba ni de otra tienda), la meta de la sede por día con lo ya
 *     asignado a las personas, y el historial de cambios con nombres, solo para quien ve la tienda;
 *   · ALCANCE: `fn_mi_meta` da SOLO lo mío (nunca lo de otra persona); `fn_metas_equipo` da el equipo completo de la tienda (aunque no haya
 *     vendido) a la líder de sede y al Admin, y nada a una integrante; las ventas por día son de quien atendió y de la tienda que se ve;
 *   · PERMISOS: las cuatro internas no las ejecuta nadie desde la web; las seis públicas, solo cuentas con sesión.
 *
 * CÓMO. Mismo patrón que `mis_ventas_del_dia.mjs` y `actividad.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el
 * Postgres local compartido). El local solo trae `personas` y `sedes` de Dynamic, así que cada escenario CREA dentro de su transacción las tablas de
 * horarios (`horarios_asignados`, `turnos`, `jornadas`) con la forma de producción; el rollback las borra.
 *
 * USO
 *   pnpm pruebas:metas-persona    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // Admin y líder, sin tienda
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const A_AUTH = "66666666-6666-4666-8666-0000000000a1"; // integrante de prueba
const B_AUTH = "66666666-6666-4666-8666-0000000000a2"; // integrante de prueba
const L_AUTH = "66666666-6666-4666-8666-0000000000a3"; // líder de la sede (encargada) de prueba
const T_AUTH = "66666666-6666-4666-8666-0000000000a4"; // terminal de prueba

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
}

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

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${INTENTO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

/**
 * El mundo de prueba: Trujillo con meta de 1.800 por día (1.845 los sábados: no es múltiplo de 10) y cuatro personas con horario:
 * Ana 8 h (9–18 con 1 h de refrigerio), Beto 6 h, Micaela 4 h y Lidia (la líder de la sede) 8 h. Un día cualquiera suman 26 h.
 *   lunes de 1.800: Ana 550 · Beto 420 · Lidia 550 · Micaela 280.
 */
const MUNDO = `
${cambiaA(FELIPE)}
create table public.horarios_asignados (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, vigente_desde date not null, vigente_hasta date,
  hora_entrada time, hora_salida time, almuerzo_min_minutos integer, almuerzo_max_minutos integer, dias_laborables integer[],
  horas_semana_objetivo numeric, created_at timestamptz not null default now(), horario_por_dia jsonb);
create table public.turnos (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, hora_entrada time, hora_salida time,
  origen text, es_descanso boolean not null default false, created_at timestamptz not null default now(), creado_por uuid);
create table public.jornadas (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, sede_id uuid, estado text default 'cerrada');

select id as trujillo, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as mic from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select (now() at time zone 'America/Lima')::date as hoy \\gset
select date_trunc('month', :'hoy'::date)::date as mes \\gset
select date_trunc('week', :'hoy'::date)::date as lunes \\gset
select (:'lunes'::date + 5) as sabado \\gset

insert into auth.users (id, aud, role, email) values
  ('${A_AUTH}', 'authenticated', 'authenticated', 'meta-ana@prueba.local'),
  ('${B_AUTH}', 'authenticated', 'authenticated', 'meta-beto@prueba.local'),
  ('${L_AUTH}', 'authenticated', 'authenticated', 'meta-lidia@prueba.local'),
  ('${T_AUTH}', 'authenticated', 'authenticated', 'meta-terminal@prueba.local');
insert into public.personas (auth_user_id, nombres, apellidos, rol, estado, sede_base_id) values
  ('${A_AUTH}', 'Ana', 'Prueba', 'integrante', 'activo', :'sede_tru'),
  ('${B_AUTH}', 'Beto', 'Prueba', 'integrante', 'activo', :'sede_tru'),
  ('${L_AUTH}', 'Lidia', 'Encargada', 'supervisor_sede', 'activo', :'sede_tru');
select id as pa from public.personas where auth_user_id = '${A_AUTH}' \\gset
select id as pb from public.personas where auth_user_id = '${B_AUTH}' \\gset
select id as pl from public.personas where auth_user_id = '${L_AUTH}' \\gset
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado, rol_id) values
  (:'pa', 'colaborador', :'trujillo', 'activo', retail.fn_rol_por_clave('integrante')),
  (:'pb', 'colaborador', :'trujillo', 'activo', retail.fn_rol_por_clave('integrante')),
  (:'pl', 'lider', :'trujillo', 'activo', retail.fn_rol_por_clave('lider'));
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'trujillo', 'Terminal prueba metas', retail.fn_rol_por_clave('terminal_ventas'), '${T_AUTH}');

-- Horarios: los mismos siete días de la semana (0 domingo…6 sábado), desde siempre y abiertos.
insert into public.horarios_asignados (persona_id, vigente_desde, horario_por_dia)
select x.p, date '2000-01-01',
       (select jsonb_object_agg(d::text, jsonb_build_object('e', x.e, 's', x.s, 'r', x.r)) from generate_series(0, 6) d)
  from (values (:'pa'::uuid, '09:00', '18:00', 60), (:'pb'::uuid, '10:00', '16:00', 0),
               (:'mic'::uuid, '14:00', '18:00', 0), (:'pl'::uuid, '09:00', '17:00', 0)) as x(p, e, s, r);

-- La meta de la sede: 1.800 cada día, salvo el sábado (dia_semana 5) con 1.845.
insert into retail.ubicacion_metas_dia (ubicacion_id, dia_semana, meta)
select :'trujillo'::uuid, g::smallint, case when g = 5 then 1845 else 1800 end from generate_series(0, 6) g;

-- Etiqueta corta de cada persona para leer los resultados: A=Ana, B=Beto, L=Lidia, M=Micaela. (psql no sustituye variables dentro de un
-- bloque de dólares, así que las etiquetas viven en una tabla temporal y no en el cuerpo de la función.)
create temp table _p (id uuid primary key, k text);
insert into _p values (:'pa'::uuid, 'A'), (:'pb'::uuid, 'B'), (:'pl'::uuid, 'L'), (:'mic'::uuid, 'M');
create function pg_temp.q(p uuid) returns text language sql as $f$ select coalesce((select k from _p where id = p), '?') $f$;

-- Llama a fijar_meta_persona y devuelve el mensaje del error (o SIN_ERROR): con parámetros tipados para que psql sustituya las variables afuera.
create function pg_temp.intento_fijar(p_persona uuid, p_ubic uuid, p_mes date, p_meta numeric, p_motivo text,
                                      p_detalle text default null, p_esperada numeric default null) returns text language plpgsql as $f$
declare v_msg text;
begin
  perform retail.fijar_meta_persona(p_persona, p_ubic, p_mes, p_meta, p_motivo, p_detalle, p_esperada);
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;

/** «A=550,B=420,L=550,M=280» del reparto de un día. */
const REPARTO = (dia) =>
  `select coalesce(string_agg(pg_temp.q(persona_id) || '=' || meta_auto::int, ',' order by pg_temp.q(persona_id)), '(sin filas)')
     from retail.fn_reparto_meta(:'trujillo', ${dia}, ${dia});`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1400)}`);
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);
const contiene = (r, texto) => (ultima(r) ?? "").includes(texto);

// ───────────────────────── REPARTO ─────────────────────────

// 1. Una meta múltiplo de 10: cada una según sus horas y la suma es EXACTAMENTE 1.800.
{
  const r = correr(`${MUNDO}${REPARTO(":'lunes'")}`);
  esperar("reparto por horas: Ana 550, Beto 420, Lidia 550, Micaela 280 (el lunes de 1.800)", ultima(r) === "A=550,B=420,L=550,M=280", r);
  const s = correr(`${MUNDO}select sum(meta_auto) || '|' || min(base) || '|' || count(*) from retail.fn_reparto_meta(:'trujillo', :'lunes', :'lunes');`);
  esperar("las partes suman EXACTO la meta de la sede (1.800), con base «horas»", ultima(s) === "1800|horas|4", s);
}

// 2. Una meta que NO es múltiplo de 10 (el sábado, 1.845): el paso baja a S/ 1 y la suma sigue siendo exacta.
{
  const r = correr(`${MUNDO}select sum(meta_auto) || '|' || count(*) from retail.fn_reparto_meta(:'trujillo', :'sabado', :'sabado');`);
  esperar("con una meta que no es múltiplo de 10 (1.845) la suma sigue siendo exacta", ultima(r) === "1845|4", r);
}

// 3. Un descanso vale 0 y su parte NO se le carga a las demás: se reparte entre las que trabajan.
{
  const r = correr(`${MUNDO}insert into public.turnos (persona_id, fecha, es_descanso) values (:'pb', :'lunes', true);
${REPARTO(":'lunes'")}`);
  esperar("un descanso (turnos) vale 0 y el día se reparte entre las que trabajan: Ana 720, Lidia 720, Micaela 360", ultima(r) === "A=720,L=720,M=360", r);
}

// 4. Un turno explícito reemplaza al horario de ese día.
{
  const r = correr(`${MUNDO}insert into public.turnos (persona_id, fecha, hora_entrada, hora_salida, es_descanso) values (:'mic', :'lunes', '09:00', '21:00', false);
select h.horas || '|' || h.fuente || '|' || (select fuente from retail.fn_horas_programadas(:'trujillo', :'lunes', :'lunes') where persona_id = :'pa')
  from retail.fn_horas_programadas(:'trujillo', :'lunes', :'lunes') h where h.persona_id = :'mic';`);
  esperar("un turno de ese día reemplaza al horario (12 h, fuente turno; las demás siguen con su horario)", ultima(r) === "12.00|turno|horario", r);
}

// 5. Sin horarios: partes iguales entre quienes marcaron asistencia ese día; si nadie marcó, nada.
{
  const r = correr(`${MUNDO}delete from public.horarios_asignados;
insert into public.jornadas (persona_id, fecha, sede_id) values (:'pa', :'lunes', :'sede_tru'), (:'mic', :'lunes', :'sede_tru');
${REPARTO(":'lunes'")}`);
  esperar("sin horarios: partes iguales entre quienes marcaron asistencia (Ana 900, Micaela 900)", ultima(r) === "A=900,M=900", r);
  const b = correr(`${MUNDO}delete from public.horarios_asignados;
insert into public.jornadas (persona_id, fecha, sede_id) values (:'pa', :'lunes', :'sede_tru'), (:'mic', :'lunes', :'sede_tru');
select string_agg(distinct base, ',') from retail.fn_reparto_meta(:'trujillo', :'lunes', :'lunes');`);
  esperar("y la base dice «iguales» (la pantalla puede decirlo)", ultima(b) === "iguales", b);
  const n = correr(`${MUNDO}delete from public.horarios_asignados;
${REPARTO(":'lunes'")}`);
  esperar("sin horarios y sin nadie que haya marcado: ese día queda sin asignar", ultima(n) === "(sin filas)", n);
}

// 6. Dynamic ausente o con otra forma: se degrada, no se rompe.
{
  const r = correr(`${MUNDO}drop table public.horarios_asignados; drop table public.turnos; drop table public.jornadas;
select (select count(*) from retail.fn_horas_programadas(:'trujillo', :'lunes', :'lunes')) || '|' ||
       (select count(*) from retail.fn_reparto_meta(:'trujillo', :'lunes', :'lunes'));`);
  esperar("sin las tablas de Dynamic no hay error: 0 horas y 0 filas de reparto", ultima(r) === "0|0", r);
  const f = correr(`${MUNDO}update public.horarios_asignados set horario_por_dia = jsonb_set(horario_por_dia, '{1,e}', '"no es hora"') where persona_id = :'pa';
select (select count(*) from retail.fn_horas_programadas(:'trujillo', :'lunes', :'lunes')) || '|' ||
       (select count(*) from retail.fn_reparto_meta(:'trujillo', :'lunes', :'lunes'));`);
  esperar("un horario ilegible degrada a «sin horarios» (0 filas), no rompe la función", ultima(f) === "0|0", f);
}

// 7. Sin meta de la sede, ninguna fila: nunca se inventa una meta.
{
  const r = correr(`${MUNDO}delete from retail.ubicacion_metas_dia where ubicacion_id = :'trujillo';
${REPARTO(":'lunes'")}`);
  esperar("sin meta de la sede no hay reparto (nunca inventa una)", ultima(r) === "(sin filas)", r);
}

// ───────────────────────── AJUSTE ─────────────────────────

// 8. La líder de la sede cambia la meta del mes de Ana: queda el ajuste, el historial y la actividad; y se puede volver a la automática.
{
  const r = correr(`${MUNDO}
${cambiaA(L_AUTH)}
select meta_auto_mes as auto_a from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select sum(meta_hoy) as hoy_antes from retail.fn_metas_equipo(:'mes') \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') as nueva \\gset
select :'nueva' || '|' ||
       (select meta_mes || '/' || meta_ajustada_mes || '/' || meta_auto_mes from retail.fn_metas_equipo(:'mes') where persona_id = :'pa') || '|' ||
       (select count(*) || '/' || min(meta_antes) || '/' || min(motivo) from retail.metas_persona_ajustes where persona_id = :'pa') || '|' ||
       (select count(*) from retail.actividad where modulo = 'rendimiento' and accion = 'meta_persona_ajustada' and persona_id = :'pl') || '|' ||
       (:'auto_a'::numeric > 0);`);
  const [nueva, estado, hist, act, hayAuto] = (ultima(r) ?? "").split("|");
  esperar("fijar_meta_persona devuelve la meta vigente (20000)", Number(nueva) === 20000, r);
  esperar("la meta del mes de Ana es 20000, marcada como ajustada, y la automática se conserva", /^20000(\.0+)?\/20000(\.0+)?\/\d+/.test(estado ?? ""), r);
  esperar("queda UNA fila en el historial con el antes (la automática) y el motivo", /^1\/\d+(\.\d+)?\/cambia_horario$/.test(hist ?? ""), r);
  esperar("queda su línea en la actividad, firmada por la líder de la sede", act === "1" && (hayAuto === "t" || hayAuto === "true"), r);

  const prop = correr(`${MUNDO}
${cambiaA(L_AUTH)}
select meta_auto_mes as auto_a, meta_hoy as hoy_a_antes from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', :'auto_a'::numeric * 0.5, 'capacitacion') \\gset
select (meta_hoy = round(:'hoy_a_antes'::numeric * 0.5 / 10) * 10) || '|' || (meta_mes = :'auto_a'::numeric * 0.5)
  from retail.fn_metas_equipo(:'mes') where persona_id = :'pa';`);
  esperar("la meta del día se recalcula en la misma proporción que la del mes (la mitad)", ["t|t", "true|true"].includes(ultima(prop) ?? ""), prop);

  const volver = correr(`${MUNDO}
${cambiaA(L_AUTH)}
select meta_auto_mes as auto_a from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'otro', 'prueba') \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', null, null) as vuelta \\gset
select (:'vuelta'::numeric = :'auto_a'::numeric) || '|' ||
       (select (meta_ajustada_mes is null) || '/' || (meta_mes = meta_auto_mes) from retail.fn_metas_equipo(:'mes') where persona_id = :'pa') || '|' ||
       (select string_agg(motivo, ',' order by id) from retail.metas_persona_ajustes where persona_id = :'pa');`);
  esperar("volver a la automática devuelve la meta automática y también queda anotado", ultima(volver) === "true|true/true|otro,automatica" || ultima(volver) === "t|t/t|otro,automatica", volver);

  const repetir = correr(`${MUNDO}
${cambiaA(L_AUTH)}
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select retail.fijar_meta_persona(:'pb', :'trujillo', :'mes', null, null) \\gset
select count(*) from retail.metas_persona_ajustes;`);
  esperar("pedir lo que ya vale, o volver a la automática estando en ella, no agrega filas al historial", ultima(repetir) === "1", repetir);
}

// 9. El Admin también cambia metas, y la suya propia (a diferencia de la líder de la sede).
{
  const r = correr(`${MUNDO}
${cambiaA(FELIPE)}
select retail.fijar_meta_persona(:'pl', :'trujillo', :'mes', 15000, 'cambia_horario') as nueva \\gset
select :'nueva';`);
  esperar("un Admin cambia la meta de la encargada", Number(ultima(r)) === 15000, r);
}

// ───────────────────────── ESTADOS IMPOSIBLES ─────────────────────────

const COMO_LIDER = `${MUNDO}${cambiaA(L_AUTH)}`;
const FIJAR = (args) => `select pg_temp.intento_fijar(${args});`;
{
  const malos = [
    ["sin motivo", `:'pa', :'trujillo', :'mes', 20000, null`, "Elige el motivo"],
    ["con el motivo de «volver a la automática» pero con una meta", `:'pa', :'trujillo', :'mes', 20000, 'automatica'`, "Elige el motivo"],
    ["con un motivo que no está en la lista", `:'pa', :'trujillo', :'mes', 20000, 'porque si'`, "Elige el motivo"],
    ["«otro» sin decir qué", `:'pa', :'trujillo', :'mes', 20000, 'otro'`, "Cuenta el motivo"],
    ["una meta de cero", `:'pa', :'trujillo', :'mes', 0, 'cambia_horario'`, "mayor que cero"],
    ["una meta negativa", `:'pa', :'trujillo', :'mes', -5, 'cambia_horario'`, "mayor que cero"],
    ["una meta mayor que la de la tienda en el mes", `:'pa', :'trujillo', :'mes', 9999999, 'cambia_horario'`, "no puede pasar de la de la tienda"],
    ["la meta de una persona que no es de esa tienda (un Admin sin tienda)", `:'felipe', :'trujillo', :'mes', 100, 'cambia_horario'`, "no es de esta tienda"],
    ["la propia meta de la líder de la sede", `:'pl', :'trujillo', :'mes', 15000, 'cambia_horario'`, "Tu propia meta la cambia un Admin"],
    ["una meta de un mes que ya pasó", `:'pa', :'trujillo', (:'mes'::date - interval '1 month')::date, 20000, 'cambia_horario'`, "meses que ya pasaron"],
    ["una tienda donde no tiene alcance", `:'pa', :'lima', :'mes', 20000, 'cambia_horario'`, "No puedes cambiar metas de esa tienda"],
    ["con una meta que cambió mientras se editaba", `:'pa', :'trujillo', :'mes', 20000, 'cambia_horario', null, 1`, "cambió mientras la editabas"],
  ];
  for (const [nombre, args, texto] of malos) {
    const r = correr(`${COMO_LIDER}${FIJAR(args)}`);
    esperar(`no se puede fijar ${nombre}`, contiene(r, texto), r);
  }
  const sinMeta = correr(`${MUNDO}delete from retail.ubicacion_metas_dia where ubicacion_id = :'trujillo';\n${cambiaA(L_AUTH)}${FIJAR(`:'pa', :'trujillo', :'mes', 20000, 'cambia_horario'`)}`);
  esperar("no se puede fijar si la tienda no tiene meta cargada (no hay contra qué)", contiene(sinMeta, "no tiene meta cargada"), sinMeta);
  const sinHoras = correr(`${MUNDO}delete from public.horarios_asignados where persona_id = :'pb';\n${cambiaA(L_AUTH)}${FIJAR(`:'pb', :'trujillo', :'mes', 100, 'cambia_horario'`)}`);
  esperar("no se puede fijar la meta de quien no tiene horas ni asistencia ese mes", contiene(sinHoras, "no hay meta que ajustar"), sinHoras);

  const integrante = correr(`${MUNDO}${cambiaA(MICAELA)}${FIJAR(`:'pa', :'trujillo', :'mes', 20000, 'cambia_horario'`)}`);
  esperar("una integrante (sin el módulo Rendimiento) no puede cambiar metas", contiene(integrante, "No puedes cambiar metas de esa tienda"), integrante);
  const terminal = correr(`${MUNDO}${cambiaA(T_AUTH)}${FIJAR(`:'pa', :'trujillo', :'mes', 20000, 'cambia_horario'`)}`);
  esperar("una terminal no puede cambiar metas", contiene(terminal, "Elige quién hace esta operación"), terminal);
}

// 10. Concurrencia (secuencial): quien editaba con la meta vieja NO pisa el cambio de otra persona.
{
  const r = correr(`${MUNDO}${cambiaA(L_AUTH)}
select meta_mes as vieja from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select pg_temp.intento(format($$select retail.fijar_meta_persona(%L, %L, %L, 30000, 'cambia_horario', null, %s)$$, :'pa', :'trujillo', :'mes', :'vieja')) || '|' ||
       (select meta_mes from retail.fn_metas_equipo(:'mes') where persona_id = :'pa');`);
  const [msg, meta] = (ultima(r) ?? "").split("|");
  esperar("la segunda edición con la meta vieja se rechaza y la primera se conserva", (msg ?? "").includes("cambió mientras la editabas") && Number(meta) === 20000, r);
}

// ───────────────────────── HISTORIAL ─────────────────────────

{
  const r = correr(`${MUNDO}${cambiaA(L_AUTH)}
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select pg_temp.intento($$update retail.metas_persona_ajustes set meta = 1$$) || '|' ||
       pg_temp.intento($$delete from retail.metas_persona_ajustes$$) || '|' ||
       has_table_privilege('authenticated', 'retail.metas_persona_ajustes', 'select') || '|' ||
       has_table_privilege('authenticated', 'retail.metas_persona_ajustes', 'insert') || '|' ||
       has_table_privilege('anon', 'retail.metas_persona_ajustes', 'select');`);
  const [upd, del, sel, ins, anon] = (ultima(r) ?? "").split("|");
  esperar("el historial no se edita ni se borra", (upd ?? "").includes("no se edita ni se borra") && (del ?? "").includes("no se edita ni se borra"), r);
  esperar("la web no lee ni escribe el historial directo (ni authenticated ni anon)", [sel, ins, anon].every((x) => x === "f" || x === "false"), r);
}

// ───────────────────────── ALCANCE DE LAS LECTURAS ─────────────────────────

// 11. fn_mi_meta: SOLO lo mío.
{
  const r = correr(`${MUNDO}
${cambiaA(L_AUTH)}
select meta_mes as m_mic from retail.fn_metas_equipo(:'mes') where persona_id = :'mic' \\gset
select meta_mes as m_pa from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
${cambiaA(MICAELA)}
select min(meta_mes) as mio, max(meta_mes) as mio_max, sum(meta_dia) as suma_dias from retail.fn_mi_meta() where mes = :'mes'::date \\gset
select (:'mio'::numeric = :'m_mic'::numeric) || '|' || (:'mio'::numeric <> :'m_pa'::numeric) || '|' || (:'mio' = :'mio_max') || '|' || (:'suma_dias'::numeric = :'m_mic'::numeric);`);
  const [esLaSuya, noEsDeAna, unSoloValor, sumaDias] = (ultima(r) ?? "").split("|").map((x) => x === "t" || x === "true");
  esperar("fn_mi_meta le da a Micaela solo SU meta del mes (la de ella, no la de Ana) y es un solo valor", esLaSuya && noEsDeAna && unSoloValor, r);
  esperar("los días de fn_mi_meta suman la meta del mes de Micaela", sumaDias, r);
  const dias = correr(`${MUNDO}${cambiaA(MICAELA)}
select count(*) filter (where fecha between :'hoy'::date - 6 and :'hoy'::date) || '|' || (count(*) >= 28) from retail.fn_mi_meta();`);
  esperar("fn_mi_meta trae los días del mes y de los últimos 7 días hasta hoy", (ultima(dias) ?? "").startsWith("7|"), dias);
  const otra = correr(`${MUNDO}${cambiaA(A_AUTH)}select count(*) from retail.fn_mi_meta();`);
  esperar("Ana recibe su propia meta (no la de Micaela): tiene filas", Number(ultima(otra)) > 0, otra);
  const term = correr(`${MUNDO}${cambiaA(T_AUTH)}select count(*) from retail.fn_mi_meta();`);
  esperar("una terminal recibe 0 filas de fn_mi_meta, sin error", ultima(term) === "0", term);
  const admin = correr(`${MUNDO}${cambiaA(FELIPE)}select count(*) from retail.fn_mi_meta();`);
  esperar("un Admin sin tienda no tiene «mi meta»: 0 filas", ultima(admin) === "0", admin);
  const sinMeta = correr(`${MUNDO}delete from retail.ubicacion_metas_dia where ubicacion_id = :'trujillo';\n${cambiaA(MICAELA)}select count(*) from retail.fn_mi_meta();`);
  esperar("sin meta de la sede, fn_mi_meta da 0 filas (la pantalla no dibuja «0 %»)", ultima(sinMeta) === "0", sinMeta);
}

// 12. fn_metas_equipo: el equipo completo a la líder de la sede y al Admin; nada a una integrante.
{
  const r = correr(`${MUNDO}${cambiaA(L_AUTH)}
select string_agg(pg_temp.q(persona_id) || case when es_encargada then '*' else '' end, ',' order by pg_temp.q(persona_id)) || '|' || count(distinct ubicacion_id) || '|' ||
       (sum(meta_hoy) = (select round(p.meta) from retail.fn_parametros_caja(:'trujillo', :'hoy'::date) p))
  from retail.fn_metas_equipo(:'mes');`);
  esperar("la líder de la sede ve a las cuatro de su tienda (aunque no vendieron), solo Lidia como encargada, y las metas de hoy suman la de la sede",
    ["A,B,L*,M|1|true", "A,B,L*,M|1|t"].includes(ultima(r) ?? ""), r);
  // En el local, Felipe y Sandra (Admin) tienen su sede base de Dynamic en Lima y por eso cuentan como personas de Lima; en producción los
  // Admin están en Central y no son de ninguna tienda. Por eso se cuenta lo de Trujillo y se comprueba que Lima aparece como otra tienda.
  const ad = correr(`${MUNDO}${cambiaA(FELIPE)}select count(*) filter (where ubicacion_id = :'trujillo') || '|' || (count(distinct ubicacion_id) >= 2) from retail.fn_metas_equipo(:'mes');`);
  esperar("el Admin ve el equipo de Trujillo (4 personas) y también las otras tiendas que ve", ["4|t", "4|true"].includes(ultima(ad) ?? ""), ad);
  const mi = correr(`${MUNDO}${cambiaA(MICAELA)}select count(*) from retail.fn_metas_equipo(:'mes');`);
  esperar("una integrante no ve nada de fn_metas_equipo (0 filas)", ultima(mi) === "0", mi);
  const te = correr(`${MUNDO}${cambiaA(T_AUTH)}select count(*) from retail.fn_metas_equipo(:'mes');`);
  esperar("una terminal tampoco (0 filas)", ultima(te) === "0", te);
  const horario = correr(`${MUNDO}${cambiaA(L_AUTH)}select entrada_hoy || '|' || salida_hoy || '|' || horas_hoy from retail.fn_metas_equipo(:'mes') where persona_id = :'pa';`);
  esperar("trae el turno de hoy de cada una (Ana 09:00–18:00, 8 horas)", ultima(horario) === "09:00|18:00|8.00", horario);
}

// 13. Ventas por día: las mías, y las de la tienda que se ve.
{
  const tienda = correr(`${MUNDO}
create function pg_temp.venta(p_ubic uuid, p_asesora uuid, p_hace interval, p_cant int, p_precio numeric) returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, created_at) values (p_ubic, p_asesora, p_asesora, now() - p_hace) returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
end;
$f$;
${cambiaA(L_AUTH)}
select total as base_hoy from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date) \\gset
select pg_temp.venta(:'trujillo', :'pa', interval '0', 2, 50);
select pg_temp.venta(:'trujillo', :'pb', interval '0', 1, 80);
select (select total - :'base_hoy'::numeric from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date));`);
  esperar("fn_rendimiento_serie suma lo de toda la tienda (100 + 80 = 180 más lo de hoy)", Number(ultima(tienda)) === 180, tienda);

  const mias = correr(`${MUNDO}
create function pg_temp.venta(p_ubic uuid, p_asesora uuid, p_hace interval, p_cant int, p_precio numeric) returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, created_at) values (p_ubic, p_asesora, p_asesora, now() - p_hace) returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
end;
$f$;
select pg_temp.venta(:'trujillo', :'pa', interval '0', 2, 50);
select pg_temp.venta(:'trujillo', :'pb', interval '0', 1, 80);
${cambiaA(A_AUTH)}
select count(*) || '|' || (select total from retail.fn_mis_ventas_por_dia(:'hoy'::date, :'hoy'::date))
  from retail.fn_mis_ventas_por_dia(:'hoy'::date - 2, :'hoy'::date);`);
  const [n, total] = (ultima(mias) ?? "").split("|");
  esperar("fn_mis_ventas_por_dia devuelve un día por fila (3, aunque sean 0) y solo lo que atendió Ana (100, no los 80 de Beto)", n === "3" && Number(total) >= 100 && Number(total) < 180 + 1 && Number(total) % 1 === 0, mias);

  const ajena = correr(`${MUNDO}${cambiaA(MICAELA)}select pg_temp.intento(format($$select * from retail.fn_rendimiento_serie(%L, current_date, current_date)$$, :'trujillo'));`);
  esperar("una integrante no puede ver la serie de la tienda", contiene(ajena, "No puedes ver el rendimiento de esa tienda"), ajena);
  const rango = correr(`${MUNDO}${cambiaA(L_AUTH)}select pg_temp.intento(format($$select * from retail.fn_rendimiento_serie(%L, current_date - 200, current_date)$$, :'trujillo'));`);
  esperar("un rango de más de 93 días se rechaza", contiene(rango, "rango de fechas no es válido"), rango);
  const termv = correr(`${MUNDO}${cambiaA(T_AUTH)}select count(*) from retail.fn_mis_ventas_por_dia(:'hoy'::date - 2, :'hoy'::date);`);
  esperar("una terminal recibe 0 filas de fn_mis_ventas_por_dia", ultima(termv) === "0", termv);
}

// ───────────────────────── LO VENDIDO POR PERSONA, LA META DE LA SEDE POR DÍA Y EL HISTORIAL (lo que pinta Rendimiento) ─────────────────────────

const VENTA_HELPER = `
create function pg_temp.venta2(p_ubic uuid, p_asesora uuid, p_hace interval, p_cant int, p_precio numeric,
                               p_anulada boolean default false, p_prueba boolean default false) returns void language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, asesora_id, usuario_id, created_at, es_prueba, estado, anulado_en, motivo_anulacion, anulado_por)
  values (p_ubic, p_asesora, p_asesora, now() - p_hace, p_prueba, case when p_anulada then 'anulada' else 'completada' end,
          case when p_anulada then now() end, case when p_anulada then 'prueba' end, case when p_anulada then p_asesora end)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values (v, (select id from retail.variantes order by id limit 1), p_cant, p_precio, 0);
end;
$f$;
`;

// 14. fn_metas_equipo trae lo que vendió cada una (hoy, 7 días, mes) con la definición de Rendimiento.
{
  const r = correr(`${MUNDO}${VENTA_HELPER}
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 2, 50);                    -- Ana, hoy: 100
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 1, 30);                    -- Ana, hoy: otra venta de 30
select pg_temp.venta2(:'trujillo', :'pb', interval '0', 1, 80);                    -- Beto, hoy: 80
select pg_temp.venta2(:'trujillo', :'pa', interval '3 days', 1, 70);               -- Ana, hace 3 días: 70 (cuenta en 7 días, no en hoy)
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 5, 100, true, false);      -- anulada: no cuenta
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 5, 100, false, true);      -- de prueba: no cuenta
select pg_temp.venta2(:'lima', :'pa', interval '0', 5, 100);                       -- otra tienda: no cuenta acá
${cambiaA(L_AUTH)}
select string_agg(pg_temp.q(persona_id) || '=' || vendido_hoy::int || '/' || ventas_hoy || '/' || vendido_7d::int || '/' || ventas_7d, ',' order by pg_temp.q(persona_id))
  from retail.fn_metas_equipo(:'mes') where ubicacion_id = :'trujillo';`);
  const linea = ultima(r) ?? "";
  // Ana: hoy 130 en 2 ventas; 7 días 200 en 3 (a menos que hace 3 días caiga en el mes anterior: el 7d no depende del mes). Beto: 80 en 1. Lidia y Micaela: 0.
  esperar("fn_metas_equipo suma lo vendido por persona: Ana 130 hoy (2 ventas) y 200 en 7 días; Beto 80; sin contar anuladas, de prueba ni de otra tienda",
    linea === "A=130/2/200/3,B=80/1/80/1,L=0/0/0/0,M=0/0/0/0", r);
  const mes = correr(`${MUNDO}${VENTA_HELPER}
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 2, 50);
${cambiaA(L_AUTH)}
select (vendido_mes = 100) || '|' || (ventas_mes = 1) from retail.fn_metas_equipo(:'mes') where persona_id = :'pa';`);
  esperar("lo vendido del mes incluye lo de hoy (100 en 1 venta)", ["t|t", "true|true"].includes(ultima(mes) ?? ""), mes);
  const previo = correr(`${MUNDO}${VENTA_HELPER}
select pg_temp.venta2(:'trujillo', :'pa', interval '0', 2, 50);
${cambiaA(L_AUTH)}
select (vendido_mes = 0) || '|' || (vendido_hoy = 100) from retail.fn_metas_equipo((:'mes'::date - interval '1 month')::date) where persona_id = :'pa';`);
  esperar("pedir otro mes no mezcla lo de este: en el mes anterior Ana no tiene ventas del mes (y «hoy» sigue siendo hoy, no el mes pedido)", ["t|t", "true|true"].includes(ultima(previo) ?? ""), previo);
}

// 15. fn_rendimiento_serie trae la meta de la sede de cada día y lo ya asignado a las personas.
{
  const r = correr(`${MUNDO}${cambiaA(L_AUTH)}
select (meta_sede = (select round(p.meta) from retail.fn_parametros_caja(:'trujillo', :'hoy'::date) p)) || '|' ||
       (meta_asignada = meta_sede) || '|' ||
       (meta_asignada = (select sum(meta_hoy) from retail.fn_metas_equipo(:'mes') where ubicacion_id = :'trujillo'))
  from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date);`);
  esperar("la serie trae la meta de la sede de hoy y lo asignado a las cuatro cuadra con ella y con la suma de fn_metas_equipo",
    ["t|t|t", "true|true|true"].includes(ultima(r) ?? ""), r);
  const ajust = correr(`${MUNDO}${cambiaA(L_AUTH)}
select meta_auto_mes as auto_a from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', :'auto_a'::numeric * 0.5, 'capacitacion') \\gset
select (meta_asignada < meta_sede) || '|' ||
       (meta_asignada = (select sum(meta_hoy) from retail.fn_metas_equipo(:'mes') where ubicacion_id = :'trujillo'))
  from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date);`);
  esperar("si la líder baja la meta de Ana, lo asignado queda por debajo de la meta de la sede (la pantalla dice cuánto falta por asignar)",
    ["t|t", "true|true"].includes(ultima(ajust) ?? ""), ajust);
  const sinHorarios = correr(`${MUNDO}delete from public.horarios_asignados;
${cambiaA(L_AUTH)}
select (meta_sede is not null) || '|' || (meta_asignada is null)
  from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date);`);
  esperar("sin horarios ni asistencia: la meta de la sede se ve y lo asignado es nulo (nada repartido, nunca un 0 inventado)",
    ["t|t", "true|true"].includes(ultima(sinHorarios) ?? ""), sinHorarios);
  const sinMetaSede = correr(`${MUNDO}delete from retail.ubicacion_metas_dia where ubicacion_id = :'trujillo';
${cambiaA(L_AUTH)}
select (meta_sede is null) || '|' || (meta_asignada is null) from retail.fn_rendimiento_serie(:'trujillo', :'hoy'::date, :'hoy'::date);`);
  esperar("sin meta de la sede la serie trae ventas pero meta nula", ["t|t", "true|true"].includes(ultima(sinMetaSede) ?? ""), sinMetaSede);
}

// 16. fn_metas_historial: los cambios del mes, con nombres, solo a quien ve la tienda.
{
  const r = correr(`${MUNDO}${cambiaA(L_AUTH)}
select meta_auto_mes as auto_a from retail.fn_metas_equipo(:'mes') where persona_id = :'pa' \\gset
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select retail.fijar_meta_persona(:'pb', :'trujillo', :'mes', 12000, 'otro', 'vuelve de licencia') \\gset
select count(*) || '|' || string_agg(persona || ':' || meta::int || ':' || motivo || ':' || cambiado_por, ',' order by id)
  from retail.fn_metas_historial(:'trujillo');`);
  esperar("el historial trae los dos cambios del mes con el nombre de a quién y de quién los hizo",
    ultima(r) === "2|Ana P.:20000:cambia_horario:Lidia E.,Beto P.:12000:otro:Lidia E.", r);
  const orden = correr(`${MUNDO}${cambiaA(L_AUTH)}
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select retail.fijar_meta_persona(:'pb', :'trujillo', :'mes', 12000, 'cambia_horario') \\gset
select persona from retail.fn_metas_historial(:'trujillo') limit 1;`);
  esperar("del más nuevo al más viejo", ultima(orden) === "Beto P.", orden);
  const otroMes = correr(`${MUNDO}${cambiaA(L_AUTH)}
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
select count(*) from retail.fn_metas_historial(:'trujillo', (:'mes'::date - interval '1 month')::date);`);
  esperar("el historial de otro mes no trae los cambios de este", ultima(otroMes) === "0", otroMes);
  const admin = correr(`${MUNDO}${cambiaA(L_AUTH)}
select retail.fijar_meta_persona(:'pa', :'trujillo', :'mes', 20000, 'cambia_horario') \\gset
${cambiaA(FELIPE)}
select count(*) from retail.fn_metas_historial(:'trujillo');`);
  esperar("un Admin también lo ve", ultima(admin) === "1", admin);
  const integrante = correr(`${MUNDO}${cambiaA(MICAELA)}select pg_temp.intento(format($$select * from retail.fn_metas_historial(%L)$$, :'trujillo'));`);
  esperar("una integrante no puede leer el historial de metas", contiene(integrante, "No puedes ver el rendimiento de esa tienda"), integrante);
  const lima = correr(`${MUNDO}${cambiaA(L_AUTH)}select pg_temp.intento(format($$select * from retail.fn_metas_historial(%L)$$, :'lima'));`);
  esperar("la líder de Trujillo no lee el historial de Lima", contiene(lima, "No puedes ver el rendimiento de esa tienda"), lima);
}

// ───────────────────────── PERMISOS ─────────────────────────
{
  const internas = ["fn_horas_programadas(uuid,date,date)", "fn_asistencia_por_dia(uuid,date,date)", "fn_reparto_meta(uuid,date,date)", "fn_metas_por_dia(uuid,date,date)"];
  const publicas = ["fn_metas_equipo(date)", "fn_mi_meta()", "fn_mis_ventas_por_dia(date,date)", "fn_rendimiento_serie(uuid,date,date)",
    "fn_metas_historial(uuid,date)", "fijar_meta_persona(uuid,uuid,date,numeric,text,text,numeric)"];
  const q = (rol, fns) => fns.map((f) => `has_function_privilege('${rol}', 'retail.${f}', 'execute')`).join(" || ',' || ");
  const r = correr(`select (${q("authenticated", internas)}) || '|' || (${q("anon", internas)}) || '|' || (${q("authenticated", publicas)}) || '|' || (${q("anon", publicas)});`);
  const [aInt, anInt, aPub, anPub] = (ultima(r) ?? "").split("|");
  const todos = (s, v) => (s ?? "").split(",").every((x) => x === v || (v === "false" && x === "f") || (v === "true" && x === "t"));
  esperar("las 4 funciones internas no las ejecuta nadie desde la web", todos(aInt, "false") && todos(anInt, "false"), r);
  esperar("las 6 públicas las ejecuta authenticated y no anon", todos(aPub, "true") && todos(anPub, "false"), r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
