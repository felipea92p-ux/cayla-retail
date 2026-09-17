-- ============================================================================
-- 20260915170000_stock_minimo_en_alta_edicion.sql — CAYLA V2
--
-- `retail.productos.stock_minimo` existe desde
-- `20260915160000_productos_listado_filtros.sql` (Sesión B1: umbral de
-- "stock bajo" para /productos, sumado en todas las ubicaciones) pero
-- `catalogo_crear_producto`/`catalogo_actualizar_producto`
-- (`20260915150000_catalogo_alta_edicion.sql`, Sesión A1) se escribieron
-- antes de que esa columna existiera — el mantenedor de ficha no tenía
-- dónde escribirla. Sin esto, "stock bajo" en /productos se queda en 0
-- para siempre salvo que alguien lo cargue por SQL/Studio.
--
-- `p_stock_minimo` va al final con `default null` (mismo motivo que ya deja
-- escrito `20260915150000` sobre `p_categoria_id`/`p_descripcion`: una vez
-- que un parámetro tiene default, todos los que siguen también lo
-- necesitan). `drop function` antes de `create or replace`: agregar un
-- parámetro cambia la firma, y sin el `drop` Postgres crea un OVERLOAD
-- nuevo en vez de reemplazar la función — quedarían las dos versiones
-- coexistiendo, y PostgREST no sabría cuál llamar.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.catalogo_crear_producto(text, jsonb, uuid, text);

create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'Un producto necesita al menos una variante (talla y/o color) antes de guardarse.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  insert into productos (categoria_id, referencia, descripcion, stock_minimo)
  values (p_categoria_id, trim(p_referencia), nullif(trim(coalesce(p_descripcion, '')), ''), p_stock_minimo)
  returning id into v_producto_id;

  for v_variante in select * from jsonb_array_elements(p_variantes)
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      nullif(v_variante->>'talla', ''),
      trim(v_variante->>'sku'),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

  return v_producto_id;
end;
$$;

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer) is
  'Alta de producto+variantes para /productos/nuevo (V2). Sin security definer: corre con los permisos de quien llama, y productos_write_lider/variantes_write_lider (RLS) son el único candado de permiso. El trigger variantes_asignar_codigo (20260912235500) acuña codigo y codigos_barras solo — esta función no lo toca. p_stock_minimo: umbral de "stock bajo" en /productos (20260915160000), null = sin umbral.';

drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text);

create or replace function retail.catalogo_actualizar_producto(
  p_producto_id uuid,
  p_referencia text,
  p_estado text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null
) returns void
language plpgsql
set search_path = retail, public
as $$
declare
  v_variante jsonb;
  v_id uuid;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      -- Variante existente: solo precio, costo y activo cambian. Color,
      -- talla, sku y codigo son la identidad de la prenda — ver el
      -- encabezado de 20260915150000_catalogo_alta_edicion.sql.
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        nullif(v_variante->>'talla', ''),
        trim(v_variante->>'sku'),
        (v_variante->>'precio')::numeric,
        coalesce((v_variante->>'costo')::numeric, 0)
      );
    end if;
  end loop;
end;
$$;

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer) is
  'Edición de producto+variantes para /productos/[id]/editar (V2). Agrega variantes nuevas y actualiza precio/costo/activo de las existentes; nunca color_codigo/talla/sku/codigo de una variante ya creada. p_stock_minimo: umbral de "stock bajo" en /productos (20260915160000), null = sin umbral.';
