-- ============================================================================
-- VERIFICACIÓN de las migraciones 20260930040100 y 20260930050200 — SOLO LECTURA (no cambia nada).
-- Se pega DESPUÉS de `1-pegar-esto.sql` y devuelve UNA tabla. Lo que importa: la última fila («RESUMEN») debe decir 0.
--   · «función …»  compara el cuerpo de cada función contra el de la que se probó en local (md5). «DISTINTA» = lo pegado no es igual a lo probado.
--   · el resto comprueba la tabla, su candado (RLS sin políticas, historial que no se edita) y quién puede ejecutar qué.
--   · las filas «info» no fallan: solo cuentan lo que hoy hay (por ejemplo, TRU todavía no tiene meta cargada, por eso el reparto sale vacío).
-- ============================================================================
with esperado(funcion, md5_esperado) as (values
    ('fijar_meta_persona', '90183f3e9aeececf64511ebddd997eb8'),
    ('fn_asistencia_por_dia', '1292e3793933aaf7fb61dfdfc59e6b2e'),
    ('fn_horas_programadas', 'ba4ec3329b5b56ca657fb970ebca1aa5'),
    ('fn_metas_equipo', '69d59c18e4b063ce44a61d537e202677'),
    ('fn_metas_historial', 'f1a96632eee74ea67ea35d35540474c0'),
    ('fn_metas_por_dia', 'adec4c46c5013942c471826d6764efc3'),
    ('fn_mi_meta', '79e84e16209fbfdbadcb99998e14c3bd'),
    ('fn_mis_ventas_del_dia', '2cac10647980ccaff8c61221ce08b047'),
    ('fn_mis_ventas_por_dia', '507a16d1e38d0d0f3251f41918a0dca3'),
    ('fn_rendimiento_serie', '2caeff522aab15033a9c1e21b07242fe'),
    ('fn_reparto_meta', '109f6c0580b09e0349150a6fd50ba3d0')
),
publicas(funcion) as (values ('fn_mis_ventas_del_dia'), ('fn_metas_equipo'), ('fn_metas_historial'), ('fn_mi_meta'), ('fn_mis_ventas_por_dia'), ('fn_rendimiento_serie'), ('fijar_meta_persona')),
internas(funcion) as (values ('fn_horas_programadas'), ('fn_asistencia_por_dia'), ('fn_reparto_meta'), ('fn_metas_por_dia')),
tru as (select id from retail.ubicaciones where tipo = 'tienda' and nombre in ('Tienda TRU', 'Tienda Trujillo') order by nombre limit 1),
hoy as (select (now() at time zone 'America/Lima')::date as d),
r as (
  select 'función ' || e.funcion as chequeo,
         case when p.oid is null then 'FALTA' when md5(p.prosrc) = e.md5_esperado then 'ok' else 'DISTINTA' end as resultado,
         'ok' as esperado
    from esperado e
    left join pg_proc p on p.pronamespace = 'retail'::regnamespace and p.proname = e.funcion
  union all
  select 'la tabla metas_persona_ajustes existe', case when to_regclass('retail.metas_persona_ajustes') is not null then 'ok' else 'FALTA' end, 'ok'
  union all
  select 'RLS encendido en la tabla', case when coalesce((select relrowsecurity from pg_class where oid = to_regclass('retail.metas_persona_ajustes')), false) then 'ok' else 'APAGADO' end, 'ok'
  union all
  select 'políticas en la tabla (0 = nadie la lee directo)', (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'metas_persona_ajustes')::text, '0'
  union all
  select 'el disparador que impide editar o borrar el historial existe',
         case when exists (select 1 from pg_trigger where tgrelid = to_regclass('retail.metas_persona_ajustes') and tgname = 'trg_metas_ajustes_inmutable') then 'ok' else 'FALTA' end, 'ok'
  union all
  select 'anon o authenticated pueden tocar la tabla directo',
         case when has_table_privilege('anon', 'retail.metas_persona_ajustes', 'select,insert,update,delete')
                or has_table_privilege('authenticated', 'retail.metas_persona_ajustes', 'select,insert,update,delete') then 'SÍ (mal)' else 'no' end, 'no'
  union all
  select 'pública ' || u.funcion || ': authenticated sí, anon no',
         case when has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') then 'ok' else 'MAL' end, 'ok'
    from publicas u join pg_proc p on p.pronamespace = 'retail'::regnamespace and p.proname = u.funcion
  union all
  select 'interna ' || u.funcion || ': nadie desde la web',
         case when not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') then 'ok' else 'MAL' end, 'ok'
    from internas u join pg_proc p on p.pronamespace = 'retail'::regnamespace and p.proname = u.funcion
  union all
  select 'info: fn_mis_ventas_del_dia() desde el editor (sin sesión) devuelve', (select count(*) from retail.fn_mis_ventas_del_dia())::text, 'info'
  union all
  select 'info: TRU, personas con horas programadas hoy (lee horarios_asignados de Dynamic)',
         (select count(*) from retail.fn_horas_programadas((select id from tru), (select d from hoy), (select d from hoy)) h where h.horas > 0)::text, 'info'
  union all
  select 'info: TRU, filas de reparto hoy (0 = TRU todavía no tiene meta cargada)',
         (select count(*) from retail.fn_reparto_meta((select id from tru), (select d from hoy), (select d from hoy)))::text, 'info'
)
select chequeo, resultado, esperado from (
  select chequeo, resultado, esperado, 0 as orden from r
  union all
  select 'RESUMEN: chequeos que NO coinciden (debe ser 0)', count(*) filter (where esperado <> 'info' and resultado <> esperado)::text, '0', 1 from r
) z
order by orden, chequeo;
