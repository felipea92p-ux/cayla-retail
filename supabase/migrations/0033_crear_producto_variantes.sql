-- ============================================================================
-- Alta de catálogo con matriz talla × color en un solo paso.
--
-- Hoy "Recibir mercadería" (`recibir_lote`) es el único camino para dar de
-- alta un producto nuevo, y crea un `producto` distinto por CADA ítem que se
-- agrega con "+ Agregar prenda nueva" — pedir la misma referencia varias
-- veces (una por talla/color) deja varios productos duplicados en vez de un
-- solo modelo con N variantes. Para un modelo con, por ejemplo, 4 tallas × 3
-- colores, hoy habría que crear 12 "productos" en vez de 1 producto con 12
-- variantes.
--
-- `crear_producto_con_variantes` es el camino correcto para dar de alta un
-- modelo completo de una vez. Separado a propósito de recibir mercadería
-- (principio 4 del CLAUDE.md): alta de catálogo y entrada de stock son dos
-- cosas distintas. El producto nace en el catálogo con 0 unidades en todas
-- las sedes — el stock llega después, cuando de verdad se recibe un lote.
--
-- Versión LOCAL (nombres sin schema, `set search_path = public`) — para
-- `npx supabase db reset` / pgTAP. La versión schema-calificada para pegar en
-- el SQL Editor de producción (proyecto Dynamic, schema `retail`) vive en
-- `supabase/unificacion/16_crear_producto_variantes.sql` — NO este archivo
-- tal cual (ver docs/ARQUITECTURA.md §7: en producción `public` es el schema
-- de Dynamic, no el de retail).
-- ============================================================================

create or replace function crear_producto_con_variantes(
  p_sku_padre text,
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_genero text default null,
  p_marca text default null,
  p_temporada text default null
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

  insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
    values (
      trim(p_sku_padre), trim(p_referencia), p_categoria_id,
      nullif(trim(p_genero), ''), nullif(trim(p_marca), ''), nullif(trim(p_temporada), '')
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
