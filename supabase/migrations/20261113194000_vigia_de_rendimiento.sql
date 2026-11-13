-- ADR-0656: el vigía de rendimiento en la base (cambiar-de-modulo#5, aprobada por Felipe el 2026-11-13).
--
-- EL PROBLEMA. Cambiar de módulo tarda de 1 a 3 s, y lo lento es lo que hace cada consulta (Existencias, Productos, Finanzas). Eso se
-- midió el 2026-11-13 pegando a mano `scripts/rendimiento/diagnostico-produccion.sql`, que muestra lo acumulado por
-- `pg_stat_statements` desde su último reinicio y nada más: el reinicio del cambio de plan borró todo lo anterior, y no hay historia
-- para decir «esta función tardaba 882 ms y desde el pegado de anoche tarda 140». ADR-0622 encontró 6 funciones de más de 8 s que
-- llegaron a producción sin que nada avisara.
--
-- LO QUE SE AGREGA (todo nuevo: ninguna tabla ni función que ya existe cambia):
--   1. `rendimiento_corridas`: una fila por foto, con el tramo que cubre (`desde` → `hecha_en`) y si arrancó de cero.
--   2. `rendimiento_fotos`: por cada función o tabla de retail que se usó en ese tramo, y por rol de la base, cuántas llamadas,
--      cuántos ms en total, la media y cuántos bloques leyó. Son DIFERENCIAS contra la foto anterior, no acumulados. Solo nombres y
--      números: ni el texto de una consulta, ni un parámetro, ni un dato del negocio.
--   3. `rendimiento_estado`: lo que `pg_stat_statements` decía en la foto anterior, consulta por consulta (para restar). Es una
--      memoria de trabajo, no historia: cada foto la reemplaza entera.
--   4. `fn_foto_rendimiento()`: toma la foto. La llama cada hora el trabajo programado de Vercel (`/api/salud/rendimiento`, con la
--      llave de servicio) o se corre a mano en el SQL Editor (`postgres` sin sesión).
--   5. `fn_rendimiento_antes_despues(desde, nombre, ventana)`: el antes y el después de un pegado, para una función o para todas.
--
-- PROMETE: nunca reinicia `pg_stat_statements` (la base la comparte CAYLA Dynamic, que también la mira). Si alguien la reinició (o
--          Supabase reinició la base) entre dos fotos, la foto lo nota (`stats_reset` cambió) y cuenta desde el reinicio: nunca resta
--          contra una foto de antes del reinicio. Lo mismo, consulta por consulta, si `pg_stat_statements` tiró una consulta por falta
--          de lugar y la volvió a crear (`stats_since` cambió, o las llamadas bajaron). Dos fotos a la vez: la segunda vuelve sin
--          hacer nada.
-- ASUME:   que el dueño de la función (`postgres`) es miembro de `pg_read_all_stats` (por `pg_monitor`), y por eso ve el texto de las
--          consultas de los demás roles; sin eso, el texto sale «<insufficient privilege>» y no se puede saber de qué función es.
--          Comprobado en local el 2026-11-13: dentro de la función, la llave de servicio ve las 4.983 consultas; directo, 4.981 ocultas.
--          En producción se comprueba antes de pegar: `select pg_has_role('postgres', 'pg_read_all_stats', 'member');` → true.
-- QUÉ CUENTA: solo lo que pide una pantalla o un trabajo (`toplevel`: no lo que una función hace por dentro, que ya está en su
--          tiempo), de roles de las apps (`authenticated`, `anon`, `service_role`, `tienda_web`…): no `postgres` (el SQL Editor y las
--          migraciones) ni los roles internos de Supabase (`supabase_*`). Y solo lo que lee o escribe (`select`, `with`, `insert`,
--          `update`, `delete`, `call`): un `create or replace function retail.x(` no es una llamada a `x`.
-- EL NOMBRE: si la consulta llama a una función de retail, la primera (`tipo = 'funcion'`): así llama PostgREST a una RPC. Si no, la
--          primera tabla de retail que lee o escribe (`tipo = 'tabla'`): así lee PostgREST una tabla con sus embebidos, como la lectura
--          de `stock` de Existencias.
-- SE DEGRADA ASÍ: si el trabajo programado no corre una hora, la foto siguiente cubre dos horas (su `desde` lo dice); no se pierde nada
--          mientras `pg_stat_statements` no se reinicie. Si se reinicia sin foto en medio, se pierde lo de antes del reinicio que no se
--          fotografió: a lo más una hora.
-- NO HACE: no guarda la llamada más lenta de cada hora, porque `pg_stat_statements` solo guarda el máximo desde que empezó a contar.
--          `ms_max` es un RÉCORD: el máximo nuevo de esa hora si alguna llamada superó todo lo anterior de su consulta; si ninguna lo
--          superó, queda vacío. Tampoco borra fotos viejas: ~1.000 filas al día, del orden de 40 MB al año (revisar al año).
--
-- Sin políticas: las tres tablas solo se leen y escriben por funciones `security definer` (regla de «Políticas y deadlocks»). Se pega
-- en UNA sola parte: no hay `alter` de tablas en uso ni `create policy`. Se puede volver a pegar. Para deshacerla: `drop function` de
-- las dos funciones y `drop table` de `rendimiento_fotos`, `rendimiento_corridas` y `rendimiento_estado` (nada más depende de ellas).

set lock_timeout = '3s';

-- ---------- 1. Las corridas ----------
create table if not exists retail.rendimiento_corridas (
  id bigint generated always as identity primary key,
  hecha_en timestamptz not null,
  -- El tramo que cubre: desde la foto anterior o, si arrancó de cero, desde el reinicio de pg_stat_statements.
  desde timestamptz not null,
  -- `stats_reset` de pg_stat_statements_info() al tomar la foto: si cambia de una foto a la otra, hubo un reinicio en medio.
  reinicio timestamptz,
  arranco_de_cero boolean not null,
  -- Consultas de retail que había en pg_stat_statements, y cuántas tiró pg_stat_statements por falta de lugar desde su reinicio
  -- (`dealloc`): si sube mucho entre dos fotos, una consulta poco usada pudo perder llamadas (solo las poco usadas se tiran).
  consultas integer not null check (consultas >= 0),
  descartadas bigint,
  check (desde <= hecha_en)
);
comment on table retail.rendimiento_corridas is
  'ADR-0656: una fila por foto del vigía de rendimiento (pg_stat_statements, cada hora). desde → hecha_en es el tramo que cubren sus fotos.';
alter table retail.rendimiento_corridas enable row level security;
revoke all on table retail.rendimiento_corridas from public, anon, authenticated;

-- ---------- 2. Las fotos ----------
create table if not exists retail.rendimiento_fotos (
  corrida_id bigint not null references retail.rendimiento_corridas (id),
  desde timestamptz not null,
  hasta timestamptz not null,
  nombre text not null check (nombre ~ '^[a-z0-9_]+$'),
  tipo text not null check (tipo in ('funcion', 'tabla')),
  rol text not null check (rol <> 'postgres' and rol !~ '^supabase_'),
  llamadas bigint not null check (llamadas > 0),
  ms_total numeric not null check (ms_total >= 0),
  ms_media numeric not null check (ms_media >= 0),
  -- Récord: el máximo nuevo de este tramo si alguna llamada superó todo lo anterior de su consulta; vacío si ninguna lo superó.
  ms_max numeric check (ms_max >= 0),
  filas bigint not null check (filas >= 0),
  -- Bloques de 8 kB que tocó (desde memoria o desde disco) y cuántos de esos vinieron de disco.
  bloques_compartidos bigint not null check (bloques_compartidos >= 0),
  bloques_disco bigint not null check (bloques_disco between 0 and bloques_compartidos),
  primary key (corrida_id, nombre, tipo, rol),
  check (desde <= hasta)
);
comment on table retail.rendimiento_fotos is
  'ADR-0656: lo que costó cada función o tabla de retail en cada tramo del vigía (diferencias contra la foto anterior, no acumulados). Solo nombres y números: nunca el texto de una consulta.';
create index if not exists rendimiento_fotos_nombre_hasta on retail.rendimiento_fotos (nombre, hasta);
alter table retail.rendimiento_fotos enable row level security;
revoke all on table retail.rendimiento_fotos from public, anon, authenticated;

-- ---------- 3. Lo que decía pg_stat_statements en la foto anterior ----------
create table if not exists retail.rendimiento_estado (
  -- `userid:queryid:toplevel`: la llave de una consulta en pg_stat_statements (dentro de esta base).
  entrada text primary key,
  nombre text not null,
  tipo text not null,
  rol text not null,
  llamadas bigint not null,
  ms_total double precision not null,
  ms_max double precision not null,
  filas bigint not null,
  bloques_compartidos bigint not null,
  bloques_disco bigint not null,
  -- `stats_since` (pg_stat_statements 1.11, Postgres 17): cuándo empezó a contar esa consulta. Si cambia, se tiró y se volvió a crear.
  cuenta_desde timestamptz
);
comment on table retail.rendimiento_estado is
  'ADR-0656: memoria de trabajo del vigía de rendimiento (los acumulados de la foto anterior, para restar). Cada foto la reemplaza entera; la historia está en rendimiento_fotos.';
alter table retail.rendimiento_estado enable row level security;
revoke all on table retail.rendimiento_estado from public, anon, authenticated;

-- ---------- 4. Tomar la foto ----------
create or replace function retail.fn_foto_rendimiento()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_rol text := nullif(auth.role(), '');
  v_ahora timestamptz := clock_timestamp();
  v_reinicio timestamptz;
  v_descartadas bigint;
  v_anterior_en timestamptz;
  v_anterior_reinicio timestamptz;
  v_de_cero boolean;
  v_desde timestamptz;
  v_corrida bigint;
  v_consultas integer;
  v_filas integer;
begin
  -- Solo el trabajo programado (llave de servicio) o el SQL Editor (postgres SIN sesión de nadie). `is not distinct from`: con un
  -- `=`, un rol nulo daría null y el candado quedaría abierto. Una cuenta con sesión (aunque sea Admin) no la toma: no es suya.
  if not (v_rol is not distinct from 'service_role' or (v_rol is null and session_user in ('postgres', 'supabase_admin'))) then
    raise exception 'La foto de rendimiento solo la toma el trabajo programado.' using errcode = '42501';
  end if;
  -- Un reintento del trabajo programado mientras la anterior sigue: la segunda vuelve sin hacer nada.
  if not pg_try_advisory_xact_lock(hashtext('retail.fn_foto_rendimiento')) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_corriendo');
  end if;

  for v_reinicio, v_descartadas in select i.stats_reset, i.dealloc from extensions.pg_stat_statements_info() i loop
    exit;
  end loop;
  for v_anterior_en, v_anterior_reinicio in
    select c.hecha_en, c.reinicio from retail.rendimiento_corridas c order by c.id desc limit 1
  loop
    exit;
  end loop;

  -- Sin foto anterior, o con un reinicio en medio, lo que hay en pg_stat_statements es todo de después del reinicio: se cuenta
  -- entero, desde el reinicio. Nunca se resta contra una foto de antes del reinicio (daría negativos o, peor, números chicos falsos).
  v_de_cero := v_anterior_en is null or v_anterior_reinicio is distinct from v_reinicio;
  v_desde := case when v_de_cero then least(coalesce(v_reinicio, v_ahora), v_ahora) else least(v_anterior_en, v_ahora) end;

  -- Lo de ahora, una sola lectura de pg_stat_statements (la resta y la memoria nueva salen de la misma foto). `to_jsonb(s)` lee
  -- `stats_since` sin nombrarla: si producción tuviera pg_stat_statements anterior a 1.11, la función igual compila y corre.
  -- Una segunda foto en la misma transacción (las pruebas) encuentra la tabla de la primera: se rehace.
  if to_regclass('pg_temp.rendimiento_ahora') is not null then
    drop table pg_temp.rendimiento_ahora;
  end if;
  create temp table rendimiento_ahora on commit drop as
  select s.userid::text || ':' || s.queryid::text || ':' || s.toplevel::text as entrada,
         coalesce(x.funcion, x.tabla) as nombre,
         case when x.funcion is not null then 'funcion' else 'tabla' end as tipo,
         r.rolname::text as rol,
         s.calls as llamadas,
         s.total_exec_time as ms_total,
         s.max_exec_time as ms_max,
         s.rows as filas,
         s.shared_blks_hit + s.shared_blks_read as bloques_compartidos,
         s.shared_blks_read as bloques_disco,
         (to_jsonb(s) ->> 'stats_since')::timestamptz as cuenta_desde
  from extensions.pg_stat_statements s
  join pg_catalog.pg_roles r on r.oid = s.userid
  cross join lateral (
    select (regexp_match(s.query, '\mretail"?\."?([a-z0-9_]+)"?\s*\(', 'i'))[1] as funcion,
           (regexp_match(s.query, '\m(?:from|join|into|update)\s+"?retail"?\."?([a-z0-9_]+)"?', 'i'))[1] as tabla
  ) x
  where s.dbid = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database())
    and s.toplevel
    and s.query ~ '\mretail"?\.'
    and s.query ~* '^\s*(with|select|insert|update|delete|call)\M'
    and r.rolname <> 'postgres'
    and r.rolname !~ '^supabase_'
    and coalesce(x.funcion, x.tabla) is not null;

  v_consultas := (select count(*) from pg_temp.rendimiento_ahora);

  insert into retail.rendimiento_corridas (hecha_en, desde, reinicio, arranco_de_cero, consultas, descartadas)
  values (v_ahora, v_desde, v_reinicio, v_de_cero, v_consultas, v_descartadas)
  returning id into v_corrida;

  -- La resta, consulta por consulta. Una consulta cuenta ENTERA (no se resta) si: se arrancó de cero, no estaba en la foto anterior,
  -- empezó a contar de nuevo (`stats_since` distinto) o tiene menos llamadas que antes (se tiró y se volvió a crear sin `stats_since`).
  insert into retail.rendimiento_fotos (corrida_id, desde, hasta, nombre, tipo, rol, llamadas, ms_total, ms_media, ms_max, filas,
                                        bloques_compartidos, bloques_disco)
  select v_corrida, v_desde, v_ahora, d.nombre, d.tipo, d.rol,
         sum(d.llamadas),
         round(sum(d.ms_total)::numeric, 3),
         round((sum(d.ms_total) / sum(d.llamadas))::numeric, 3),
         round(max(d.record)::numeric, 3),
         sum(d.filas),
         sum(d.bloques_compartidos),
         sum(d.bloques_disco)
  from (
    select a.nombre, a.tipo, a.rol,
           case when n.entera then a.llamadas else a.llamadas - e.llamadas end as llamadas,
           case when n.entera then a.ms_total else greatest(a.ms_total - e.ms_total, 0) end as ms_total,
           case when n.entera then a.filas else greatest(a.filas - e.filas, 0) end as filas,
           case when n.entera then a.bloques_compartidos else greatest(a.bloques_compartidos - e.bloques_compartidos, 0) end
             as bloques_compartidos,
           case when n.entera then a.bloques_disco else greatest(a.bloques_disco - e.bloques_disco, 0) end as bloques_disco,
           case when n.entera then a.ms_max when a.ms_max > e.ms_max then a.ms_max end as record
    from pg_temp.rendimiento_ahora a
    left join retail.rendimiento_estado e on e.entrada = a.entrada
    cross join lateral (
      select v_de_cero
             or e.entrada is null
             or a.cuenta_desde is distinct from e.cuenta_desde
             or a.llamadas < e.llamadas as entera
    ) n
  ) d
  group by d.nombre, d.tipo, d.rol
  having sum(d.llamadas) > 0;
  get diagnostics v_filas = row_count;

  -- La memoria nueva: exactamente lo leído en esta foto. Lo que ya no está (se tiró) sale, para que si vuelve cuente entero.
  delete from retail.rendimiento_estado;
  insert into retail.rendimiento_estado (entrada, nombre, tipo, rol, llamadas, ms_total, ms_max, filas, bloques_compartidos,
                                         bloques_disco, cuenta_desde)
  select a.entrada, a.nombre, a.tipo, a.rol, a.llamadas, a.ms_total, a.ms_max, a.filas, a.bloques_compartidos, a.bloques_disco,
         a.cuenta_desde
  from pg_temp.rendimiento_ahora a;

  return jsonb_build_object(
    'ok', true,
    'corrida_id', v_corrida,
    'desde', v_desde,
    'hasta', v_ahora,
    'arranco_de_cero', v_de_cero,
    'consultas', v_consultas,
    'filas', v_filas,
    'descartadas', v_descartadas
  );
end;
$$;

comment on function retail.fn_foto_rendimiento() is
  'ADR-0656: toma la foto horaria de pg_stat_statements (diferencias contra la anterior, por función o tabla de retail y por rol). Nunca reinicia nada. Solo el trabajo programado (llave de servicio) o postgres sin sesión.';

-- ---------- 5. El antes y el después de un pegado ----------
-- `p_desde` es el momento del pegado; `p_ventana`, cuánto mirar hacia cada lado (7 días de fábrica). Con `p_nombre`, solo esa función
-- o tabla; sin él, todas, de la que más tiempo le costó a la base hacia abajo. Una foto que cruza `p_desde` (cubre parte de antes y
-- parte de después) no entra en ninguno de los dos lados: mezclaría lo viejo con lo nuevo.
create or replace function retail.fn_rendimiento_antes_despues(
  p_desde timestamptz,
  p_nombre text default null,
  p_ventana interval default interval '7 days'
)
returns table (
  nombre text,
  tipo text,
  antes_llamadas bigint,
  antes_ms_media numeric,
  antes_bloques_por_llamada numeric,
  despues_llamadas bigint,
  despues_ms_media numeric,
  despues_bloques_por_llamada numeric,
  cambio_ms_pct numeric,
  despues_ms_max numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_rol text := nullif(auth.role(), '');
begin
  if not (v_rol is not distinct from 'service_role'
          or (v_rol is null and session_user in ('postgres', 'supabase_admin'))
          or retail.fn_es_admin() is true) then
    raise exception 'El vigía de rendimiento lo ve el Admin.' using errcode = '42501';
  end if;
  if p_desde is null then
    raise exception 'Falta el momento del pegado (p_desde).' using errcode = '22004';
  end if;
  if p_ventana is null or p_ventana < interval '1 hour' or p_ventana > interval '90 days' then
    raise exception 'La ventana va de 1 hora a 90 días.' using errcode = '22023';
  end if;

  return query
  with f as (
    select f.nombre, f.tipo, f.llamadas, f.ms_total, f.bloques_compartidos, f.ms_max,
           case when f.hasta <= p_desde and f.desde >= p_desde - p_ventana then 'antes'
                when f.desde >= p_desde and f.hasta <= p_desde + p_ventana then 'despues'
           end as lado
    from retail.rendimiento_fotos f
    where (p_nombre is null or f.nombre = p_nombre)
      and f.hasta > p_desde - p_ventana
      and f.desde < p_desde + p_ventana
  ), g as (
    select f.nombre, f.tipo,
           sum(f.llamadas) filter (where f.lado = 'antes') as a_llamadas,
           sum(f.ms_total) filter (where f.lado = 'antes') as a_ms,
           sum(f.bloques_compartidos) filter (where f.lado = 'antes') as a_bloques,
           sum(f.llamadas) filter (where f.lado = 'despues') as d_llamadas,
           sum(f.ms_total) filter (where f.lado = 'despues') as d_ms,
           sum(f.bloques_compartidos) filter (where f.lado = 'despues') as d_bloques,
           max(f.ms_max) filter (where f.lado = 'despues') as d_max
    from f
    where f.lado is not null
    group by f.nombre, f.tipo
  )
  select g.nombre, g.tipo,
         g.a_llamadas::bigint,
         round(g.a_ms / nullif(g.a_llamadas, 0), 1),
         round(g.a_bloques / nullif(g.a_llamadas, 0), 1),
         g.d_llamadas::bigint,
         round(g.d_ms / nullif(g.d_llamadas, 0), 1),
         round(g.d_bloques / nullif(g.d_llamadas, 0), 1),
         round(100 * ((g.d_ms / nullif(g.d_llamadas, 0)) - (g.a_ms / nullif(g.a_llamadas, 0)))
               / nullif(g.a_ms / nullif(g.a_llamadas, 0), 0), 0),
         round(g.d_max, 1)
  from g
  order by greatest(coalesce(g.a_ms, 0), coalesce(g.d_ms, 0)) desc, g.nombre, g.tipo;
end;
$$;

comment on function retail.fn_rendimiento_antes_despues(timestamptz, text, interval) is
  'ADR-0656: el antes y el después de un pegado (media de ms y bloques por llamada, ventana de 7 días de fábrica a cada lado). Solo el Admin, la llave de servicio o postgres sin sesión.';

revoke all on function retail.fn_foto_rendimiento() from public, anon, authenticated;
grant execute on function retail.fn_foto_rendimiento() to service_role;
revoke all on function retail.fn_rendimiento_antes_despues(timestamptz, text, interval) from public, anon;
grant execute on function retail.fn_rendimiento_antes_despues(timestamptz, text, interval) to authenticated, service_role;

reset lock_timeout;
