-- ==================== Cargo especial (Monto manual en el POS) ====================
-- `registrar_venta` (0054) exige un `variante_id` real por línea: castea
-- `(v_item ->> 'variante_id')::uuid` sin excepción y `fn_aplicar_movimiento`
-- (0045) descuenta esa variante de `stock` en la sede de la caja. Un botón
-- "Monto manual" en Vender (producto dañado, cargo especial, ítem sin
-- etiqueta) necesita ENGANCHAR a una variante real — no hay forma de vender
-- sin una, y cambiar la RPC para aceptar variante_id nulo es un cambio de
-- esquema en el núcleo de ventas que Felipe decidió NO hacer (2026-09-12):
-- se prefiere una variante centinela sobre tocar `registrar_venta`.
--
-- IDs fijos (no gen_random_uuid()) a propósito: el frontend necesita conocer
-- este variante_id sin una consulta extra, y un id que se repite dígito a
-- dígito es reconocible a simple vista en cualquier panel de Supabase como
-- "esto es un centinela, no una prenda real" — nadie lo confunde con un
-- gen_random_uuid() de verdad.
--
-- `cantidad` en `stock` arranca en 999999 por sede: no es inventario real,
-- es solo el techo que evita que `fn_aplicar_movimiento` rechace la venta
-- por "stock insuficiente". Si alguna vez se acerca a agotarse —tomaría
-- cientos de miles de cargos manuales—, se repone con un `ajuste` normal,
-- igual que cualquier otro producto; no hace falta un caso especial para eso.
--
-- Aviso conocido y aceptado: al vivir en `productos`/`variantes` como
-- cualquier prenda, esta variante también aparece en selectores de otras
-- pantallas (Traslados, Producción, Inventario) que no filtran por esto.
-- El nombre es deliberadamente inconfundible ("Cargo especial (sin código)")
-- para que nadie la confunda con una prenda real; no mueve stock de verdad
-- en ningún otro módulo porque nadie la va a recibir, trasladar ni producir.

insert into productos (id, sku_padre, referencia, estado)
values ('11111111-1111-4111-8111-111111111111', 'CARGO-ESPECIAL', 'Cargo especial (sin código)', 'activa')
on conflict (id) do nothing;

insert into variantes (id, producto_id, sku, precio, costo, stock_minimo)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'CARGO-ESPECIAL-01',
  0,
  0,
  0
)
on conflict (id) do nothing;

insert into stock (variante_id, sede_id, cantidad)
select '22222222-2222-4222-8222-222222222222', id, 999999
from sedes
on conflict (variante_id, sede_id) do nothing;
