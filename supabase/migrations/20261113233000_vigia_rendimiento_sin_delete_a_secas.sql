-- ADR-0656, actualización c: el vigía de rendimiento corre desde el cron.
--
-- EL PROBLEMA. `fn_foto_rendimiento()` (20261113194000) vacía su memoria de trabajo con un `delete from retail.rendimiento_estado`
-- sin `where`. Pegada y probada desde el SQL Editor (como `postgres`) funcionó: la primera foto quedó bien. Pero el trabajo programado
-- la llama por PostgREST con la llave de servicio, y las sesiones de PostgREST cargan `safeupdate` (`authenticator` lo trae en su
-- `session_preload_libraries`), que rechaza todo DELETE o UPDATE sin WHERE: «DELETE requires a WHERE clause» (21000), cada hora,
-- desde la primera corrida programada (22:07 UTC del 2026-11-13). No quedó foto ninguna después de la manual.
--
-- LO QUE CAMBIA: solo esa línea, `delete from retail.rendimiento_estado where true;`. Lo demás de la función es idéntico. La prueba
-- (`pnpm pruebas:vigia-rendimiento`) ahora la llama también con `safeupdate` cargado, como la llama el cron, y falla con la versión de
-- antes (verificado).
--
-- Se pega en UNA parte: solo `create or replace function`, sin tablas, sin políticas, sin `drop`. Se puede volver a pegar.

set lock_timeout = '3s';

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
  -- `where true` y no un `delete` a secas: las sesiones de PostgREST cargan `safeupdate`, que rechaza un DELETE sin WHERE
  -- («DELETE requires a WHERE clause», 21000). Desde el SQL Editor no se nota: ahí no se carga (20261113233000).
  delete from retail.rendimiento_estado where true;
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
  'ADR-0656: toma la foto horaria de pg_stat_statements (diferencias contra la anterior, por función o tabla de retail y por rol). Nunca reinicia nada. Solo el trabajo programado (llave de servicio) o postgres sin sesión. Sin DELETE ni UPDATE sin WHERE: las sesiones de PostgREST cargan safeupdate.';

revoke all on function retail.fn_foto_rendimiento() from public, anon, authenticated;
grant execute on function retail.fn_foto_rendimiento() to service_role;

reset lock_timeout;
