-- ============================================================================
-- activacion-piso-almacen-produccion.sql — NO es parte de la cadena de
-- migraciones. YA SE APLICÓ en producción el 2026-09-14; este archivo existe
-- para que el repo cuente lo que producción tiene, no para volver a correrlo.
--
-- A propósito el nombre no sigue el patrón <timestamp>_nombre.sql: así
-- `supabase db reset` (local) lo ignora, igual que a `datos-reales-produccion.sql`.
-- En local no hace falta: `seed.sql` ya crea Piso de venta / Almacén de tienda
-- para cada tienda y reparte el stock con `mover_interno`.
--
-- QUÉ HIZO (producción, proyecto de Dynamic vovjyyiafkxteijimpuy, schema `retail`):
--   1) Creó las dos sububicaciones que el motor de inventario entiende
--      (20260914230000_inventario_piso_almacen.sql) en cada ubicación de tipo
--      `tienda`: «Piso de venta» (piso_venta) y «Almacén de tienda» (almacen_tienda).
--      Tienda AQP y Tienda TRU; Taller no separa piso de almacén.
--   2) Pasó TODO el stock existente de las tiendas (que vivía sin sububicación)
--      al Almacén de tienda, mediante un `traslado` real por fila de stock —
--      nunca editando `stock` a mano. Honesto con el negocio: mercadería
--      «recién separada», falta reponer piso; no una foto inventada de qué ya
--      estaba exhibido. Resultado: 288 unidades en AQP y 423 en TRU movidas.
--   3) Dejó afuera la variante centinela «Cargo especial» (999.999 unidades
--      ficticias del POS): sigue sin sububicación, como debe.
--
-- Rastro en el ledger: `motivo = 'activacion_piso_almacen'`, `usuario_id` NULL
-- (movimiento de sistema, sin persona), `ubicacion_id = ubicacion_destino_id`,
-- `sububicacion_id` NULL → `sububicacion_destino_id` = Almacén de tienda. La
-- pantalla de Movimientos lo muestra como «Activación piso/almacén (Sistema)».
--
-- Por qué recién se versiona (2026-09-15): se corrió a mano, con `execute_sql`,
-- para destrabar producción el mismo día que se aplicó la migración de
-- inventario, y quedó solo en la conversación. Felipe pidió que esté en el repo.
--
-- SE ROMPE SI: se corre dos veces — el paso 1 es idempotente (`on conflict do
-- nothing`), pero el paso 2 volvería a mover cualquier stock que hoy esté sin
-- sububicación (por ejemplo, el de una tienda nueva creada después). Antes de
-- reutilizarlo para una tienda nueva, acotar el `where` a esa ubicación.
-- ============================================================================

set search_path = retail, public, extensions;

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select u.id, 'Piso de venta', 'piso_venta'
from retail.ubicaciones u
where u.tipo = 'tienda'
on conflict (ubicacion_id, nombre) do nothing;

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select u.id, 'Almacén de tienda', 'almacen_tienda'
from retail.ubicaciones u
where u.tipo = 'tienda'
on conflict (ubicacion_id, nombre) do nothing;

-- Todo el stock real existente (sin sububicación) pasa a "Almacén de
-- tienda" — honesto: recién llegado, falta reponer piso; no una foto
-- inventada de qué ya estaba exhibido. Vía movimiento real (traslado),
-- nunca stock editado a mano.
do $$
declare
  r record;
  v_almacen_id uuid;
  v_mov_id uuid;
  v_movidos integer := 0;
begin
  for r in
    select s.variante_id, s.ubicacion_id, s.cantidad
    from retail.stock s
    join retail.ubicaciones u on u.id = s.ubicacion_id and u.tipo = 'tienda'
    where s.sububicacion_id is null
      and s.variante_id <> '22222222-2222-4222-8222-222222222222'
      and s.cantidad > 0
  loop
    select id into v_almacen_id from retail.sububicaciones
      where ubicacion_id = r.ubicacion_id and tipo = 'almacen_tienda';

    insert into retail.movimientos (
      variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
      tipo, cantidad, motivo
    )
      values (
        r.variante_id, r.ubicacion_id, null, r.ubicacion_id, v_almacen_id,
        'traslado', r.cantidad, 'activacion_piso_almacen'
      )
      returning id into v_mov_id;
    perform retail.fn_aplicar_movimiento(v_mov_id);
    v_movidos := v_movidos + 1;
  end loop;
  raise notice 'Filas movidas a almacén de tienda: %', v_movidos;
end $$;
