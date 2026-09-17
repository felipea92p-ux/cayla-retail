-- ==================== Cargo especial (Monto manual en el POS) — V2 ====================
-- Reescrita al reconciliar Vender con el corte V1→V2 (2026-09-12). La versión V1
-- (numerada 0061, ya no existe) escribía contra `productos.sku_padre`/`estado='activa'`
-- y `variantes.stock_minimo`, columnas que no existen en el esquema V2
-- (0002_esquema.sql). Misma idea, reescrita contra las tablas reales de hoy.
--
-- Por qué existe: `registrar_venta` (0011_venta_con_comprobante.sql) exige un
-- variante_id real por línea — no hay forma de vender "monto manual" sin una
-- variante real detrás. IDs fijos (no gen_random_uuid()) para que el frontend
-- los conozca sin una consulta extra, y para que cualquiera que los vea en un
-- panel de Supabase reconozca a simple vista que es un centinela.
--
-- La cantidad de `stock` se siembra por MOVIMIENTO de entrada (fn_aplicar_movimiento),
-- nunca escribiendo `stock` a mano — esa fue exactamente la causa raíz del bug
-- encontrado el 2026-09-12 en la primera versión de esta migración (recalcular_stock
-- la dejaba en negativo porque no sabía nada de un `insert into stock` directo).
--
-- Aviso conocido y aceptado: al vivir en `productos`/`variantes` como cualquier
-- prenda, esta variante también puede aparecer en selectores de otras pantallas
-- (Traslados, Producción, Inventario) que no filtran por esto — de ahí `activo =
-- false`, que aunque hoy ningún query lo usa como filtro, documenta la intención
-- para quien lo encuentre después. El nombre es deliberadamente inconfundible.

insert into retail.productos (id, referencia, descripcion, estado)
values ('11111111-1111-4111-8111-111111111111', 'Cargo especial (sin código)', 'Variante centinela para Monto manual en el POS — no es una prenda real.', 'activo')
on conflict (id) do nothing;

insert into retail.variantes (id, producto_id, sku, precio, costo, activo)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'CARGO-ESPECIAL-01',
  0,
  0,
  false
)
on conflict (id) do nothing;

do $$
declare
  v_ubicacion record;
  v_movimiento_id uuid;
begin
  for v_ubicacion in select id from retail.ubicaciones loop
    if not exists (
      select 1 from retail.movimientos
      where variante_id = '22222222-2222-4222-8222-222222222222'
        and ubicacion_id = v_ubicacion.id
        and motivo = 'siembra_cargo_especial'
    ) then
      insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo)
        values ('22222222-2222-4222-8222-222222222222', v_ubicacion.id, 'entrada', 999999, 'siembra_cargo_especial')
        returning id into v_movimiento_id;
      perform retail.fn_aplicar_movimiento(v_movimiento_id);
    end if;
  end loop;
end $$;
