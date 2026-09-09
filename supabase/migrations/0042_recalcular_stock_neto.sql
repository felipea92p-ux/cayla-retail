-- ============================================================================
-- 0042 — `recalcular_stock()` nunca pudo correr en una base con ventas
-- ============================================================================
-- ARQUITECTURA.md §4.2 llama a esta función "la red de seguridad": reconstruye
-- `stock` completo desde `movimientos` cuando se sospecha que el snapshot se
-- desincronizó. Hasta hoy no podía terminar nunca si había una sola venta.
--
-- POR QUÉ FALLABA: insertaba las salidas como `-sum(cantidad)` confiando en que
-- el `on conflict do update` las restara de la fila que ya había creado el paso
-- de entradas. Pero Postgres evalúa los CHECK sobre la fila PROPUESTA, ANTES de
-- detectar el conflicto — así que `stock_cantidad_no_negativa` rechazaba la
-- fila negativa antes de que el update llegara a existir. Reproducción mínima:
--
--   create temp table t (a int primary key, b int check (b >= 0));
--   insert into t values (1, 5);
--   insert into t values (1, -3) on conflict (a) do update set b = t.b + excluded.b;
--   -- ERROR: violates check constraint "t_b_check", aunque el resultado seria 2
--
-- EL ARREGLO: calcular el NETO por (variante, sede) en una sola pasada y recién
-- entonces escribir. Nunca se propone una fila negativa, así que el CHECK deja
-- de ser un obstáculo y vuelve a ser lo que debe ser: la garantía de que un
-- stock imposible no puede existir. Si el neto SÍ diera negativo, la función
-- ahora falla con ese CHECK — que es exactamente lo correcto para una red de
-- seguridad: gritar en vez de guardar una mentira.
--
-- SEGUNDO ARREGLO, del mismo tamaño: la versión vieja empezaba con
-- `truncate table stock`, que además de las cantidades borraba `stock_minimo`
-- (el mínimo por sede que fija la RPC `fijar_stock_minimo`) y `contenedor_id`.
-- Ninguna de esas dos columnas se deriva de `movimientos`, así que reconstruir
-- el stock las destruía. Nadie lo notó porque la función nunca llegó a correr.
-- Ahora se actualiza en vez de truncar: las columnas que no son derivadas
-- sobreviven, y solo se borran las filas de pares que ya no tienen ningún
-- movimiento (una fila derivada obsoleta, no un dato con historial).
-- ============================================================================

create or replace function recalcular_stock()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- 1. El neto de cada par (variante, sede), en una sola pasada.
  insert into stock (variante_id, sede_id, cantidad, ultima_entrada, ultima_salida)
  select variante_id, sede_id, sum(delta), max(entrada_en), max(salida_en)
  from (
    -- La sede donde ocurre el movimiento: entrada y ajuste suman (el ajuste
    -- trae su propio signo), salida y traslado restan.
    select variante_id,
           sede_id,
           case when tipo in ('entrada', 'ajuste') then cantidad else -cantidad end as delta,
           case when tipo = 'entrada' then created_at end as entrada_en,
           case when tipo in ('salida', 'traslado') then created_at end as salida_en
    from movimientos
    union all
    -- La otra pata del traslado: la sede que RECIBE.
    select variante_id, sede_destino_id, cantidad, created_at, null
    from movimientos
    where tipo = 'traslado' and sede_destino_id is not null
  ) neto
  group by variante_id, sede_id
  on conflict (variante_id, sede_id) do update
    set cantidad = excluded.cantidad,
        ultima_entrada = excluded.ultima_entrada,
        ultima_salida = excluded.ultima_salida;

  -- 2. Filas derivadas que ya no corresponden a ningún movimiento.
  delete from stock s
  where not exists (
    select 1 from movimientos m
    where m.variante_id = s.variante_id
      and (m.sede_id = s.sede_id or m.sede_destino_id = s.sede_id)
  );
end;
$$;

comment on function recalcular_stock() is
  'Reconstruye `stock` desde `movimientos` (la fuente de verdad). Calcula el neto por (variante, sede) antes de escribir: proponer filas negativas chocaba con el CHECK antes del ON CONFLICT. Conserva stock_minimo y contenedor_id, que no se derivan de movimientos.';
