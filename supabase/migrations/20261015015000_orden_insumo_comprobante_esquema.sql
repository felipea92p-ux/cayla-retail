-- ============================================================================
-- 20261015015000_orden_insumo_comprobante_esquema.sql — CAYLA V2 · ADR-0362, fase 7 parte 2, actividad 1 (el comprobante de la orden de
-- insumos del Taller). Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-ordenes-de-insumos.md (punto 2). Las funciones van en
-- 20261015020000_orden_insumo_comprobante_funciones.sql.
--
-- EL PROBLEMA PRIMERO. La orden de insumos (fase 7 parte 1) se crea, se edita y se anula, pero el papel del proveedor no tenía dónde
-- quedar ligado a ella: el comprobante del Taller (`comprobantes_produccion`) existía suelto, lo registraba solo el líder (ADR-0126) y no
-- conocía «sin comprobante». Quien compra para el Taller con el módulo «Órdenes de insumos» (decisión 47) no podía cerrar su compra.
--
-- QUÉ HACE (solo el esquema):
--   1. `comprobantes_produccion.orden_insumo_id`: el comprobante de una orden de insumos sabe de qué orden es (null = el comprobante
--      suelto de siempre, que sigue igual).
--   2. `comprobantes_produccion_items.orden_insumo_item_id`: cada línea, de qué línea de la orden sale (null = algo que no estaba en la
--      orden y se acepta, decisión 43). Las líneas de un comprobante del Taller no se tocan nunca (`comprobantes_produccion_items_inmutable`),
--      así que una orden que tuvo papel —aunque se haya anulado— ya no se edita (editar borra y vuelve a crear sus líneas): el candado vive
--      en `editar_orden_insumo` (20261015020000). Esta referencia lo respalda: no deja borrar una línea con papel.
--   3. El mismo papel (proveedor, serie y número) es único SOLO entre los vigentes, como en tiendas (`compras_papel_vigente_unico`): un
--      papel anulado se puede volver a registrar. Antes el Taller contaba también los anulados, y corregir un papel (anularlo y registrarlo
--      bien) era imposible. Vale también para el comprobante suelto del líder.
--   4. `comprobantes_produccion.tipo` acepta `sin_comprobante` (decisión 50). Su número interno lo pone la base con la MISMA secuencia de
--      la empresa que las compras de tienda (`compras_sin_comprobante_seq`): un SC-000001 es uno solo en toda la empresa. Sin IGV: el
--      candado `comprobantes_produccion_igv_solo_factura` ya lo exige. Impuestos no lo cuenta: `fn_impuestos_registro_compras` solo toma
--      factura y boleta del Taller.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, antes de 20261015020000. Cambia dos tablas en uso sin políticas ni
-- `drop trigger` (ADR-0195) y sin `select … into` dentro de textos entre comillas (ADR-0288). Re-ejecutable: se puede pegar dos veces.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.comprobantes_produccion
  add column if not exists orden_insumo_id uuid references retail.ordenes_insumo (id);
create index if not exists comprobantes_produccion_orden_insumo_idx
  on retail.comprobantes_produccion (orden_insumo_id) where orden_insumo_id is not null;
comment on column retail.comprobantes_produccion.orden_insumo_id is
  'La orden de insumos de este comprobante (ADR-0362, fase 7 parte 2). Null: el comprobante suelto del Taller, que registra el líder.';

alter table retail.comprobantes_produccion_items
  add column if not exists orden_insumo_item_id uuid references retail.orden_insumo_items (id);
create index if not exists comprobantes_produccion_items_orden_insumo_item_idx
  on retail.comprobantes_produccion_items (orden_insumo_item_id) where orden_insumo_item_id is not null;
comment on column retail.comprobantes_produccion_items.orden_insumo_item_id is
  'La línea de la orden de insumos de la que sale esta línea. Null: algo que no estaba en la orden (decisión 43) o un comprobante suelto.';

alter table retail.comprobantes_produccion drop constraint if exists comprobantes_produccion_serie_numero_unico;
create unique index if not exists comprobantes_produccion_papel_vigente_unico
  on retail.comprobantes_produccion (proveedor_id, serie, numero) where estado = 'vigente';

alter table retail.comprobantes_produccion drop constraint if exists comprobantes_produccion_tipo_check;
alter table retail.comprobantes_produccion add constraint comprobantes_produccion_tipo_check
  check (tipo = any (array['factura', 'boleta', 'nota_venta', 'sin_comprobante']));

reset lock_timeout;

-- Comprobación: si algo no quedó, el pegado falla y no se aplica nada.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'comprobantes_produccion' and column_name = 'orden_insumo_id') then
    raise exception 'falta comprobantes_produccion.orden_insumo_id';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'comprobantes_produccion_items' and column_name = 'orden_insumo_item_id') then
    raise exception 'falta comprobantes_produccion_items.orden_insumo_item_id';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'comprobantes_produccion_papel_vigente_unico')
     or exists (select 1 from pg_constraint where conname = 'comprobantes_produccion_serie_numero_unico') then
    raise exception 'el papel del Taller tiene que ser único solo entre los vigentes';
  end if;
  if position('sin_comprobante' in (select pg_get_constraintdef(c.oid) from pg_constraint c
                                      where c.conname = 'comprobantes_produccion_tipo_check')) = 0 then
    raise exception 'comprobantes_produccion_tipo_check no acepta sin_comprobante';
  end if;
end;
$$;
