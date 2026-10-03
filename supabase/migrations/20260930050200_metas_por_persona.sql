-- ============================================================================
-- METAS POR PERSONA — la meta de la sede baja a cada integrante por sus horas programadas (ADR-0286, D-142 a D-160)
-- ----------------------------------------------------------------------------
-- PROMETE (en tres líneas):
--   1. `fn_reparto_meta` reparte la meta de la sede de cada día entre las personas de la tienda según sus horas programadas
--      (Dynamic), y las partes de un día suman EXACTAMENTE esa meta. Sin horarios, partes iguales entre quienes marcaron asistencia.
--   2. `fijar_meta_persona` deja que la líder de la sede (o un Admin) cambie la meta DEL MES de una persona, con motivo, en una sola
--      transacción y con un historial (`metas_persona_ajustes`) que nadie edita ni borra. Nadie cambia la suya, salvo un Admin.
--   3. `fn_metas_equipo` (líder/Admin, con lo vendido por persona) y `fn_mi_meta` (solo lo mío) leen de la MISMA definición;
--      `fn_mis_ventas_por_dia` y `fn_rendimiento_serie` (con la meta de la sede por día) dan las ventas por día para el gráfico, y
--      `fn_metas_historial` lee los cambios de meta (la tabla no se lee directo).
--
-- ASUME: que la sede tiene meta (`ubicacion_metas_dia`, campañas incluidas, por `fn_parametros_caja`): sin ella no hay nada que repartir y
--   las funciones devuelven 0 filas, NUNCA una meta inventada. Que Dynamic mantiene vigentes los horarios (`public.horarios_asignados`, hoy 21
--   abiertos de 31 personas): `public.turnos` termina el 2026-09-21, así que solo cuenta como EXCEPCIÓN de un día (un descanso vale 0 h).
--   Que «la persona es de la tienda» lo dice `fn_ubicacion_de_partida` (la asignada; para un líder, la de su sede de Dynamic), el mismo
--   criterio de `fn_rendimiento_ubicaciones`.
--
-- LO QUE NO TOCA: `roles`, `rol_modulos` ni `modulos` (D-160): se reutiliza el módulo `rendimiento` (D-157). Tampoco `ventas`, `venta_items`,
--   `movimientos` ni `stock`. Solo agrega UNA tabla nueva y funciones.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (regla de «Políticas y deadlocks» de CLAUDE.md): NO hay políticas ni `drop trigger`. La PARTE 1 crea una tabla con
--   llaves hacia `ubicaciones` y `personas` (toman un candado breve sobre ellas: por eso `lock_timeout = '3s'`). Las PARTES 2 a 4 son solo
--   `create or replace function`. Cada parte se puede pegar por separado y todas son re-ejecutables. Antes de pegar: ensayo con rollback y ok
--   puntual de Felipe. ANTES que la web: sin estas funciones la web oculta el bloque de meta.
-- CÓMO SE REVIERTE: `drop function` de cada función de abajo y `drop table retail.metas_persona_ajustes` (solo si se decide olvidar el historial).
--
-- CAÍDA EXTERNA: si Dynamic no está tal como se espera (tabla o columna que falta, un horario con formato ilegible), `fn_horas_programadas`
--   y `fn_asistencia_por_dia` devuelven «nada» y el reparto cae a partes iguales: se degrada, no se rompe Rendimiento.
-- CONCURRENCIA: dos personas que cambian la meta de la misma persona a la vez se ponen en fila con un candado de la base y, además, cada
--   una dice qué meta creía que había (`p_meta_esperada`): la segunda se entera de que cambió en vez de pisar a la primera.
-- ============================================================================


-- ============================================================================
-- PARTE 1 de 4 · La tabla de ajustes: una fila por cambio, solo se agrega
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.metas_persona_ajustes (
  id bigint generated always as identity primary key,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  persona_id uuid not null references public.personas (id),
  -- El mes al que aplica, siempre el día 1: dos «setiembre» distintos no pueden existir.
  mes date not null check (mes = date_trunc('month', mes)::date),
  -- La meta del mes que se fijó, o null = «volver a la automática».
  meta numeric(12, 2) check (meta is null or meta > 0),
  -- La meta efectiva del mes justo antes de este cambio (para leer el historial sin recalcular nada).
  meta_antes numeric(12, 2) not null check (meta_antes >= 0),
  motivo text not null check (motivo in ('cambia_horario', 'capacitacion', 'cubre_otra_tienda', 'vuelve_de_descanso', 'otro', 'automatica')),
  detalle text check (detalle is null or char_length(btrim(detalle)) between 1 and 80),
  -- Quién lo hizo: el responsable que firmó (ADR-0161), no la cuenta.
  cambiado_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  -- «Volver a la automática» no lleva valor, y un ajuste manual siempre lo lleva.
  constraint metas_ajustes_automatica_sin_valor check ((motivo = 'automatica') = (meta is null)),
  -- «Otro» sin decir qué no es un motivo.
  constraint metas_ajustes_otro_con_detalle check (motivo <> 'otro' or detalle is not null)
);

comment on table retail.metas_persona_ajustes is
  'ADR-0286: cada cambio a la meta del mes de una persona (D-147). Solo se agrega: nadie la edita ni la borra. La meta vigente de una persona en un mes es su fila más reciente. Se lee y se escribe solo por funciones security definer (fijar_meta_persona).';

create index if not exists metas_ajustes_vigente_idx
  on retail.metas_persona_ajustes (ubicacion_id, persona_id, mes, created_at desc, id desc);

-- Solo se lee por funciones `security definer`: RLS encendido y sin políticas (nadie la lee ni la escribe directo).
alter table retail.metas_persona_ajustes enable row level security;
revoke all on retail.metas_persona_ajustes from anon, authenticated;

-- Solo agregar (mismo candado que `actividad` y `movimientos`).
create or replace function retail.fn_metas_ajustes_inmutable() returns trigger
language plpgsql as $fn$
begin
  raise exception 'El historial de metas no se edita ni se borra: es el registro de lo que pasó' using errcode = '42501';
end;
$fn$;

create or replace trigger trg_metas_ajustes_inmutable
  before update or delete on retail.metas_persona_ajustes
  for each row execute function retail.fn_metas_ajustes_inmutable();

reset lock_timeout;


-- ============================================================================
-- PARTE 2 de 4 · El reparto (funciones internas: nadie las llama desde la web)
-- ============================================================================

-- ---------- 2a. Horas programadas: la ÚNICA puerta a las tablas de horarios de Dynamic ----------
-- Por persona y día: las horas que le tocaba trabajar en esa tienda. Fuente `horario` = `horarios_asignados` vigente ese día (`horario_por_dia`
-- guarda por día de la semana —0 domingo…6 sábado— la entrada `e`, la salida `s` y los minutos de refrigerio `r`; si no lo trae, las columnas
-- sueltas) y `turno` = una excepción de ese día en `public.turnos` (`es_descanso` vale 0 h). Devuelve una fila por persona de la tienda y por día,
-- con `horas = 0` cuando no trabaja. Se materializa en jsonb antes de devolver: un horario ilegible NO deja un resultado a medias.
create or replace function retail.fn_horas_programadas(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (persona_id uuid, fecha date, horas numeric, entrada text, salida text, fuente text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_json jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  begin
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) from (
        with dias as (
          select d::date as fecha from generate_series($2::date, $3::date, interval '1 day') d
        ),
        gente as (
          select c.persona_id
            from retail.colaboradores c
            join public.personas p on p.id = c.persona_id
           where c.estado = 'activo' and p.estado = 'activo'
             and retail.fn_ubicacion_de_partida(c.persona_id) = $1
        ),
        prog as (
          select g.persona_id, d.fecha,
                 t.id as turno_id, coalesce(t.es_descanso, false) as es_descanso, t.hora_entrada as t_e, t.hora_salida as t_s,
                 h.horario_por_dia is not null as tiene_json,
                 case when h.horario_por_dia is not null then h.horario_por_dia -> (extract(dow from d.fecha)::int)::text end as dia,
                 h.hora_entrada as h_e, h.hora_salida as h_s, h.dias_laborables as h_d, h.almuerzo_min_minutos as h_r
            from gente g
            cross join dias d
            left join lateral (
              select tt.id, tt.es_descanso, tt.hora_entrada, tt.hora_salida
                from public.turnos tt
               where tt.persona_id = g.persona_id and tt.fecha = d.fecha
               order by tt.created_at desc limit 1
            ) t on true
            left join lateral (
              select hh.horario_por_dia, hh.hora_entrada, hh.hora_salida, hh.dias_laborables, hh.almuerzo_min_minutos
                from public.horarios_asignados hh
               where hh.persona_id = g.persona_id
                 and hh.vigente_desde <= d.fecha and (hh.vigente_hasta is null or hh.vigente_hasta >= d.fecha)
               order by hh.vigente_desde desc, hh.created_at desc limit 1
            ) h on true
        ),
        plano as (
          select persona_id, fecha, turno_id, es_descanso,
                 case when turno_id is not null then t_e::text
                      when tiene_json then dia ->> 'e'
                      when extract(dow from fecha)::int = any (h_d) then h_e::text end as e,
                 case when turno_id is not null then t_s::text
                      when tiene_json then dia ->> 's'
                      when extract(dow from fecha)::int = any (h_d) then h_s::text end as s,
                 case when turno_id is not null then 0
                      when tiene_json then coalesce((dia ->> 'r')::numeric, 0)
                      when extract(dow from fecha)::int = any (h_d) then coalesce(h_r, 0)
                      else 0 end as r
            from prog
        )
        select persona_id, fecha,
               round(case when es_descanso or e is null or s is null then 0::numeric
                          else greatest(0::numeric, (extract(epoch from (s::time - e::time)) / 3600.0)::numeric
                                        + case when s::time < e::time then 24 else 0 end - r / 60.0) end, 2) as horas,
               case when es_descanso or e is null then null else left(e, 5) end as entrada,
               case when es_descanso or s is null then null else left(s, 5) end as salida,
               case when turno_id is not null then 'turno' else 'horario' end as fuente
          from plano
      ) z
    $q$ into v_json using p_ubicacion_id, p_desde, p_hasta;
  exception
    when undefined_table or undefined_column then
      v_json := '[]'::jsonb; -- Dynamic no está como se espera (local sin las tablas, o un cambio de forma): «sin horarios»
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
      raise warning 'fn_horas_programadas: un horario de Dynamic tiene un formato que no se entiende (%): se lee como «sin horarios»', sqlerrm;
      v_json := '[]'::jsonb;
  end;
  return query
    select x.persona_id, x.fecha, x.horas, x.entrada, x.salida, x.fuente
      from jsonb_to_recordset(v_json) as x(persona_id uuid, fecha date, horas numeric, entrada text, salida text, fuente text);
end;
$fn$;

comment on function retail.fn_horas_programadas(uuid, date, date) is
  'ADR-0286: por persona de la tienda y por día, las horas que le tocaba trabajar (fuente horario = public.horarios_asignados vigente ese día, o turno = una excepción de public.turnos; un descanso vale 0). Única puerta a esas tablas de Dynamic. Interna: sin grant. Dynamic ausente o ilegible = sin filas, nunca un error.';

-- ---------- 2b. Quién marcó asistencia (solo para el caso «sin horarios») ----------
create or replace function retail.fn_asistencia_por_dia(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (persona_id uuid, fecha date)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_json jsonb;
begin
  begin
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) from (
        select distinct j.persona_id, j.fecha
          from public.jornadas j
          join retail.ubicaciones u on u.sede_dynamic_id = j.sede_id
          join retail.colaboradores c on c.persona_id = j.persona_id and c.estado = 'activo'
         where u.id = $1 and j.fecha between $2 and $3
           and retail.fn_ubicacion_de_partida(j.persona_id) = $1
      ) z
    $q$ into v_json using p_ubicacion_id, p_desde, p_hasta;
  exception when undefined_table or undefined_column then
    v_json := '[]'::jsonb;
  end;
  return query select x.persona_id, x.fecha from jsonb_to_recordset(v_json) as x(persona_id uuid, fecha date);
end;
$fn$;

comment on function retail.fn_asistencia_por_dia(uuid, date, date) is
  'ADR-0286 (D-158): las personas de la tienda con jornada (public.jornadas) cada día. Solo se usa cuando ninguna tiene horas programadas ese día. Interna: sin grant.';

-- ---------- 2c. El reparto: UNA sola definición ----------
-- Por día con meta de la sede: cada persona con horas programadas recibe meta_sede × sus_horas / horas_de_todas, en múltiplos de S/ 10
-- (S/ 1 si la meta de la sede no es múltiplo de 10) por el método del mayor resto, así que las partes SUMAN EXACTO la meta. Si nadie tiene horas
-- ese día: partes iguales entre quienes marcaron asistencia; si nadie marcó, ese día queda sin asignar. Quien descansa recibe 0 y su parte no se
-- le carga a las demás. Sin meta de la sede ese día: sin filas (nunca inventa una).
create or replace function retail.fn_reparto_meta(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (persona_id uuid, fecha date, meta_auto numeric, base text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 93 then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  return query
  with dias as (
    select d::date as fecha,
           (select round(p.meta) from retail.fn_parametros_caja(p_ubicacion_id, d::date) p) as meta_sede
      from generate_series(p_desde, p_hasta, interval '1 day') d
  ),
  con_meta as (
    select fecha, meta_sede, case when meta_sede % 10 = 0 then 10 else 1 end as paso
      from dias where meta_sede is not null and meta_sede > 0
  ),
  horas as (
    select h.persona_id, h.fecha, h.horas from retail.fn_horas_programadas(p_ubicacion_id, p_desde, p_hasta) h where h.horas > 0
  ),
  asistio as (
    select a.persona_id, a.fecha from retail.fn_asistencia_por_dia(p_ubicacion_id, p_desde, p_hasta) a
  ),
  pesos as (
    select h.persona_id, h.fecha, h.horas as peso, 'horas'::text as base from horas h
    union all
    select a.persona_id, a.fecha, 1::numeric, 'iguales'::text from asistio a
     where not exists (select 1 from horas h2 where h2.fecha = a.fecha)
  ),
  calc as (
    select p.persona_id, p.fecha, p.base, m.paso, m.meta_sede / m.paso as unidades,
           (m.meta_sede / m.paso) * p.peso / sum(p.peso) over (partition by p.fecha) as exacto
      from pesos p join con_meta m on m.fecha = p.fecha
  ),
  piso as (
    select c.*, floor(c.exacto) as u0, c.exacto - floor(c.exacto) as resto from calc c
  ),
  orden as (
    select x.*, x.unidades - sum(x.u0) over (partition by x.fecha) as faltan,
           row_number() over (partition by x.fecha order by x.resto desc, x.persona_id) as rk
      from piso x
  )
  select o.persona_id, o.fecha, ((o.u0 + case when o.rk <= o.faltan then 1 else 0 end) * o.paso)::numeric, o.base
    from orden o;
end;
$fn$;

comment on function retail.fn_reparto_meta(uuid, date, date) is
  'ADR-0286 (D-145): la parte AUTOMÁTICA de cada persona en cada día = meta de la sede × sus horas programadas ÷ las de todas, en múltiplos de S/ 10 por mayor resto, sumando EXACTO la meta de la sede. Sin horas ese día: partes iguales entre quienes marcaron asistencia (base iguales). Sin meta de la sede: sin filas. Interna: sin grant.';

-- ---------- 2d. La meta de cada persona por día, con el ajuste de la líder ya aplicado ----------
-- El ajuste es sobre la META DEL MES; la del día se recalcula en la misma proporción (`meta_ajustada ÷ meta_automática`). Trabaja con meses
-- COMPLETOS (el factor sale de la suma del mes entero) y devuelve solo los días pedidos.
create or replace function retail.fn_metas_por_dia(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (
  persona_id uuid, fecha date, mes date, meta_auto numeric, meta_dia numeric, base text,
  meta_auto_mes numeric, meta_mes numeric, ajustada boolean
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_ini date := date_trunc('month', p_desde)::date;
  v_fin date := (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date;
begin
  return query
  with r as (
    select * from retail.fn_reparto_meta(p_ubicacion_id, v_ini, v_fin)
  ),
  mes_auto as (
    select r.persona_id, date_trunc('month', r.fecha)::date as mes, sum(r.meta_auto) as auto_mes from r group by 1, 2
  ),
  aj as (
    select distinct on (a.persona_id, a.mes) a.persona_id, a.mes, a.meta
      from retail.metas_persona_ajustes a
     where a.ubicacion_id = p_ubicacion_id and a.mes between v_ini and v_fin
     order by a.persona_id, a.mes, a.created_at desc, a.id desc
  ),
  f as (
    select m.persona_id, m.mes, m.auto_mes, aj.meta as manual,
           case when aj.meta is null or m.auto_mes = 0 then 1 else aj.meta / m.auto_mes end as factor
      from mes_auto m
      left join aj on aj.persona_id = m.persona_id and aj.mes = m.mes
  )
  select r.persona_id, r.fecha, f.mes, r.meta_auto,
         case when f.manual is null then r.meta_auto else round(r.meta_auto * f.factor / 10) * 10 end,
         r.base, f.auto_mes, coalesce(f.manual, f.auto_mes), (f.manual is not null)
    from r
    join f on f.persona_id = r.persona_id and f.mes = date_trunc('month', r.fecha)::date
   where r.fecha between p_desde and p_hasta;
end;
$fn$;

comment on function retail.fn_metas_por_dia(uuid, date, date) is
  'ADR-0286: la meta de cada persona por día: la automática (fn_reparto_meta) y la del día con el ajuste del mes de la líder ya aplicado en la misma proporción. Meses completos. Interna: sin grant.';

-- Las cuatro internas: nadie las llama desde la web ni desde el SQL de una sesión; solo las funciones de abajo (security definer).
revoke all on function retail.fn_horas_programadas(uuid, date, date) from public, anon, authenticated;
revoke all on function retail.fn_asistencia_por_dia(uuid, date, date) from public, anon, authenticated;
revoke all on function retail.fn_reparto_meta(uuid, date, date) from public, anon, authenticated;
revoke all on function retail.fn_metas_por_dia(uuid, date, date) from public, anon, authenticated;


-- ============================================================================
-- PARTE 3 de 4 · Las lecturas
-- ============================================================================

-- ---------- 3a. El equipo de las tiendas que la cuenta ve (líder de sede o Admin) ----------
-- Una fila por persona de la tienda, AUNQUE no haya vendido (`fn_rendimiento_equipo` solo trae a quien vendió). Alcance: el mismo de Rendimiento
-- (`fn_rendimiento_ubicaciones`): Admin, todas; con el módulo, su tienda; el resto, nada. `es_encargada`: su rol trae el módulo `rendimiento` o es
-- líder con esa tienda (D-160: las encargadas de TRU son «Líder de equipo»). Trae también lo que vendió (hoy, últimos 7 días y el mes) con la MISMA
-- definición de venta de Rendimiento (ADR-0219, punto 2): completada, no de prueba, de quien ATENDIÓ (`asesora_id`), con IGV, en esa tienda.
create or replace function retail.fn_metas_equipo(p_mes date default null)
returns table (
  ubicacion_id uuid, persona_id uuid, nombre text, es_encargada boolean, base text,
  entrada_hoy text, salida_hoy text, horas_hoy numeric,
  meta_auto_mes numeric, meta_ajustada_mes numeric, meta_mes numeric, meta_hoy numeric, meta_7d numeric,
  vendido_hoy numeric, ventas_hoy integer, vendido_7d numeric, ventas_7d integer, vendido_mes numeric, ventas_mes integer
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mes date := coalesce(date_trunc('month', p_mes)::date, date_trunc('month', (now() at time zone 'America/Lima'))::date);
  v_ubis uuid[] := retail.fn_rendimiento_ubicaciones();
  v_u uuid;
begin
  if v_ubis is null or array_length(v_ubis, 1) is null then
    return; -- sin tiendas que ver: la pantalla ya sabe leer eso como «sin acceso»
  end if;
  foreach v_u in array v_ubis loop
    return query
    with gente as (
      select c.persona_id,
             coalesce(nullif(trim(p.nombres || ' ' || left(coalesce(p.apellidos, ''), 1) || '.'), '.'), 'Sin nombre') as nombre,
             (c.rol = 'lider' or exists (select 1 from retail.rol_modulos rm where rm.rol_id = c.rol_id and rm.modulo = 'rendimiento')) as es_encargada
        from retail.colaboradores c
        join public.personas p on p.id = c.persona_id
       where c.estado = 'activo' and p.estado = 'activo'
         and retail.fn_ubicacion_de_partida(c.persona_id) = v_u
    ),
    md as (
      select * from retail.fn_metas_por_dia(v_u, least(v_mes, v_hoy - 6), greatest((v_mes + interval '1 month - 1 day')::date, v_hoy))
    ),
    hoy as (
      select h.persona_id, h.entrada, h.salida, h.horas from retail.fn_horas_programadas(v_u, v_hoy, v_hoy) h
    ),
    vd as (
      select vt.asesora_id as persona_id, (vt.created_at at time zone 'America/Lima')::date as dia,
             sum(vi.subtotal) as total, count(distinct vt.id) as n
        from retail.ventas vt
        join retail.venta_items vi on vi.venta_id = vt.id
       where vt.ubicacion_id = v_u and vt.estado = 'completada' and not vt.es_prueba and vt.asesora_id is not null
         and vt.created_at >= (least(v_mes, v_hoy - 6)::timestamp at time zone 'America/Lima')
         and vt.created_at < (greatest((v_mes + interval '1 month')::date, v_hoy + 1)::timestamp at time zone 'America/Lima')
       group by 1, 2
    )
    select v_u, g.persona_id, g.nombre, g.es_encargada,
           (select case when bool_or(x.base = 'horas') then 'horas' when count(*) > 0 then 'iguales' end
              from md x where x.persona_id = g.persona_id and x.mes = v_mes),
           hy.entrada, hy.salida, hy.horas,
           (select max(x.meta_auto_mes) from md x where x.persona_id = g.persona_id and x.mes = v_mes),
           (select case when bool_or(x.ajustada) then max(x.meta_mes) end from md x where x.persona_id = g.persona_id and x.mes = v_mes),
           (select max(x.meta_mes) from md x where x.persona_id = g.persona_id and x.mes = v_mes),
           (select x.meta_dia from md x where x.persona_id = g.persona_id and x.fecha = v_hoy),
           (select sum(x.meta_dia) from md x where x.persona_id = g.persona_id and x.fecha between v_hoy - 6 and v_hoy),
           (select coalesce(sum(x.total), 0) from vd x where x.persona_id = g.persona_id and x.dia = v_hoy)::numeric,
           (select coalesce(sum(x.n), 0) from vd x where x.persona_id = g.persona_id and x.dia = v_hoy)::integer,
           (select coalesce(sum(x.total), 0) from vd x where x.persona_id = g.persona_id and x.dia between v_hoy - 6 and v_hoy)::numeric,
           (select coalesce(sum(x.n), 0) from vd x where x.persona_id = g.persona_id and x.dia between v_hoy - 6 and v_hoy)::integer,
           (select coalesce(sum(x.total), 0) from vd x where x.persona_id = g.persona_id and x.dia >= v_mes and x.dia < (v_mes + interval '1 month')::date)::numeric,
           (select coalesce(sum(x.n), 0) from vd x where x.persona_id = g.persona_id and x.dia >= v_mes and x.dia < (v_mes + interval '1 month')::date)::integer
      from gente g
      left join hoy hy on hy.persona_id = g.persona_id
     order by g.nombre;
  end loop;
end;
$fn$;

comment on function retail.fn_metas_equipo(date) is
  'ADR-0286: una fila por persona de las tiendas que fn_rendimiento_ubicaciones() le deja ver a la cuenta (Admin: todas; con el módulo rendimiento, su tienda; el resto, nada), aunque no haya vendido: turno de hoy, meta automática, meta ajustada, meta del mes, de hoy y de los últimos 7 días, y lo vendido en esos tres períodos (asesora_id, completadas, no de prueba, con IGV, en esa tienda). security definer, stable.';

revoke all on function retail.fn_metas_equipo(date) from public, anon;
grant execute on function retail.fn_metas_equipo(date) to authenticated;

-- ---------- 3b. Mi meta: SOLO la mía ----------
-- Mi meta de cada día (del mes y de los 7 días hasta hoy) y la del mes. Nunca horas ni metas de otras personas. Una terminal no es una persona:
-- 0 filas. Sin meta de la sede o sin horas: 0 filas (la pantalla no dibuja el bloque, no muestra «0 %»).
create or replace function retail.fn_mi_meta()
returns table (ubicacion_id uuid, fecha date, mes date, meta_dia numeric, meta_mes numeric, base text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_yo uuid;
  v_u uuid;
begin
  if exists (select 1 from retail.fn_terminal_actual() t where t.id is not null) then
    return;
  end if;
  v_yo := retail.fn_actor_persona_id(false);
  if v_yo is null then
    return;
  end if;
  v_u := retail.fn_ubicacion_de_partida(v_yo);
  if v_u is null or not exists (
    select 1 from retail.colaboradores c join public.personas p on p.id = c.persona_id
     where c.persona_id = v_yo and c.estado = 'activo' and p.estado = 'activo'
  ) then
    return;
  end if;
  return query
    select v_u, m.fecha, m.mes, m.meta_dia, m.meta_mes, m.base
      from retail.fn_metas_por_dia(
             v_u,
             least(date_trunc('month', v_hoy)::date, v_hoy - 6),
             (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date) m
     where m.persona_id = v_yo
     order by m.fecha;
end;
$fn$;

comment on function retail.fn_mi_meta() is
  'ADR-0286 (D-149): MI meta de cada día (del mes y de los últimos 7 días) y la del mes, con el ajuste de la líder aplicado. Solo la mía: nunca horas ni metas de otras personas. Una terminal, o sin meta de la sede o sin horas, recibe 0 filas. security definer, stable.';

revoke all on function retail.fn_mi_meta() from public, anon;
grant execute on function retail.fn_mi_meta() to authenticated;

-- ---------- 3c. Ventas por día (para el gráfico Semana | Mes) ----------
-- Misma definición de venta que Rendimiento (ADR-0219, punto 2): completada, no de prueba, de quien ATENDIÓ (`asesora_id`), con IGV. Devuelve TODOS
-- los días del rango (con 0 si no hubo ventas): un día sin ventas se dibuja como 0, no como un hueco.
create or replace function retail.fn_mis_ventas_por_dia(p_desde date, p_hasta date)
returns table (fecha date, total numeric, ventas integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_yo uuid;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  if exists (select 1 from retail.fn_terminal_actual() t where t.id is not null) then
    return;
  end if;
  v_yo := retail.fn_actor_persona_id(false);
  if v_yo is null then
    return;
  end if;
  return query
    select d::date,
           coalesce(v.total, 0)::numeric,
           coalesce(v.n, 0)::integer
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join (
        select (vt.created_at at time zone 'America/Lima')::date as dia, sum(vi.subtotal) as total, count(distinct vt.id) as n
          from retail.ventas vt
          join retail.venta_items vi on vi.venta_id = vt.id
         where vt.asesora_id = v_yo and vt.estado = 'completada' and not vt.es_prueba
           and vt.created_at >= (p_desde::timestamp at time zone 'America/Lima')
           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
         group by 1
      ) v on v.dia = d::date
     order by d;
end;
$fn$;

comment on function retail.fn_mis_ventas_por_dia(date, date) is
  'ADR-0286: MIS ventas por día (asesora_id = quien pregunta; completadas, no de prueba, con IGV), un día por fila aunque sea 0. Rango máximo de 93 días. Una terminal recibe 0 filas. security definer, stable.';

revoke all on function retail.fn_mis_ventas_por_dia(date, date) from public, anon;
grant execute on function retail.fn_mis_ventas_por_dia(date, date) to authenticated;

create or replace function retail.fn_rendimiento_serie(p_ubicacion_id uuid, p_desde date, p_hasta date)
returns table (fecha date, total numeric, ventas integer, meta_sede numeric, meta_asignada numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 92 then
    raise exception 'El rango de fechas no es válido' using errcode = '22023';
  end if;
  if p_ubicacion_id is null or not (p_ubicacion_id = any (coalesce(retail.fn_rendimiento_ubicaciones(), '{}'::uuid[]))) then
    raise exception 'No puedes ver el rendimiento de esa tienda' using errcode = '42501';
  end if;
  return query
    select d::date,
           coalesce(v.total, 0)::numeric,
           coalesce(v.n, 0)::integer,
           (select p.meta from retail.fn_parametros_caja(p_ubicacion_id, d::date) p),
           a.asignado
      from generate_series(p_desde, p_hasta, interval '1 day') d
      left join (
        select (vt.created_at at time zone 'America/Lima')::date as dia, sum(vi.subtotal) as total, count(distinct vt.id) as n
          from retail.ventas vt
          join retail.venta_items vi on vi.venta_id = vt.id
         where vt.ubicacion_id = p_ubicacion_id and vt.estado = 'completada' and not vt.es_prueba
           and vt.created_at >= (p_desde::timestamp at time zone 'America/Lima')
           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
         group by 1
      ) v on v.dia = d::date
      left join (
        select m.fecha as dia, sum(m.meta_dia) as asignado
          from retail.fn_metas_por_dia(p_ubicacion_id, p_desde, p_hasta) m
         group by 1
      ) a on a.dia = d::date
     order by d;
end;
$fn$;

comment on function retail.fn_rendimiento_serie(uuid, date, date) is
  'ADR-0286: las ventas por día de UNA tienda (completadas, no de prueba, con IGV), un día por fila aunque sea 0, con la meta de la sede de ese día (fn_parametros_caja; null si no tiene) y lo que ya se asignó a las personas (null si nadie tiene parte). Solo si la tienda está en fn_rendimiento_ubicaciones() de quien pregunta. Rango máximo de 93 días. security definer, stable.';

revoke all on function retail.fn_rendimiento_serie(uuid, date, date) from public, anon;
grant execute on function retail.fn_rendimiento_serie(uuid, date, date) to authenticated;

-- ---------- 3d. El historial de cambios de meta de una tienda (la tabla no se lee directo) ----------
-- Los cambios del mes pedido (sin fecha: el de hoy), del más nuevo al más viejo, con el nombre de quien cambió y de a quién. Solo tiendas de
-- `fn_rendimiento_ubicaciones()`: el mismo alcance de Rendimiento. 200 filas como mucho (una tienda no cambia tantas en un mes).
create or replace function retail.fn_metas_historial(p_ubicacion_id uuid, p_mes date default null)
returns table (id bigint, persona_id uuid, persona text, mes date, meta_antes numeric, meta numeric, motivo text, detalle text, cambiado_por text, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
#variable_conflict use_column
declare
  v_mes date := coalesce(date_trunc('month', p_mes)::date, date_trunc('month', (now() at time zone 'America/Lima'))::date);
begin
  if p_ubicacion_id is null or not (p_ubicacion_id = any (coalesce(retail.fn_rendimiento_ubicaciones(), '{}'::uuid[]))) then
    raise exception 'No puedes ver el rendimiento de esa tienda' using errcode = '42501';
  end if;
  return query
    select a.id, a.persona_id,
           coalesce(nullif(trim(p.nombres || ' ' || left(coalesce(p.apellidos, ''), 1) || '.'), '.'), 'Sin nombre'),
           a.mes, a.meta_antes, a.meta, a.motivo, a.detalle,
           coalesce(nullif(trim(q.nombres || ' ' || left(coalesce(q.apellidos, ''), 1) || '.'), '.'), 'Sin nombre'),
           a.created_at
      from retail.metas_persona_ajustes a
      left join public.personas p on p.id = a.persona_id
      left join public.personas q on q.id = a.cambiado_por
     where a.ubicacion_id = p_ubicacion_id and a.mes = v_mes
     order by a.created_at desc, a.id desc
     limit 200;
end;
$fn$;

comment on function retail.fn_metas_historial(uuid, date) is
  'ADR-0286 (D-148): los cambios de meta de una tienda en un mes (persona, meta antes y después, motivo, quién y cuándo), del más nuevo al más viejo, solo si la tienda está en fn_rendimiento_ubicaciones() de quien pregunta. La tabla no se lee directo. security definer, stable.';

revoke all on function retail.fn_metas_historial(uuid, date) from public, anon;
grant execute on function retail.fn_metas_historial(uuid, date) to authenticated;


-- ============================================================================
-- PARTE 4 de 4 · Cambiar la meta de una persona
-- ============================================================================
-- UNA sola transacción (la de esta función): firma con el responsable elegido, toma el candado de la base por (persona, tienda, mes), comprueba los
-- estados imposibles, agrega el ajuste y deja su línea en la actividad. Devuelve la meta del mes que quedó vigente.
create or replace function retail.fijar_meta_persona(
  p_persona_id uuid,
  p_ubicacion_id uuid,
  p_mes date,
  p_meta numeric,
  p_motivo text,
  p_detalle text default null,
  p_meta_esperada numeric default null
) returns numeric
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fin date;
  v_auto numeric;
  v_actual numeric;
  v_ajustada boolean;
  v_meta_sede numeric;
  v_meta numeric := p_meta;
  v_motivo text := p_motivo;
  v_detalle text := nullif(btrim(coalesce(p_detalle, '')), '');
  v_id bigint;
  v_nombre text;
  v_meses text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','setiembre','octubre','noviembre','diciembre'];
begin
  -- 1. Quién firma: el responsable elegido en el combo (ADR-0161). Una terminal, o sin sesión, no llega hasta acá.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_mes is null or p_persona_id is null or p_ubicacion_id is null then
    raise exception 'Faltan datos para cambiar la meta' using errcode = '22023';
  end if;

  -- 2. Alcance: solo tiendas que Rendimiento le muestra a quien pregunta (Admin: todas; con el módulo: la suya).
  if not (p_ubicacion_id = any (coalesce(retail.fn_rendimiento_ubicaciones(), '{}'::uuid[]))) then
    raise exception 'No puedes cambiar metas de esa tienda' using errcode = '42501', hint = 'meta_tienda_sin_acceso';
  end if;
  -- Nadie cambia la suya; la de la encargada la cambia un Admin (D-147: quien es medido no fija su propia vara).
  if p_persona_id = v_actor and not retail.fn_es_admin() then
    raise exception 'Tu propia meta la cambia un Admin' using errcode = '42501', hint = 'meta_propia';
  end if;
  if not exists (
    select 1 from retail.colaboradores c join public.personas p on p.id = c.persona_id
     where c.persona_id = p_persona_id and c.estado = 'activo' and p.estado = 'activo'
       and retail.fn_ubicacion_de_partida(c.persona_id) = p_ubicacion_id
  ) then
    raise exception 'Esa persona no es de esta tienda' using errcode = '22023', hint = 'meta_persona_ajena';
  end if;
  -- Solo el mes actual y los que vienen.
  if v_mes < date_trunc('month', v_hoy)::date then
    raise exception 'No se cambian las metas de meses que ya pasaron' using errcode = '22023', hint = 'meta_mes_pasado';
  end if;
  v_fin := (v_mes + interval '1 month - 1 day')::date;

  -- 3. Una sola persona a la vez por (persona, tienda, mes): la segunda espera a la primera y ya ve su cambio.
  perform pg_advisory_xact_lock(hashtextextended('meta_persona:' || p_persona_id::text || ':' || p_ubicacion_id::text || ':' || v_mes::text, 0));

  -- 4. La meta de la sede del mes, y la de esta persona (automática y vigente), ya con el candado tomado.
  v_meta_sede := retail.fn_meta_mes(p_ubicacion_id, v_mes);
  if v_meta_sede is null or v_meta_sede <= 0 then
    raise exception 'La tienda no tiene meta cargada para ese mes' using errcode = '22023', hint = 'meta_sede_sin_meta';
  end if;
  select max(m.meta_auto_mes), max(m.meta_mes), coalesce(bool_or(m.ajustada), false)
    into v_auto, v_actual, v_ajustada
    from retail.fn_metas_por_dia(p_ubicacion_id, v_mes, v_fin) m
   where m.persona_id = p_persona_id;
  if v_auto is null or v_auto <= 0 then
    raise exception 'Esa persona no tiene horas programadas ni asistencia ese mes: no hay meta que ajustar' using errcode = '22023', hint = 'meta_sin_horas';
  end if;

  -- 5. Lo que se quiere hacer.
  if v_meta is not null and v_meta = v_auto then
    v_meta := null; -- pedir la misma cifra que la automática es volver a la automática
  end if;
  if v_meta is null then
    v_motivo := 'automatica';
    v_detalle := null;
    if not v_ajustada then
      return v_auto; -- ya está en la automática: nada que anotar
    end if;
  else
    if v_meta <= 0 then
      raise exception 'La meta tiene que ser mayor que cero' using errcode = '22023', hint = 'meta_no_positiva';
    end if;
    if v_meta > v_meta_sede then
      raise exception 'La meta de una persona no puede pasar de la de la tienda en el mes' using errcode = '22023', hint = 'meta_mayor_que_la_sede';
    end if;
    if v_motivo is null or v_motivo = 'automatica' or v_motivo not in ('cambia_horario', 'capacitacion', 'cubre_otra_tienda', 'vuelve_de_descanso', 'otro') then
      raise exception 'Elige el motivo del cambio: queda anotado en el historial' using errcode = '22023', hint = 'meta_sin_motivo';
    end if;
    if v_motivo = 'otro' and v_detalle is null then
      raise exception 'Cuenta el motivo en una línea' using errcode = '22023', hint = 'meta_otro_sin_detalle';
    end if;
    if v_meta = v_actual then
      return v_actual; -- ya vale eso: nada que anotar
    end if;
  end if;
  -- Quien editaba veía otra meta: en vez de pisar el cambio de otra persona, se le avisa.
  if p_meta_esperada is not null and p_meta_esperada <> v_actual then
    raise exception 'La meta cambió mientras la editabas. Vuelve a abrirla para ver la actual' using errcode = '40001', hint = 'meta_cambio_mientras_editabas';
  end if;

  -- 6. Se agrega el ajuste (nunca se edita uno anterior).
  insert into retail.metas_persona_ajustes (ubicacion_id, persona_id, mes, meta, meta_antes, motivo, detalle, cambiado_por)
  values (p_ubicacion_id, p_persona_id, v_mes, v_meta, v_actual, v_motivo, v_detalle, v_actor)
  returning id into v_id;

  -- 7. Su línea en la actividad. Si anotar falla, el cambio se guarda igual (principio 9, ADR-0207).
  begin
    select coalesce(nullif(trim(p.nombres || ' ' || left(coalesce(p.apellidos, ''), 1) || '.'), '.'), 'una persona')
      into v_nombre from public.personas p where p.id = p_persona_id;
    perform retail.fn_actividad_anotar(
      'rendimiento', 'meta_persona_ajustada',
      case when v_meta is null
           then 'volvió a la meta automática de ' || v_nombre || ' de ' || v_meses[extract(month from v_mes)::int] || ' (' || retail.fn_actividad_soles(v_auto) || ')'
           else 'cambió la meta de ' || v_nombre || ' de ' || v_meses[extract(month from v_mes)::int] || ': ' || retail.fn_actividad_soles(v_actual) || ' → ' || retail.fn_actividad_soles(v_meta) end,
      v_actor, null, p_ubicacion_id, null, 'metas_persona_ajustes', v_id::text, now(),
      jsonb_build_object('persona_id', p_persona_id, 'mes', v_mes, 'antes', v_actual, 'despues', coalesce(v_meta, v_auto), 'motivo', v_motivo, 'detalle', v_detalle),
      'vivo');
  exception when others then
    raise warning 'fijar_meta_persona: no se pudo anotar la actividad (%): el cambio se guardó igual', sqlerrm;
  end;

  return coalesce(v_meta, v_auto);
end;
$fn$;

comment on function retail.fijar_meta_persona(uuid, uuid, date, numeric, text, text, numeric) is
  'ADR-0286 (D-147): cambia la meta DEL MES de una persona (p_meta) o la devuelve a la automática (p_meta null o igual a la automática). Una sola transacción con candado por (persona, tienda, mes); firma con el responsable elegido; solo tiendas de fn_rendimiento_ubicaciones() (D-157: módulo rendimiento; Admin todas); nadie cambia la suya salvo un Admin; motivo obligatorio; nunca mayor que la meta de la tienda ni en meses pasados; p_meta_esperada evita pisar un cambio ajeno. Agrega una fila a metas_persona_ajustes y una línea a la actividad. Devuelve la meta del mes vigente.';

revoke all on function retail.fijar_meta_persona(uuid, uuid, date, numeric, text, text, numeric) from public, anon;
grant execute on function retail.fijar_meta_persona(uuid, uuid, date, numeric, text, text, numeric) to authenticated;

notify pgrst, 'reload schema';
