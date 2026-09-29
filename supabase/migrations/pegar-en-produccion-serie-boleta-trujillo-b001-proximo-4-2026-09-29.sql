-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`): `db reset`
-- la ignora. Toca datos que existen una sola vez, en producción.
--
-- QUÉ HACE (2026-09-29, tarde; decisión de Felipe, con lo que ve en el panel de Lucode).
--   La boleta de Tienda TRU va por la serie B001 y el próximo número es el 4.
--     · REACTIVA B001 (boleta, Trujillo) con `siguiente_numero = 4`.
--     · ARCHIVA B004 (boleta, Trujillo) —no la borra: `B004-000002` y `B004-000003` la nombran—.
--
-- POR QUÉ. Este script CORRIGE a `pegar-en-produccion-serie-boleta-trujillo-b004-2026-09-29.sql`, que se pegó horas antes
-- con la serie B004 y el próximo en 4 (Felipe había leído «B004» en Lucode). Después, en el panel de Lucode (PROD), Felipe
-- vio boletas emitidas hasta B001-000003: la serie que se está usando es B001 y el que sigue es el 4.
--
-- LO QUE ESTE SCRIPT NO PUEDE ARREGLAR. El ERP solo conoce `B001-000001` (la venta de prueba de las 12:55). Los números
-- 2 y 3 de B001 existen en Lucode y NO en el ERP: alguien los emitió por fuera (¿el panel de Lucode?). Este script deja el
-- contador en 4 para no repetirlos; qué son esas dos boletas, y si hay que darlas de baja, es asunto aparte.
--
-- NO TOCA. Ni una sola fila de `comprobantes`, `ventas` ni `movimientos`. Tampoco las series de Arequipa (B002) ni Lima (B003).
--
-- CUÁNDO. Se puede pegar con la tienda abierta: son dos UPDATE de una fila cada uno, dentro de una transacción. Lo que
-- importa es que NO haya una venta a medias: una que ya reservó B004-000004 la termina como B004-000004.
--
-- TODO O NADA. El SQL Editor corre lo pegado en UNA transacción: si una comprobación falla, no queda nada a medias.
-- Es idempotente: pegarlo dos veces no cambia nada la segunda vez.
-- No crea políticas ni altera tablas: no toma los bloqueos de `auth`/`storage` (ADR-0195).
-- `archivada_por` queda NULL (no hay «quién» sin sesión de app); el motivo lo dice.
--
-- CÓMO SE DESHACE: el mismo script con B001 y B004 cambiados de lugar.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- PASO 1 · PREVIEW: mira las series de boleta de hoy antes de seguir ----------
-- El SQL Editor muestra solo el resultado de la ÚLTIMA sentencia: para ver esta tabla, córrela SOLA antes de pegar todo.
-- Debe salir: B004 ACTIVA (próximo 4) y B001 archivada (próximo 2) en Tienda TRU.
select u.nombre as sede, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where s.tipo = 'boleta'
 order by u.nombre, s.serie;

-- ---------- PASO 2 · APLICAR ----------
do $$
declare
  v_tru uuid;
  v_b001 retail.series_comprobantes%rowtype;
  v_b004 retail.series_comprobantes%rowtype;
  v_mayor integer;
  v_emitidos_b004 text;
begin
  select id into v_tru from retail.ubicaciones where nombre = 'Tienda TRU';
  if v_tru is null then
    raise exception 'No existe la sede «Tienda TRU»: revisa el nombre en retail.ubicaciones.';
  end if;

  select * into v_b001 from retail.series_comprobantes where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B001';
  select * into v_b004 from retail.series_comprobantes where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B004';
  if v_b001.id is null then
    raise exception 'Tienda TRU no tiene la serie de boleta B001 (ni activa ni archivada): no hay nada que reactivar.';
  end if;

  -- Ya está hecho: B001 activa y su contador en el 4 o más. Pegarlo dos veces no cambia nada.
  if v_b001.archivada_at is null and v_b001.siguiente_numero >= 4 then
    return;
  end if;

  -- El 4 tiene que estar libre: si B001 ya emitió el 4 o más, «seguir en el 4» chocaría con un comprobante que existe.
  select coalesce(max(numero), 0) into v_mayor from retail.comprobantes where serie = 'B001';
  if v_mayor >= 4 then
    raise exception 'B001 ya emitió hasta el número %: el 4 no está libre. Revisa retail.comprobantes antes de seguir.', v_mayor;
  end if;

  -- 1. Archivar B004 PRIMERO: hay una sola serie de boleta activa por tienda (índice único parcial).
  if v_b004.id is not null and v_b004.archivada_at is null then
    select coalesce(string_agg(serie || '-' || lpad(numero::text, 6, '0'), ', ' order by numero), 'ninguno')
      into v_emitidos_b004
      from retail.comprobantes where serie = 'B004';
    update retail.series_comprobantes
       set archivada_at = now(),
           motivo_archivo = 'Corrección del 2026-09-29 (tarde): en el panel de Lucode (PROD) Felipe vio boletas emitidas hasta B001-000003, '
                            || 'así que la serie de Tienda TRU es B001 y el próximo es el 4. B004 se había reactivado horas antes. '
                            || 'Comprobantes emitidos con ella: ' || v_emitidos_b004 || ' (conservan su número).'
     where id = v_b004.id;
  end if;

  -- 2. Reactivar B001 con el próximo en 4 (los números 1, 2 y 3 ya están usados en Lucode).
  update retail.series_comprobantes
     set archivada_at = null, archivada_por = null, motivo_archivo = null, siguiente_numero = 4
   where id = v_b001.id;

  -- Comprobación final: B001 activa con próximo 4, y ninguna otra boleta activa en Trujillo.
  if not exists (
    select 1 from retail.series_comprobantes
     where id = v_b001.id and archivada_at is null and siguiente_numero = 4
  ) then
    raise exception 'B001 no quedó activa con el próximo en 4: no se aplica nada.';
  end if;
  if (select count(*) from retail.series_comprobantes
       where ubicacion_id = v_tru and tipo = 'boleta' and archivada_at is null) <> 1 then
    raise exception 'Tienda TRU debe tener UNA sola serie de boleta activa: no se aplica nada.';
  end if;
end $$;

-- ---------- PASO 3 · VERIFICAR (mira la tabla) ----------
-- Debe salir: Tienda TRU · B001 ACTIVA con próximo 4, y B004 archivada con su motivo. Arequipa (B002) y Lima (B003) igual que antes.
select u.nombre as sede, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado, s.motivo_archivo
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where s.tipo = 'boleta'
 order by u.nombre, s.serie;

-- Y los comprobantes siguen donde estaban (no se tocó ninguno): B001-000001 y B004-000002/3.
select serie, numero, estado, entorno_transmision from retail.comprobantes where tipo = 'boleta' order by serie, numero;
