-- 20261107164000 — Rendimiento (ADR-0622, parte 1): índices que el marco de cada pantalla necesita y las metas del mes en una
-- sola llamada.
--
-- EL PROBLEMA. Auditoría del 2026-11-07 sobre una copia de main con un año de operación sintética (6 tiendas, 131.000 ventas,
-- 407.000 movimientos; `scripts/carga/`):
--   · El número junto a «Traslados» del menú se calcula en el marco de TODA pantalla y filtra `transferencias` por sede de
--     destino y estado, pero la tabla solo tiene índice por id, número y token: con el tiempo, cada clic recorre todos los
--     traslados de la historia. Lo mismo para «lo que salió de aquí» (sede de origen).
--   · Panel Comercial: pedía la meta de cada día del mes, tienda por tienda (~30 llamadas por tienda, ≈120 por carga), y cada
--     llamada era una petición a PostgREST que se peleaba las 60 conexiones de la base con las cajas.
--   · Llaves foráneas sin índice que se usan para buscar «todo lo de esta prenda / este cliente»: separaciones por cliente y por
--     venta, prendas apartadas, traslados y compras por variante.
--
-- QUÉ HACE. Índices `if not exists` (se puede pegar dos veces) y una función de LECTURA nueva, `fn_metas_de_los_dias`, que
-- pregunta a la misma `fn_parametros_caja` de Caja e Inicio por cada (tienda, día): una sola regla, una sola ida a la base. Es
-- `security invoker`: cada llamada a `fn_parametros_caja` hace su propio control de acceso, igual que antes. La web (`lib/comercial.ts`)
-- vuelve a preguntar día por día si esta función todavía no está en la base.
--
-- PRODUCCIÓN. Sin políticas ni `drop trigger` (no toma `auth`/`storage`, ADR-0195). Los índices bloquean la ESCRITURA de su tabla
-- mientras se crean: son tablas chicas (traslados, apartados, compras) y `lock_timeout` corta en 3 s si una caja está guardando.
-- Si corta, se vuelve a pegar.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- El contador de Traslados del menú y las listas «por recibir» / «enviados» (lib/traslados.ts).
create index if not exists transferencias_destino_estado_idx on retail.transferencias (ubicacion_destino_id, estado);
create index if not exists transferencias_origen_estado_idx on retail.transferencias (ubicacion_origen_id, estado);
-- Historial de una prenda: en qué traslados viajó.
create index if not exists transferencia_items_variante_idx on retail.transferencia_items (variante_id);

-- Ficha de un cliente (sus apartados) y la venta que cerró un apartado.
create index if not exists separaciones_clienta_idx on retail.separaciones (clienta_id) where clienta_id is not null;
create index if not exists separaciones_venta_idx on retail.separaciones (venta_id) where venta_id is not null;
-- «¿Esta prenda está apartada?» y su historial.
create index if not exists separacion_items_variante_idx on retail.separacion_items (variante_id);

-- Compras de una prenda o de un modelo (historial del costo, proveedores de la prenda).
create index if not exists compra_items_variante_idx on retail.compra_items (variante_id) where variante_id is not null;
create index if not exists compra_items_producto_idx on retail.compra_items (producto_id) where producto_id is not null;

-- La meta de cada día de un rango, para varias tiendas a la vez (Comercial). Misma respuesta que llamar a `fn_parametros_caja`
-- (tienda, día) una vez por día: es esa función, en un solo viaje. El rango se topa a 62 días para que nadie la use de reporte.
create or replace function retail.fn_metas_de_los_dias(p_ubicacion_ids uuid[], p_desde date, p_hasta date)
returns table (ubicacion_id uuid, dia date, meta numeric)
language sql
stable
set search_path = retail, public, extensions
as $$
  select u.id, d::date, p.meta
  from unnest(p_ubicacion_ids) as u(id)
  cross join generate_series(p_desde, least(p_hasta, p_desde + 61), interval '1 day') as d
  cross join lateral retail.fn_parametros_caja(u.id, d::date) as p
  order by 1, 2;
$$;

comment on function retail.fn_metas_de_los_dias(uuid[], date, date) is
  'ADR-0622: la meta de cada día de un rango (máx. 62 días) para varias tiendas, en una llamada. Es fn_parametros_caja por cada (tienda, día): la misma regla y el mismo control de acceso.';

revoke all on function retail.fn_metas_de_los_dias(uuid[], date, date) from public, anon;
grant execute on function retail.fn_metas_de_los_dias(uuid[], date, date) to authenticated;
