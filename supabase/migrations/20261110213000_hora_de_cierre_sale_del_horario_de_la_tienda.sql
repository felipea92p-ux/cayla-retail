-- ============================================================================
-- 20261110213000 — La hora de cierre de una tienda sale de su horario por días (ADR-0642)
--
-- EL PROBLEMA PRIMERO: el cierre de una tienda vivía dos veces. `ubicaciones.hora_cierre` (una sola hora, la que lee Caja para avisar
-- «cierra la caja» y proyectar la venta del día) y `ubicacion_horario_web` + `ubicacion_cierres_web` (el horario por días y los
-- cierres por fecha de Tienda web ▸ Conf. Tienda, ADR-0518). El 2026-11-10 el horario real estaba cargado en las tres tiendas
-- (AQP 2:15–10:15 p. m. todos los días; LIM lunes a sábado; TRU con domingo más corto) y `hora_cierre` vacía en las cuatro sedes:
-- Caja no avisaba ni proyectaba, y la tarjeta de Configuración decía «Falta». Un solo dato dicho dos veces (principio 4).
--
-- LA REGLA (una sola, `fn_hora_cierre_de`): a qué hora cierra una sede en una fecha
--   1. la fecha está en `ubicacion_cierres_web` (feriado, inventario)  → no abre: sin hora (null).
--   2. la sede tiene horario por días → la hora de cierre de ese día de la semana; sin fila ese día = cerrada = null.
--   3. la sede no tiene horario por días (el Taller, o una tienda sin cargar) → `ubicaciones.hora_cierre`, el respaldo de antes.
--   `dia` 0 = lunes … 6 = domingo (como `ubicacion_horario_web`). Un cierre a las 24:00 sale como 23:59 (un `time` no llega a 24).
--   `fn_horas_de_cierre(fecha)` es la misma regla para todas las sedes activas de una vez (Caja y Configuración leen todas), con
--   `tiene_horario`: ¿la sede tiene algún horario cargado? Sin él, a Configuración le «falta»; con él y sin hora ese día, hoy no abre.
--
-- QUIÉN LA LLAMA: cualquier cuenta con sesión (`authenticated`): devuelve solo una hora, como ya la leía cualquiera con la tabla
--   `ubicaciones`. No escribe nada. Las tablas del horario siguen sin políticas (solo funciones `security definer`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola ejecución (crea dos funciones; no toca tablas ni políticas), con `lock_timeout` de 3 s e
--   idempotente (`create or replace`). La web que la usa cae sola a `ubicaciones.hora_cierre` si la función no existe todavía, así que
--   el orden entre pegar y publicar no rompe nada.
-- SE ROMPE SI: alguien carga un horario con un día sin fila para una sede y espera que Caja avise igual ese día: sin fila, ese día
--   la sede está cerrada, y una caja abierta en un día cerrado no recibe el aviso de cierre.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_hora_cierre_de(p_ubicacion_id uuid, p_fecha date)
returns time
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when p_ubicacion_id is null or p_fecha is null then null
    when exists (select 1 from retail.ubicacion_cierres_web c where c.ubicacion_id = p_ubicacion_id and c.fecha = p_fecha) then null
    when exists (select 1 from retail.ubicacion_horario_web h where h.ubicacion_id = p_ubicacion_id) then
      (select case when h.cierra >= 1440 then time '23:59' else make_time(h.cierra / 60, h.cierra % 60, 0) end
         from retail.ubicacion_horario_web h
        where h.ubicacion_id = p_ubicacion_id and h.dia = extract(isodow from p_fecha)::int - 1)
    else (select u.hora_cierre from retail.ubicaciones u where u.id = p_ubicacion_id)
  end
$$;

revoke all on function retail.fn_hora_cierre_de(uuid, date) from public, anon;
grant execute on function retail.fn_hora_cierre_de(uuid, date) to authenticated;
comment on function retail.fn_hora_cierre_de(uuid, date) is
  'ADR-0642: a qué hora cierra una sede en una fecha. Cierre por fecha → null; horario por días → el cierre de ese día (sin fila = cerrada = null); sin horario por días → ubicaciones.hora_cierre.';

create or replace function retail.fn_horas_de_cierre(p_fecha date)
returns table (ubicacion_id uuid, hora_cierre time, tiene_horario boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select u.id,
         retail.fn_hora_cierre_de(u.id, p_fecha),
         (u.hora_cierre is not null or exists (select 1 from retail.ubicacion_horario_web h where h.ubicacion_id = u.id))
    from retail.ubicaciones u
   where u.activo
$$;

revoke all on function retail.fn_horas_de_cierre(date) from public, anon;
grant execute on function retail.fn_horas_de_cierre(date) to authenticated;
comment on function retail.fn_horas_de_cierre(date) is
  'ADR-0642: fn_hora_cierre_de para todas las sedes activas en una fecha, y si la sede tiene horario cargado (tiene_horario: por días, o la hora suelta de antes). Caja y Configuración leen el cierre de hoy con ella.';

reset lock_timeout;
