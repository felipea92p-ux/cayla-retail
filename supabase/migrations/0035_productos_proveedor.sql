-- ============================================================================
-- Proveedor "habitual" del producto — dato de catálogo, opcional.
--
-- Dos preguntas distintas que parecen una sola:
--   1. "¿De qué proveedor es normalmente este modelo?" — dato de catálogo,
--      cambia poco. Es lo que agrega esta migración.
--   2. "¿Quién trajo ESTE lote puntual?" — dato de la recepción, ya vive en
--      `lotes.proveedor_id` desde la Fase 3 (0008) y no cambia con esto.
--
-- Mismo patrón que Shopify (vendor como etiqueta del producto) / Odoo
-- (proveedor preferido en el producto, proveedor real por orden de compra):
-- el proveedor del producto es una referencia editable, no un candado — CAYLA
-- compra a ~292 proveedores distintos y un modelo casi siempre viene de uno
-- solo, pero no es una regla dura que el esquema deba forzar.
--
-- Versión LOCAL (nombres sin schema) — la schema-calificada para producción
-- vive en `supabase/unificacion/18_productos_proveedor.sql`.
-- ============================================================================

alter table productos add column if not exists proveedor_id uuid references proveedores (id);

create or replace function crear_producto_con_variantes(
  p_sku_padre text,
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_genero text default null,
  p_marca text default null,
  p_temporada text default null,
  p_proveedor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto_id uuid;
  v_item jsonb;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';
  end if;
  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta la referencia del producto';
  end if;
  if coalesce(trim(p_sku_padre), '') = '' then
    raise exception 'Falta el SKU del producto';
  end if;
  if p_variantes is null or jsonb_array_length(p_variantes) = 0 then
    raise exception 'El producto necesita al menos una talla/color';
  end if;

  insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada, proveedor_id)
    values (
      trim(p_sku_padre), trim(p_referencia), p_categoria_id,
      nullif(trim(p_genero), ''), nullif(trim(p_marca), ''), nullif(trim(p_temporada), ''), p_proveedor_id
    )
    returning id into v_producto_id;

  for v_item in select * from jsonb_array_elements(p_variantes) loop
    if coalesce(v_item ->> 'sku', '') = '' then
      raise exception 'Cada variante necesita un SKU';
    end if;
    insert into variantes (producto_id, sku, talla, color, costo, precio, precio_oferta, stock_minimo)
      values (
        v_producto_id,
        trim(v_item ->> 'sku'),
        nullif(trim(v_item ->> 'talla'), ''),
        nullif(trim(v_item ->> 'color'), ''),
        coalesce((v_item ->> 'costo')::numeric, 0),
        coalesce((v_item ->> 'precio')::numeric, 0),
        case when nullif(v_item ->> 'precioOferta', '') is not null then (v_item ->> 'precioOferta')::numeric else null end,
        coalesce((v_item ->> 'stockMinimo')::integer, 0)
      );
  end loop;

  return v_producto_id;
end;
$$;
