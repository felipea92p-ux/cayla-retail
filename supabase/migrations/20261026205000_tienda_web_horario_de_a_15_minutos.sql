-- ============================================================================
-- 20261026205000_tienda_web_horario_de_a_15_minutos.sql — Tienda web ▸ Conf. Tienda (ADR-0518, actualización c)
--
-- EL PROBLEMA PRIMERO. El horario por días de una tienda (20261026162000) solo aceptaba horas «en punto» y «y media», y Felipe necesita poner
-- 8:15 o 9:45: una tienda que abre a las 8:15 no puede decirlo. El límite estaba escrito en dos lugares de la base: el CHECK de la fila
-- (`ubicacion_horario_web_horas`: abre y cierra múltiplos de 30) y la validación de `guardar_horario_tienda_web`.
--
-- LO QUE HACE (las dos cosas, juntas, porque una sin la otra deja la base inconsistente)
--   1. El CHECK `ubicacion_horario_web_horas` pasa de «múltiplo de 30» a «múltiplo de 15». Todo lo que ya hay (de a 30) sigue siendo válido.
--   2. `guardar_horario_tienda_web(uuid, jsonb, text)` valida de a 15 y lo dice con otra frase: «de a 15 minutos». Es el MISMO cuerpo de
--      20261026162000 (misma firma, mismo permiso, mismo rastro); solo cambian los dos `% 30` y las dos frases.
--
-- LO QUE NO CAMBIA. Los topes del día (0 a 1440), que abra antes de cerrar y la regla de la web: `@cayla-retail/shared/horario-de-tienda` pasa de
-- 30 a 15 en el mismo PR.
--
-- ORDEN DE PUBLICACIÓN. Pega ESTA migración ANTES de publicar la web nueva: con la web nueva y la base vieja, guardar un 8:15 falla con la frase
-- vieja. Con la base nueva y la web vieja no pasa nada (la web vieja sigue mandando de a 30, que sigue valiendo).
--
-- PRODUCCIÓN. NO está aplicada. Se pega entera, de una vez: no crea políticas ni toca una tabla en uso por la tienda (`ubicacion_horario_web` solo
-- la leen funciones); `lock_timeout` corta a los 3 s; se puede volver a correr.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.ubicacion_horario_web drop constraint if exists ubicacion_horario_web_horas;
alter table retail.ubicacion_horario_web add constraint ubicacion_horario_web_horas
  check (abre >= 0 and abre < cierra and cierra <= 1440 and abre % 15 = 0 and cierra % 15 = 0);

create or replace function retail.guardar_horario_tienda_web(p_ubicacion_id uuid, p_dias jsonb, p_resumen text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_tipo text;
  v_activo boolean;
  v_resumen text := nullif(regexp_replace(btrim(coalesce(p_resumen, '')), '\s+', ' ', 'g'), '');
  v_nuevos jsonb;
  v_antes jsonb;
  v_horario_antes text;
begin
  if not retail.fn_puede_ajustes_tienda_web() then
    raise exception 'Cambiar el horario de la tienda web necesita el módulo «Datos y plazos de la tienda web» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  select u.tipo, u.activo into v_tipo, v_activo from retail.ubicaciones u where u.id = p_ubicacion_id;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' or not v_activo then
    raise exception 'Solo una tienda abierta aparece en la web.' using errcode = 'P0001';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' then
    raise exception 'El horario tiene que ser una lista de días.' using errcode = 'P0001', hint = 'horario_invalido';
  end if;
  if char_length(v_resumen) > 120 then
    raise exception 'El horario va hasta 120 letras.' using errcode = 'P0001';
  end if;

  -- Cada día: un objeto con tres números enteros. Todo lo demás (texto, decimales, un día 7, un día repetido, abrir después de cerrar o a las
  -- 9:15) se rechaza con la misma frase, antes de escribir nada.
  if exists (
    select 1 from jsonb_array_elements(p_dias) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'dia') is distinct from 'number' or jsonb_typeof(e -> 'abre') is distinct from 'number' or jsonb_typeof(e -> 'cierra') is distinct from 'number'
        or (e ->> 'dia') !~ '^[0-6]$' or (e ->> 'abre') !~ '^[0-9]{1,4}$' or (e ->> 'cierra') !~ '^[0-9]{1,4}$'
  ) then
    raise exception 'El horario de cada día va de a 15 minutos, y abre antes de cerrar.' using errcode = 'P0001', hint = 'horario_invalido';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('dia', (e ->> 'dia')::int, 'abre', (e ->> 'abre')::int, 'cierra', (e ->> 'cierra')::int)
                            order by (e ->> 'dia')::int), '[]'::jsonb)
    into v_nuevos from jsonb_array_elements(p_dias) e;
  if (select count(distinct (e ->> 'dia')) from jsonb_array_elements(v_nuevos) e) <> jsonb_array_length(v_nuevos)
     or exists (
       select 1 from jsonb_array_elements(v_nuevos) e
        where (e ->> 'abre')::int >= (e ->> 'cierra')::int or (e ->> 'cierra')::int > 1440
           or (e ->> 'abre')::int % 15 <> 0 or (e ->> 'cierra')::int % 15 <> 0) then
    raise exception 'El horario de cada día va de a 15 minutos, y abre antes de cerrar.' using errcode = 'P0001', hint = 'horario_invalido';
  end if;

  -- Dos personas guardando el horario de la misma tienda se turnan: la segunda compara contra lo que dejó la primera.
  perform pg_advisory_xact_lock(hashtext('tienda_web_horario:' || p_ubicacion_id::text));

  select coalesce(jsonb_agg(jsonb_build_object('dia', h.dia, 'abre', h.abre, 'cierra', h.cierra) order by h.dia), '[]'::jsonb)
    into v_antes from retail.ubicacion_horario_web h where h.ubicacion_id = p_ubicacion_id;
  select w.horario into v_horario_antes from retail.ubicacion_datos_web w where w.ubicacion_id = p_ubicacion_id;
  if v_antes = v_nuevos and v_horario_antes is not distinct from v_resumen then
    return;
  end if;

  delete from retail.ubicacion_horario_web where ubicacion_id = p_ubicacion_id;
  insert into retail.ubicacion_horario_web (ubicacion_id, dia, abre, cierra)
  select p_ubicacion_id, (e ->> 'dia')::smallint, (e ->> 'abre')::smallint, (e ->> 'cierra')::smallint from jsonb_array_elements(v_nuevos) e;

  insert into retail.ubicacion_datos_web (ubicacion_id, horario, actualizado_en)
  values (p_ubicacion_id, v_resumen, now())
  on conflict (ubicacion_id) do update set horario = excluded.horario, actualizado_en = excluded.actualizado_en;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tienda_web_horario',
          jsonb_build_object('ubicacion_id', p_ubicacion_id,
                             'antes', jsonb_build_object('dias', v_antes, 'horario', v_horario_antes),
                             'despues', jsonb_build_object('dias', v_nuevos, 'horario', v_resumen)),
          v_actor);
end
$$;

comment on function retail.guardar_horario_tienda_web(uuid, jsonb, text) is
  'Tienda web ▸ Conf. Tienda (ADR-0518): los días abiertos de una tienda ([{dia, abre, cierra}], minutos de a 15) y su texto corto. Líder o módulo «Datos y plazos de la tienda web»; firma el responsable; deja rastro.';

comment on table retail.ubicacion_horario_web is
  'Tienda web ▸ Conf. Tienda (ADR-0518): el horario por días de cada tienda en la web. Una fila por día ABIERTO (sin fila, ese día está cerrado). dia 0 = lunes … 6 = domingo; abre/cierra en minutos desde la medianoche, de a 15. Solo por guardar_horario_tienda_web.';

reset lock_timeout;
