-- ============================================================================
-- crear_producto_con_variantes · CUERPO SCHEMA-CALIFICADO PARA PRODUCCIÓN
-- Correr en cayla-DYNAMIC. Solo toca `retail`.
--
-- Por qué existe este archivo aparte de `supabase/migrations/0033_crear_
-- producto_variantes.sql`: 0033 es la versión LOCAL (nombres sin schema,
-- `set search_path = public`, que en LOCAL es donde vive todo el esquema de
-- retail). En PRODUCCIÓN `public` es el schema de CAYLA DYNAMIC (planilla
-- real) y retail vive en el schema `retail` — pegar 0033 tal cual ahí crearía
-- una función suelta `public.crear_producto_con_variantes` dentro del schema
-- de Dynamic, invisible para el frontend (que llama `retail.crear_producto_
-- con_variantes` porque el cliente Supabase está fijado a `db.schema =
-- "retail"`). Mismo patrón que `14_recibir_lote_produccion.sql`/ADR-0004.
--
-- QUÉ HACE
--   Da de alta un producto con su matriz talla × color completa en un solo
--   INSERT a `productos` + N INSERT a `variantes`, en vez de que "Recibir
--   mercadería" cree un `producto` nuevo por cada combinación (ver 0033).
--   Candado: solo Líder (`retail.es_lider()`), igual que
--   `retail.productos_insert_lider` / `retail.variantes_insert_lider`.
--   No toca `stock` ni `movimientos` — el producto nace con 0 unidades en
--   todas las sedes hasta que se reciba un lote de verdad.
--
-- CÓMO SE VERIFICA (correr a mano después de pegar)
--   select pg_get_functiondef('retail.crear_producto_con_variantes(text,text,jsonb,uuid,text,text,text)'::regprocedure);
--   -- debe mostrar el chequeo de retail.es_lider() y los inserts en
--   -- retail.productos / retail.variantes.
--
-- Idempotente: create or replace.
-- ============================================================================

create or replace function retail.crear_producto_con_variantes(
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
