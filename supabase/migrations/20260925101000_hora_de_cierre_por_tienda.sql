-- ============================================================================
-- 20260925101000 — La hora de cierre de cada tienda, para «al ritmo de hoy cierras en…» (ADR-0195, ajuste al spike)
--
-- EL PROBLEMA PRIMERO: la tarjeta «Meta de hoy» de Caja (spike de Finanzas) dice cuánto venderá la tienda si sigue al
-- ritmo que lleva: lo vendido desde que abrió la caja, repartido por hora, por las horas que faltan hasta cerrar. La base
-- no sabía a qué hora cierra cada tienda, así que la pantalla mostraba el avance en % en su lugar.
--
-- LAS REGLAS
--   · `ubicaciones.hora_cierre` (hora de Lima). Vacía = no se proyecta: Caja sigue mostrando el avance en %.
--   · La cambia solo el líder, en Configuración ▸ Tiendas y caja, firmando con el responsable y dejando el antes/después
--     en `configuracion_historial`, como las metas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN:
--   PARTE 1 la columna (sola: `ubicaciones` se usa a diario) · PARTE 2 las funciones. Cada una espera 3 s un candado; si
--   dice «lock timeout», se repite ESA parte. Idempotentes. Sin políticas.
-- SE ROMPE SI: la web se publica antes (Configuración llama a una función que no existiría y Caja pide una columna nueva).
-- ============================================================================

-- ============================== PARTE 1 · ubicaciones (sola) ==============================
set lock_timeout = '3s';
alter table retail.ubicaciones add column if not exists hora_cierre time;
comment on column retail.ubicaciones.hora_cierre is
  'A qué hora cierra la tienda (hora de Lima). Caja la usa para proyectar la venta del día al ritmo que lleva. Vacía = no se proyecta.';
reset lock_timeout;

-- ============================== PARTE 2 · funciones ==============================
set lock_timeout = '3s';

create or replace function retail.guardar_hora_cierre_tienda(p_ubicacion_id uuid, p_hora time)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_antes time;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder cambia la hora de cierre de una tienda.' using errcode = 'P0001';
  end if;
  select hora_cierre into v_antes from ubicaciones where id = p_ubicacion_id for update;
  if not found then raise exception 'Esa tienda no existe.' using errcode = 'P0001'; end if;
  update ubicaciones set hora_cierre = p_hora where id = p_ubicacion_id;
  insert into configuracion_historial (que, detalle, hecho_por)
  values ('hora_cierre_tienda', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', p_hora), v_actor);
end $$;
revoke all on function retail.guardar_hora_cierre_tienda(uuid, time) from public, anon;
grant execute on function retail.guardar_hora_cierre_tienda(uuid, time) to authenticated;

-- Configuración ▸ Tiendas y caja lee la hora con lo demás de cada tienda. Parche por ancla sobre la definición VIVA
-- (`fn_configuracion_tiendas` es de F1, ya en producción): el ancla tiene que aparecer una sola vez.
do $$
declare v_def text; v_hay integer;
  v_ancla constant text := $a$'meta_mes', retail.fn_meta_mes(u.id, p_mes)) order by u.nombre)$a$;
begin
  v_def := pg_get_functiondef('retail.fn_configuracion_tiendas(date)'::regprocedure);
  if position('hora_cierre' in v_def) > 0 then
    return;
  end if;
  v_hay := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_hay <> 1 then
    raise exception 'fn_configuracion_tiendas cambió en la base: revisar antes de pegar (anclas: %).', v_hay;
  end if;
  execute replace(v_def, v_ancla,
    $n$'meta_mes', retail.fn_meta_mes(u.id, p_mes), 'hora_cierre', to_char(u.hora_cierre, 'HH24:MI')) order by u.nombre)$n$);
end $$;

reset lock_timeout;
