-- ============================================================================
-- productos.proveedor_id + crear_producto_con_variantes · CUERPO
-- SCHEMA-CALIFICADO PARA PRODUCCIÓN
-- Correr en cayla-DYNAMIC. Solo toca `retail`.
--
-- Por qué existe este archivo aparte de `supabase/migrations/0035_productos_
-- proveedor.sql`: 0035 es la versión LOCAL (nombres sin schema, para
-- `npx supabase db reset`). En PRODUCCIÓN `public` es el schema de Dynamic —
-- pegar 0035 tal cual crearía una función suelta en el schema equivocado, no
-- tocaría `retail.crear_producto_con_variantes` (la que llama el frontend).
-- Mismo patrón que `16_crear_producto_variantes.sql`.
--
-- IMPORTANTE — orden de aplicación: si `16_crear_producto_variantes.sql`
-- TODAVÍA no se pegó en producción, no hace falta pegar los dos por
-- separado — este archivo 18 ya incluye la función completa con el parámetro
-- nuevo y reemplaza lo que 16 hubiera creado. Si 16 YA se pegó, este archivo
-- lo actualiza sin problema (`create or replace`, misma firma con un
-- parámetro adicional al final no genera una función fantasma como pasó en
-- ADR-0004 — ahí el problema fue agregar un parámetro AL MEDIO/reordenar;
-- acá se agrega al final con default, la firma vieja de 7 argumentos posicionales
-- sigue resolviendo igual).
--
-- QUÉ HACE
--   1. `retail.productos.proveedor_id` (nullable, FK a `retail.proveedores`):
--      de qué proveedor viene habitualmente este modelo. Editable, no un
--      candado — el proveedor REAL de cada entrega sigue viviendo en
--      `retail.lotes.proveedor_id` (Fase 3, ya en producción), sin cambios.
--   2. `retail.crear_producto_con_variantes` acepta `p_proveedor_id` opcional
--      y lo guarda al crear el producto.
--
-- CÓMO SE VERIFICA (correr a mano después de pegar)
--   select column_name from information_schema.columns
--     where table_schema='retail' and table_name='productos' and column_name='proveedor_id';
--   select pg_get_functiondef('retail.crear_producto_con_variantes(text,text,jsonb,uuid,text,text,text,uuid)'::regprocedure);
--
-- Idempotente: create or replace / add column if not exists.
-- ============================================================================

alter table retail.productos add column if not exists proveedor_id uuid references retail.proveedores (id);

create or replace function retail.crear_producto_con_variantes(
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
set search_path to 'retail', 'public'
as $$
declare
  v_producto_id uuid;
  v_item jsonb;
begin
  if not retail.es_lider() then
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
