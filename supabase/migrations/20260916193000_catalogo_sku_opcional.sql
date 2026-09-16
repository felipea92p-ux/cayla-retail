-- ============================================================================
-- 20260916193000_catalogo_sku_opcional.sql — CAYLA V2 · módulo 02 (Loro)
--
-- EL PROBLEMA EN TIENDA
--   El censo carga las prendas reales por /productos/nuevo, que usa
--   `crear_producto_con_variantes` (20260915221633). Esa función NO pide SKU a
--   propósito: el identificador vivo es `variantes.codigo` (el que va impreso
--   en la etiqueta y lee la pistola), y lo pone solo el disparador
--   `variantes_asignar_codigo`. Pero la ficha de edición
--   (/productos/[id]/editar → `catalogo_actualizar_producto`) seguía exigiendo
--   un SKU en cada variante, así que un producto recién cargado en el censo no
--   se podía volver a guardar: ni para corregir el precio, ni para subirle la
--   foto, ni para moverlo de categoría o descontinuarlo. La encargada de sede
--   quedaba con la prenda congelada tal como la escribió la primera vez.
--   `catalogo_crear_producto` tenía la misma regla y se corrige igual, para que
--   las dos puertas de alta digan lo mismo sobre el SKU.
--
-- LA REGLA NUEVA
--   El SKU es opcional. Si llega vacío (o solo espacios) se guarda NULL, nunca
--   ''. No es cosmético: `variantes.sku` tiene índice único
--   (`variantes_sku_key`) y en Postgres dos '' chocan pero dos NULL no. Guardar
--   '' haría que la SEGUNDA talla sin SKU del mismo producto reventara con
--   "duplicate key" en medio del guardado.
--
-- LO QUE NO CAMBIA
--   Misma firma que 20260915224500 (ADR-0026: una sola firma por función), así
--   que `create or replace` conserva dueño, grants y comentario. Una variante
--   que ya existe sigue cambiando solo precio, costo y activo: color, talla, sku
--   y codigo son la identidad de la prenda y ya están impresos en una etiqueta
--   (encabezado de 20260915150001_catalogo_alta_edicion.sql). Fotos, estado y
--   el resto del cuerpo quedan idénticos — verificado contra
--   pg_get_functiondef de producción el 2026-09-16 (mismo código; producción
--   solo difiere en comentarios internos).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. `catalogo_crear_producto` — el SKU deja de ser obligatorio
-- ---------------------------------------------------------------------------
create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default '[]'::jsonb
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
  v_fila record;
  v_ya_principal boolean := false;
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

  insert into productos (categoria_id, referencia, descripcion, stock_minimo, temporada, permitir_venta_sin_stock)
  values (
    p_categoria_id,
    trim(p_referencia),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    p_stock_minimo,
    nullif(trim(coalesce(p_temporada, '')), ''),
    coalesce(p_permitir_venta_sin_stock, false)
  )
  returning id into v_producto_id;

  for v_variante in select * from jsonb_array_elements(p_variantes)
  loop
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    -- SKU vacío → NULL, nunca '': con el índice único de sku, dos '' del
    -- mismo producto chocarían; dos NULL no. La etiqueta usa `codigo`, que
    -- pone el disparador variantes_asignar_codigo.
    insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      nullif(v_variante->>'talla', ''),
      nullif(trim(v_variante->>'sku'), ''),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

  -- Fotos: se insertan en el orden del array (el cliente ya las reordenó
  -- localmente); a lo más la primera marcada `es_principal` gana, y si
  -- ninguna llegó marcada, la primera de la lista queda principal.
  for v_fila in
    select f.value as foto, (f.ordinality - 1)::integer as orden
    from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) with ordinality as f(value, ordinality)
  loop
    if coalesce(nullif(trim(v_fila.foto->>'url'), ''), '') = '' then
      raise exception 'Una foto llegó sin URL.';
    end if;
    insert into producto_fotos (producto_id, url, orden, es_principal)
    values (
      v_producto_id,
      v_fila.foto->>'url',
      v_fila.orden,
      (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal)
    );
    if coalesce((v_fila.foto->>'es_principal')::boolean, false) then
      v_ya_principal := true;
    end if;
  end loop;

  if not v_ya_principal then
    update producto_fotos set es_principal = true
      where id = (select id from producto_fotos where producto_id = v_producto_id order by orden limit 1);
  end if;

  return v_producto_id;
end;
$$;

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb) is
  'Alta de producto+variantes+fotos (V2). Sin security definer: corre con los permisos de quien llama; productos_write_lider/variantes_write_lider/producto_fotos_write_lider (RLS) son el único candado de permiso. p_stock_minimo: umbral de "stock bajo" (20260915160000). p_temporada/p_permitir_venta_sin_stock: 20260915224500. p_fotos: reemplazo completo en el orden del array, [{url, es_principal?}]. sku opcional desde 20260916193000: vacío se guarda NULL (el identificador de etiqueta es variantes.codigo).';

-- ---------------------------------------------------------------------------
-- 2. `catalogo_actualizar_producto` — el SKU deja de ser obligatorio
-- ---------------------------------------------------------------------------
create or replace function retail.catalogo_actualizar_producto(
  p_producto_id uuid,
  p_referencia text,
  p_estado text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  -- null = no tocar la galería (llamada que no trae fotos); [] = vaciarla.
  p_fotos jsonb default null
) returns void
language plpgsql
set search_path = retail, public
as $$
declare
  v_variante jsonb;
  v_id uuid;
  v_fila record;
  v_foto_id uuid;
  v_ids_mantener uuid[];
  v_ya_principal boolean := false;
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
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false)
    where id = p_producto_id;

  if not found then
    raise exception 'El producto % no existe.', p_producto_id;
  end if;

  for v_variante in select * from jsonb_array_elements(coalesce(p_variantes, '[]'::jsonb))
  loop
    -- Ya no se exige SKU: las prendas del censo nacen sin él
    -- (crear_producto_con_variantes) y exigirlo acá las dejaba sin poder
    -- editarse nunca más. Ver cabecera.
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_id := nullif(v_variante->>'id', '')::uuid;

    if v_id is not null then
      -- Variante existente: solo precio, costo y activo cambian. Color,
      -- talla, sku y codigo son la identidad de la prenda — ver el
      -- encabezado de 20260915150001_catalogo_alta_edicion.sql.
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      -- Variante nueva: SKU vacío → NULL, nunca '' (índice único de sku:
      -- dos '' chocan, dos NULL no).
      insert into variantes (producto_id, color_codigo, talla, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        nullif(v_variante->>'talla', ''),
        nullif(trim(v_variante->>'sku'), ''),
        (v_variante->>'precio')::numeric,
        coalesce((v_variante->>'costo')::numeric, 0)
      );
    end if;
  end loop;

  if p_fotos is not null then
    v_ids_mantener := array(
      select (f->>'id')::uuid
      from jsonb_array_elements(p_fotos) f
      where f->>'id' is not null
    );

    delete from producto_fotos
      where producto_id = p_producto_id
        and not (id = any(v_ids_mantener));

    -- Todas a false antes de volver a marcar como mucho una — el índice
    -- único parcial `producto_fotos_principal_unico` no es diferible, y
    -- actualizar fila por fila sin este paso deja un instante con dos `true`
    -- a la vez si la principal nueva no es la misma fila que la vieja.
    update producto_fotos set es_principal = false
      where producto_id = p_producto_id;

    for v_fila in
      select f.value as foto, (f.ordinality - 1)::integer as orden
      from jsonb_array_elements(p_fotos) with ordinality as f(value, ordinality)
    loop
      if coalesce(nullif(trim(v_fila.foto->>'url'), ''), '') = '' then
        raise exception 'Una foto llegó sin URL.';
      end if;
      v_foto_id := nullif(v_fila.foto->>'id', '')::uuid;

      if v_foto_id is not null then
        update producto_fotos
          set orden = v_fila.orden,
              es_principal = (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal)
          where id = v_foto_id and producto_id = p_producto_id;
      else
        insert into producto_fotos (producto_id, url, orden, es_principal)
        values (
          p_producto_id,
          v_fila.foto->>'url',
          v_fila.orden,
          (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal)
        );
      end if;

      if coalesce((v_fila.foto->>'es_principal')::boolean, false) then
        v_ya_principal := true;
      end if;
    end loop;

    if not v_ya_principal then
      update producto_fotos set es_principal = true
        where id = (select id from producto_fotos where producto_id = p_producto_id order by orden limit 1);
    end if;
  end if;
end;
$$;

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb) is
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo (id presente = fila existente, ausente = nueva), en el orden del array. p_temporada/p_permitir_venta_sin_stock: 20260915224500. sku opcional desde 20260916193000: una variante nueva sin sku se guarda con NULL; una existente nunca cambia su sku.';
