-- ADR-0362 · fase 2, actividades 3 a 8 (Felipe 2026-10-12): el comprobante de una orden de compra — el esquema.
--
-- EL PROBLEMA PRIMERO. Una orden de compra se pide por «categoría + marca»: la prenda todavía no existe (se crea cuando llega). Pero
-- una línea de comprobante exige `producto_id`, así que el papel de una orden no se puede guardar. Tampoco hay nada que una el
-- comprobante con su orden ni cada línea con la línea pedida: sin eso no se sabe cuánto de lo pedido ya llegó en papel, ni se puede
-- avisar «esto es de más» (decisión 43). Y el mismo papel (proveedor, serie y número) no se puede volver a registrar después de
-- anularlo, porque el único lo cuenta igual: «corregir = anular y registrar de nuevo» no funcionaba.
--
-- QUÉ HACE.
--   1. `compra_items`: `producto_id` puede ir vacío si la línea dice su `categoria_id` y `marca_id` (candado: o prenda, o categoría y
--      marca; y una variante siempre con su prenda). `orden_compra_item_id`: la línea pedida de la que sale (N a 1: un pedido puede
--      llegar en varios papeles, y una línea puede partirse en dos para cuadrar centavos). `precio_venta_sugerido` (actividad 7): el
--      precio al que se piensa vender, opcional; lo usará la prenda cuando se cree.
--   2. `compras.orden_compra_id`: la orden de la que sale el comprobante. `compras.huella_envio`: la huella de lo que mandó la
--      pantalla, para que un reintento con el mismo token y OTRO contenido no se tome por el mismo guardado (ADR-0362).
--   3. El papel es único solo entre los VIGENTES: anular y volver a registrar el mismo número se puede.
-- QUÉ NO HACE. Quién registra y cómo (la función del comprobante de una orden, 20261012211000) ni las lecturas que suponen una prenda
-- en cada línea (20261012210000).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, `alter table` e índices, SIN políticas (ADR-0195). Re-pegable.

set lock_timeout = '3s';

-- 1. La línea de un comprobante: una prenda, o «categoría + marca» (la de una orden).
alter table retail.compra_items alter column producto_id drop not null;
alter table retail.compra_items add column if not exists categoria_id uuid references retail.categorias (id);
alter table retail.compra_items add column if not exists marca_id uuid references retail.marcas (id);
alter table retail.compra_items add column if not exists orden_compra_item_id uuid references retail.orden_compra_items (id);
alter table retail.compra_items add column if not exists precio_venta_sugerido numeric(12, 2);
alter table retail.compra_items drop constraint if exists compra_items_prenda_o_categoria_marca;
alter table retail.compra_items add constraint compra_items_prenda_o_categoria_marca
  check (producto_id is not null or (categoria_id is not null and marca_id is not null));
alter table retail.compra_items drop constraint if exists compra_items_variante_con_prenda;
alter table retail.compra_items add constraint compra_items_variante_con_prenda
  check (variante_id is null or producto_id is not null);
alter table retail.compra_items drop constraint if exists compra_items_precio_venta_sugerido_check;
alter table retail.compra_items add constraint compra_items_precio_venta_sugerido_check
  check (precio_venta_sugerido is null or precio_venta_sugerido >= 0);
create index if not exists compra_items_orden_compra_item_idx on retail.compra_items (orden_compra_item_id)
  where orden_compra_item_id is not null;

comment on column retail.compra_items.categoria_id is
  'ADR-0362 (fase 2): la categoría de una línea SIN prenda (la de una orden de compra, pedida por «categoría + marca»). Con prenda, la categoría es la de la prenda.';
comment on column retail.compra_items.marca_id is
  'ADR-0362 (fase 2): la marca de una línea SIN prenda (la de una orden de compra). Con prenda, la marca es la de la prenda.';
comment on column retail.compra_items.orden_compra_item_id is
  'ADR-0362 (fase 2): la línea de la orden de compra de la que sale esta línea del comprobante. Varias líneas (de uno o más comprobantes) pueden salir de la misma línea pedida.';
comment on column retail.compra_items.precio_venta_sugerido is
  'ADR-0362 (fase 2, actividad 7): el precio de venta que se sugiere para lo comprado, opcional. No es el precio de la prenda: lo propone cuando la prenda se crea.';

-- 2. El comprobante y su orden.
alter table retail.compras add column if not exists orden_compra_id uuid references retail.ordenes_compra (id);
alter table retail.compras add column if not exists huella_envio text;
create index if not exists compras_orden_compra_idx on retail.compras (orden_compra_id) where orden_compra_id is not null;

comment on column retail.compras.orden_compra_id is
  'ADR-0362 (fase 2): la orden de compra de la que sale este comprobante. Una orden puede tener varios (entregas parciales).';
comment on column retail.compras.huella_envio is
  'ADR-0362 (fase 2): la huella de lo que mandó la pantalla al registrar. El mismo token con otra huella es otro pedido, no un reintento.';

-- 3. El papel es único solo entre los vigentes (anular y registrar de nuevo el mismo número se puede).
alter table retail.compras drop constraint if exists compras_proveedor_id_serie_numero_key;
create unique index if not exists compras_papel_vigente_unico on retail.compras (proveedor_id, serie, numero) where estado = 'vigente';

reset lock_timeout;
