-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- Sin timestamp a propósito (mismo motivo que `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`): `db reset`
-- la ignora. Toca datos que existen una sola vez, en producción.
--
-- ⚠️ CORREGIDO HORAS DESPUÉS: este script se pegó en producción y se equivocó de serie. En el panel de Lucode (PROD) Felipe vio
--    boletas emitidas hasta B001-000003: la serie de Tienda TRU es B001 y el próximo es el 4, no B004. Lo que quedó en producción
--    lo hizo `pegar-en-produccion-serie-boleta-trujillo-b001-proximo-4-2026-09-29.sql` (ADR-0278, «Actualización 2026-09-29 (tarde)»).
--    Se conserva como registro de lo que se pegó. NO lo vuelvas a pegar.
--
-- QUÉ HACE (2026-09-29, tarde; decisión de Felipe, con los números leídos por él en el panel de Lucode).
--   La boleta de Tienda TRU vuelve a la serie B004 y el próximo número es el 4.
--     · ARCHIVA B001 (boleta, Trujillo) —no la borra: `B001-000001` la nombra—.
--     · REACTIVA B004 (boleta, Trujillo) con `siguiente_numero = 4`.
--
-- POR QUÉ. Esta mañana `pegar-en-produccion-series-salida-a-produccion-2026-09.sql` archivó B004 y abrió B001 desde 1
-- (ADR-0278). El motivo: el sandbox de Lucode había gastado los números 4 a 33 de B004 y `B004-33` existía en
-- `comprobantes`, así que «seguir en el 4» exigía borrar un comprobante. Ese comprobante ya no está (quedan solo
-- `B004-2` y `B004-3`, de producción), y Felipe verificó en Lucode que la serie de boleta que existe en la SUNAT real
-- es B004, con tres números ya usados (1, 2 y 3): el que sigue es el 4. B001 nunca se registró allí.
--
-- NO TOCA. Ni una sola fila de `comprobantes`, `ventas` ni `movimientos`. `B001-000001` (una venta de prueba del
-- 2026-09-29, ya «aceptada» por Lucode) conserva su número; qué hacer con ella es un paso aparte (ver
-- docs/backlog/2026-09-29-anular-venta-restaurar-stock-920c1a.md). Tampoco toca las series de Arequipa (B002) ni Lima
-- (B003): la corrección de hoy es solo la de Trujillo, que es la que Felipe verificó.
--
-- CUÁNDO. Se puede pegar con la tienda abierta: son dos UPDATE de una fila cada uno, dentro de una transacción. Lo que
-- importa es que NO haya una venta a medias: una venta que ya reservó B001-000002 la termina como B001-000002.
--
-- TODO O NADA. El SQL Editor corre lo pegado en UNA transacción: si una comprobación falla, no queda nada a medias.
-- Es idempotente: pegarlo dos veces no cambia nada la segunda vez.
-- No crea políticas ni altera tablas: no toma los bloqueos de `auth`/`storage` (ADR-0195).
--
-- POR QUÉ NO USA `registrar_serie_comprobante`/`archivar_serie_comprobante`: el SQL Editor no tiene sesión de app
-- (`fn_es_lider()` da falso) y esas funciones tampoco dejan bajar un contador. El `update` directo es el patrón de
-- `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`; la auditoría es este archivo. `archivada_por` queda NULL.
--
-- CÓMO SE DESHACE: el mismo script con B001 y B004 cambiados de lugar (archivar B004, reactivar B001 con el próximo
-- número que le corresponda: `select siguiente_numero from retail.series_comprobantes where serie = 'B001'`).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- PASO 1 · PREVIEW: mira las series de boleta de hoy antes de seguir ----------
-- El SQL Editor muestra solo el resultado de la ÚLTIMA sentencia: para ver esta tabla, córrela SOLA antes de pegar todo.
-- Debe salir: B001 ACTIVA (próximo 2) y B004 archivada (próximo 34) en Tienda TRU.
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
  v_emitidos_b001 text;
begin
  select id into v_tru from retail.ubicaciones where nombre = 'Tienda TRU';
  if v_tru is null then
    raise exception 'No existe la sede «Tienda TRU»: revisa el nombre en retail.ubicaciones.';
  end if;

  select * into v_b001 from retail.series_comprobantes where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B001';
  select * into v_b004 from retail.series_comprobantes where ubicacion_id = v_tru and tipo = 'boleta' and serie = 'B004';
  if v_b004.id is null then
    raise exception 'Tienda TRU no tiene la serie de boleta B004 (ni activa ni archivada): no hay nada que reactivar.';
  end if;

  -- Ya está hecho: B004 activa y su contador en el 4 o más. Pegarlo dos veces no cambia nada.
  if v_b004.archivada_at is null and v_b004.siguiente_numero >= 4 then
    return;
  end if;

  -- El 4 tiene que estar libre: si B004 ya emitió el 4 o más, «seguir en el 4» chocaría con un comprobante que existe.
  select coalesce(max(numero), 0) into v_mayor from retail.comprobantes where serie = 'B004';
  if v_mayor >= 4 then
    raise exception 'B004 ya emitió hasta el número %: el 4 no está libre. Revisa retail.comprobantes antes de seguir.', v_mayor;
  end if;

  -- 1. Archivar B001 PRIMERO: hay una sola serie de boleta activa por tienda (índice único parcial).
  if v_b001.id is not null and v_b001.archivada_at is null then
    select coalesce(string_agg(serie || '-' || lpad(numero::text, 6, '0'), ', ' order by numero), 'ninguno')
      into v_emitidos_b001
      from retail.comprobantes where serie = 'B001';
    update retail.series_comprobantes
       set archivada_at = now(),
           motivo_archivo = 'La serie de boleta de Tienda TRU en Lucode es B004 (Felipe lo verificó en el panel el 2026-09-29); '
                            || 'B001 se abrió al salir a producción (ADR-0278) y Lucode no la tiene. Comprobantes emitidos con ella: '
                            || v_emitidos_b001 || ' (conservan su número).'
     where id = v_b001.id;
  end if;

  -- 2. Reactivar B004 con el próximo en 4 (3 números ya usados en la SUNAT real: 1, 2 y 3).
  update retail.series_comprobantes
     set archivada_at = null, archivada_por = null, motivo_archivo = null, siguiente_numero = 4
   where id = v_b004.id;

  -- Comprobación final: B004 activa con próximo 4, y ninguna otra boleta activa en Trujillo.
  if not exists (
    select 1 from retail.series_comprobantes
     where id = v_b004.id and archivada_at is null and siguiente_numero = 4
  ) then
    raise exception 'B004 no quedó activa con el próximo en 4: no se aplica nada.';
  end if;
  if (select count(*) from retail.series_comprobantes
       where ubicacion_id = v_tru and tipo = 'boleta' and archivada_at is null) <> 1 then
    raise exception 'Tienda TRU debe tener UNA sola serie de boleta activa: no se aplica nada.';
  end if;
end $$;

-- ---------- PASO 3 · VERIFICAR (mira la tabla) ----------
-- Debe salir: Tienda TRU · B004 ACTIVA con próximo 4, y B001 archivada con su motivo. Arequipa (B002) y Lima (B003) igual que antes.
select u.nombre as sede, s.serie, s.siguiente_numero as proximo,
       case when s.archivada_at is null then 'ACTIVA' else 'archivada' end as estado, s.motivo_archivo
  from retail.series_comprobantes s
  join retail.ubicaciones u on u.id = s.ubicacion_id
 where s.tipo = 'boleta'
 order by u.nombre, s.serie;

-- Y los comprobantes siguen donde estaban (no se tocó ninguno): B001-000001 y B004-000002/3.
select serie, numero, estado, entorno_transmision from retail.comprobantes where tipo = 'boleta' order by serie, numero;
