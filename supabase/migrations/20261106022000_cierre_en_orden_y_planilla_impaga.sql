-- ============================================================================
-- 20261106022000 — El cierre de mes va en orden, la planilla impaga lo frena y solo se reabre el último (tarea 18 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Dynamic cierra su planilla del 29 al 28 y el período cuenta en el mes en que TERMINA (D-35); entra al libro recién cuando
-- Dynamic lo marca pagado, 1 a 3 días después del 28. Felipe cierra el mes entre el 1 y el 6. Hoy, si el mes se cierra antes de que Dynamic pague, el
-- mes se congela SIN sueldos y la ganancia queda inflada: el chequeo `planilla` solo avisaba. Además nada obliga a cerrar en orden ni a reabrir en orden:
-- desde diciembre se podría cerrar noviembre con octubre abierto, y reabrir octubre movería el Balance y el IGV de un noviembre ya firmado.
--
-- LAS DECISIONES DE FELIPE (2026-11-05, a preguntas separadas)
--   1. La planilla impaga del mes BLOQUEA el cierre, desde el primer mes (octubre).
--   2. Solo un ADMIN puede saltar ese bloqueo, con un motivo escrito que queda en los avisos del cierre.
--   3. Un mes solo se cierra si el anterior ya está cerrado.
--   4. Solo se reabre el ÚLTIMO mes cerrado de esa unidad.
--   5. Si Dynamic corrige la planilla DESPUÉS de cerrar: solo se avisa (el chequeo de la huella ya lo hace); nunca se reabre solo.
--
-- QUÉ CAMBIA (todo con reemplazo anclado sobre la definición viva; si un ancla no aparece exactamente una vez, aborta entero)
--   · fn_cierre_mes_estado: `planilla` bloquea siempre que no esté OK (antes solo si la cuenta no veía la planilla).
--   · cerrar_periodo: (a) exige el mes anterior cerrado, salvo antes del inicio de Finanzas o si esa unidad no tuvo asientos; (b) deja pasar el chequeo
--     `planilla` solo si lo pidió `cerrar_periodo_saltando_planilla` Y quien cierra es Admin, y entonces el aviso guardado lleva el motivo; (c) el mensaje
--     de lo que falta dice «que Dynamic marque pagada la planilla de ese mes» cuando la cuenta sí la ve.
--   · cerrar_periodo_saltando_planilla (nueva, solo Admin): pide el motivo y llama a cerrar_periodo.
--   · reabrir_periodo: rechaza si la misma unidad tiene un mes posterior cerrado.
-- NO HACE: no congela la provisión de sueldos (ADR-0453 §2); no cambia el chequeo de la huella; no toca ningún mes ya cerrado (hoy hay 0).
--
-- DECIDÍ: el permiso de saltar se comprueba dos veces —en la función nueva y otra vez dentro de `cerrar_periodo` con `fn_es_admin()`— porque el
--   motivo viaja por una variable de la transacción (`retail.cierre_salta_planilla`) y no debe bastar con ponerla para saltar.
-- SE ROMPE SI: una migración futura recrea una de estas funciones copiando un texto viejo del repo (lo vigila `pnpm pruebas:cierre-mes`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas ni disparadores. Pegarla dos veces no hace nada.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El chequeo `planilla` bloquea mientras el mes no tenga su planilla pagada ----------
select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$a$v_planilla and coalesce(pm.este_mes, 0) > 0, not v_planilla,$a$,
$n$v_planilla and coalesce(pm.este_mes, 0) > 0, not (v_planilla and coalesce(pm.este_mes, 0) > 0),$n$, 1);

-- ---------- 2. cerrar_periodo ----------
select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$  v_faltan text;
  v_nombre text;
begin$a$,
$n$  v_faltan text;
  v_nombre text;
  v_salta text;
  v_saltada boolean := false;
begin$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$  v_actor := retail.fn_actor_persona_id(true);
  v_nombre := retail.fn_texto_periodo(v_mes, p_alcance, p_ubicacion_id);$a$,
$n$  v_actor := retail.fn_actor_persona_id(true);
  v_nombre := retail.fn_texto_periodo(v_mes, p_alcance, p_ubicacion_id);

  -- Tarea 18: los meses se cierran en orden. No cuenta el mes anterior si es anterior al inicio de Finanzas ni si esa unidad no tuvo asientos.
  if p_alcance in ('ubicacion', 'empresa')
     and (v_mes - interval '1 month')::date >= date_trunc('month', coalesce(retail.fn_finanzas_desde(), v_mes))::date
     and exists (select 1 from retail.fn_cierre_mes_estado((v_mes - interval '1 month')::date) e
                  where e.alcance = p_alcance and e.ubicacion_id is not distinct from p_ubicacion_id and e.estado <> 'cerrado'
                    and exists (select 1 from jsonb_array_elements(e.chequeos) k
                                 where k ->> 'clave' = 'diario' and coalesce((k -> 'datos' ->> 'asientos')::integer, 0) > 0)) then
    raise exception 'Primero cierra % de %: los meses se cierran en orden.',
      retail.fn_mes_nombre((v_mes - interval '1 month')::date), extract(year from (v_mes - interval '1 month'))::integer using errcode = 'P0001';
  end if;$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$    if v_est.bloqueantes > 0 then$a$,
$n$    -- Tarea 18: la planilla impaga bloquea; solo un Admin la salta, y solo si pidió saltarla (cerrar_periodo_saltando_planilla).
    v_salta := case when retail.fn_es_admin() then nullif(current_setting('retail.cierre_salta_planilla', true), '') end;
    if v_salta is not null and exists (select 1 from jsonb_array_elements(v_est.chequeos) k
                                        where k ->> 'clave' = 'planilla' and (k ->> 'bloquea')::boolean and not (k ->> 'ok')::boolean
                                          and coalesce((k -> 'datos' ->> 'visible')::boolean, false)) then
      v_saltada := true;
    end if;
    if v_est.bloqueantes - (case when v_saltada then 1 else 0 end) > 0 then$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$       where (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean;$a$,
$n$       where (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean and not (v_saltada and x ->> 'clave' = 'planilla');$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$               when 'planilla' then 'cerrarlo con una cuenta que vea la planilla en Dynamic'$a$,
$n$               when 'planilla' then case when coalesce((x -> 'datos' ->> 'visible')::boolean, false)
                                          then 'que Dynamic marque pagada la planilla de ese mes (o que un Admin la salte con un motivo)'
                                          else 'cerrarlo con una cuenta que vea la planilla en Dynamic' end$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$     where not (x ->> 'bloquea')::boolean and not (x ->> 'ok')::boolean and x ->> 'clave' <> 'huella';$a$,
$n$     where (not (x ->> 'bloquea')::boolean or (v_saltada and x ->> 'clave' = 'planilla')) and not (x ->> 'ok')::boolean and x ->> 'clave' <> 'huella';
    -- La planilla saltada queda en el cierre con su motivo: ahí se ve quién la dejó pasar y por qué.
    if v_saltada then
      select coalesce(jsonb_agg(case when x ->> 'clave' = 'planilla'
                                     then x || jsonb_build_object('saltada', true, 'motivo', v_salta, 'saltada_por', v_actor)
                                     else x end), '[]'::jsonb)
        into v_avisos
        from jsonb_array_elements(v_avisos) x;
    end if;$n$, 1);

-- ---------- 3. reabrir_periodo: solo el último cerrado ----------
select pg_temp.reemplazar('retail.reabrir_periodo(date,text,uuid,text)',
$a$  update retail.periodo_cierres set reabierto_en = now(), reabierto_por = v_actor, motivo_reapertura = trim(p_motivo)
   where id = v_per.cierre_id;$a$,
$n$  -- Tarea 18: solo se reabre el último mes cerrado de esa unidad; si no, el Balance y el IGV de un mes ya firmado cambiarían.
  if exists (select 1 from retail.periodos p
              where p.alcance = p_alcance and p.ubicacion_id is not distinct from p_ubicacion_id and p.mes > v_mes and p.estado = 'cerrado') then
    raise exception 'Primero reabre el mes siguiente: solo se reabre el último mes cerrado.' using errcode = 'P0001';
  end if;

  update retail.periodo_cierres set reabierto_en = now(), reabierto_por = v_actor, motivo_reapertura = trim(p_motivo)
   where id = v_per.cierre_id;$n$, 1);

-- ---------- 4. Cerrar saltando la planilla impaga (solo Admin) ----------
create or replace function retail.cerrar_periodo_saltando_planilla(p_mes date, p_alcance text, p_ubicacion_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_admin() then
    raise exception 'Cerrar sin la planilla pagada es solo del Admin.' using errcode = '42501';
  end if;
  if p_motivo is null or char_length(trim(p_motivo)) < 5 then
    raise exception 'Di por qué se cierra sin la planilla pagada (queda en el cierre).' using errcode = 'P0001';
  end if;
  perform set_config('retail.cierre_salta_planilla', trim(p_motivo), true);
  return retail.cerrar_periodo(p_mes, p_alcance, p_ubicacion_id);
end $$;
comment on function retail.cerrar_periodo_saltando_planilla(date, text, uuid, text) is
  'Cierra el mes de una unidad aunque Dynamic no haya pagado su planilla (tarea 18): solo el Admin, con motivo, que queda en los avisos del cierre.';
revoke all on function retail.cerrar_periodo_saltando_planilla(date, text, uuid, text) from public, anon;
grant execute on function retail.cerrar_periodo_saltando_planilla(date, text, uuid, text) to authenticated;

reset lock_timeout;
