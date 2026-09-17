-- ============================================================================
-- 20260917100600 — Conecta tejido/patrón/talla_id en las 3 RPC de alta/edición
--
-- CORRECCIÓN SOBRE EL PRIMER INTENTO DE ESTA MISMA MIGRACIÓN: la primera
-- versión partió de la firma de catalogo_crear_producto/actualizar
-- ORIGINAL (20260915150001), sin ver que 20260915170000 (stock_minimo) y
-- 20260915224500 (temporada/permitir_venta_sin_stock/fotos) ya la habían
-- extendido dos veces más — un CREATE OR REPLACE con esa firma vieja
-- habría BORRADO esos tres campos reales que ProductoForm.tsx ya manda hoy.
-- Se detectó leyendo ProductoForm.tsx antes de tocar la UI, no en
-- producción — pero el error real fue no revisar el historial completo de
-- la función antes de reemplazarla (causa raíz: grep de "catalogo_crear_
-- producto" en supabase/migrations/, no confiar en la primera coincidencia).
--
-- Hoy hay DOS caminos reales de alta que no se tocan entre sí:
--   · crear_producto_con_variantes — el real, el que usa /productos/nuevo
--     (NuevoProductoForm.tsx), security definer, exige Líder, matriz
--     talla×color completa.
--   · catalogo_crear_producto / catalogo_actualizar_producto — usados por
--     ProductoForm.tsx (/productos/[id]/editar), sin security definer,
--     RLS hace el candado.
--
-- VALIDACIÓN POR CATEGORÍA (pedido de Felipe, 20260917100400): un
-- tejido/patrón/talla solo se acepta si existe una fila en
-- categoria_tejidos/categoria_patrones/categoria_tallas para la categoría
-- del producto. Sin fila = la categoría no lo ofrece = error claro, no un
-- silencio que deja el dato mal puesto.
-- ============================================================================

drop function if exists retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb);

create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default '[]'::jsonb,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
) returns uuid
language plpgsql
set search_path = retail, public
as $$
declare
  v_producto_id uuid;
  v_variante jsonb;
  v_fila record;
  v_ya_principal boolean := false;
  v_talla_id uuid;
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
  if p_tejido_id is not null and not exists (
    select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id
  ) then
    raise exception 'Ese tejido no está habilitado para la categoría elegida.';
  end if;
  if p_patron_id is not null and not exists (
    select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id
  ) then
    raise exception 'Ese patrón no está habilitado para la categoría elegida.';
  end if;

  insert into productos (categoria_id, referencia, descripcion, stock_minimo, temporada, permitir_venta_sin_stock, tejido_id, patron_id)
  values (
    p_categoria_id,
    trim(p_referencia),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    p_stock_minimo,
    nullif(trim(coalesce(p_temporada, '')), ''),
    coalesce(p_permitir_venta_sin_stock, false),
    p_tejido_id,
    p_patron_id
  )
  returning id into v_producto_id;

  for v_variante in select * from jsonb_array_elements(p_variantes)
  loop
    if coalesce(nullif(trim(v_variante->>'sku'), ''), '') = '' then
      raise exception 'Cada variante necesita un SKU.';
    end if;
    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;

    v_talla_id := nullif(v_variante->>'talla_id', '')::uuid;
    if v_talla_id is not null and not exists (
      select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id
    ) then
      raise exception 'Esa talla no está habilitada para la categoría elegida.';
    end if;

    insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
    values (
      v_producto_id,
      nullif(v_variante->>'color_codigo', ''),
      v_talla_id,
      trim(v_variante->>'sku'),
      (v_variante->>'precio')::numeric,
      coalesce((v_variante->>'costo')::numeric, 0)
    );
  end loop;

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

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'Alta de producto+variantes+fotos para /productos/nuevo vía ProductoForm.tsx (V2). p_tejido_id/p_patron_id: 20260917100100, validados contra categoria_tejidos/categoria_patrones. p_variantes[].talla_id reemplaza talla (texto libre) desde 20260917100500.';

drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb);

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
  p_fotos jsonb default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
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
  v_talla_id uuid;
begin
  if p_referencia is null or trim(p_referencia) = '' then
    raise exception 'Falta la referencia del producto.';
  end if;
  if p_stock_minimo is not null and p_stock_minimo < 0 then
    raise exception 'El stock mínimo no puede ser negativo.';
  end if;
  if p_tejido_id is not null and not exists (
    select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id
  ) then
    raise exception 'Ese tejido no está habilitado para la categoría elegida.';
  end if;
  if p_patron_id is not null and not exists (
    select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id
  ) then
    raise exception 'Ese patrón no está habilitado para la categoría elegida.';
  end if;

  update productos
    set categoria_id = p_categoria_id,
        referencia = trim(p_referencia),
        descripcion = nullif(trim(coalesce(p_descripcion, '')), ''),
        estado = p_estado,
        stock_minimo = p_stock_minimo,
        temporada = nullif(trim(coalesce(p_temporada, '')), ''),
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        tejido_id = p_tejido_id,
        patron_id = p_patron_id
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
      update variantes
        set precio = (v_variante->>'precio')::numeric,
            costo = coalesce((v_variante->>'costo')::numeric, 0),
            activo = coalesce((v_variante->>'activo')::boolean, true)
        where id = v_id and producto_id = p_producto_id;
    else
      v_talla_id := nullif(v_variante->>'talla_id', '')::uuid;
      if v_talla_id is not null and not exists (
        select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id
      ) then
        raise exception 'Esa talla no está habilitada para la categoría elegida.';
      end if;

      insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
      values (
        p_producto_id,
        nullif(v_variante->>'color_codigo', ''),
        v_talla_id,
        trim(v_variante->>'sku'),
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

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid) is
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). p_tejido_id/p_patron_id: 20260917100100. p_variantes[].talla_id reemplaza talla desde 20260917100500.';

-- ---------- crear_producto_con_variantes: el camino real de /productos/nuevo ----------
create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto_id uuid;
  v_item jsonb;
  v_talla_id uuid;
  v_color text;
  v_precio numeric;
  v_costo numeric;
  v_clave text;
  v_claves text[] := '{}';
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede dar de alta un producto nuevo';
  end if;

  if coalesce(trim(p_referencia), '') = '' then
    raise exception 'Falta la referencia del producto';
  end if;
  if not exists (select 1 from categorias where id = p_categoria_id and activo) then
    raise exception 'Elige una categoría activa del catálogo';
  end if;
  if p_variantes is null or jsonb_array_length(p_variantes) = 0 then
    raise exception 'El producto necesita al menos una variante (talla y/o color)';
  end if;

  if p_tejido_id is not null then
    if not exists (select 1 from tejidos where id = p_tejido_id and activo) then
      raise exception 'Uno de los tejidos elegidos ya no está activo en el vocabulario';
    end if;
    if not exists (select 1 from categoria_tejidos where categoria_id = p_categoria_id and tejido_id = p_tejido_id) then
      raise exception 'Ese tejido no está habilitado para la categoría elegida';
    end if;
  end if;
  if p_patron_id is not null then
    if not exists (select 1 from patrones where id = p_patron_id and activo) then
      raise exception 'Uno de los patrones elegidos ya no está activo en el vocabulario';
    end if;
    if not exists (select 1 from categoria_patrones where categoria_id = p_categoria_id and patron_id = p_patron_id) then
      raise exception 'Ese patrón no está habilitado para la categoría elegida';
    end if;
  end if;

  if p_token is not null then
    select id into v_producto_id from productos where token_cliente = p_token;
    if found then return v_producto_id; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_variantes) loop
    v_talla_id := nullif(v_item ->> 'talla_id', '')::uuid;
    v_color := nullif(trim(v_item ->> 'color_codigo'), '');
    v_precio := (v_item ->> 'precio')::numeric;
    v_costo := coalesce((v_item ->> 'costo')::numeric, 0);

    if v_precio is null or v_precio < 0 then
      raise exception 'Cada variante necesita un precio de venta (0 o más)';
    end if;
    if v_costo < 0 then
      raise exception 'El costo no puede ser negativo';
    end if;
    if v_color is not null and not exists (
      select 1 from colores where codigo = v_color and activo
    ) then
      raise exception 'Uno de los colores elegidos ya no está activo en el vocabulario';
    end if;
    if v_talla_id is not null then
      if not exists (select 1 from tallas where id = v_talla_id and activo) then
        raise exception 'Una de las tallas elegidas ya no está activa en el vocabulario';
      end if;
      if not exists (select 1 from categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla_id) then
        raise exception 'Una de las tallas elegidas no está habilitada para esta categoría';
      end if;
    end if;

    v_clave := coalesce(v_talla_id::text, '') || '|' || coalesce(v_color, '');
    if v_clave = any(v_claves) then
      raise exception 'Repetiste la misma combinación de talla y color — cada celda de la matriz va una sola vez';
    end if;
    v_claves := array_append(v_claves, v_clave);
  end loop;

  insert into productos (categoria_id, referencia, descripcion, token_cliente, tejido_id, patron_id)
    values (p_categoria_id, trim(p_referencia), nullif(trim(p_descripcion), ''), p_token, p_tejido_id, p_patron_id)
    returning id into v_producto_id;

  insert into variantes (producto_id, talla_id, color_codigo, precio, costo)
  select
    v_producto_id,
    nullif(item ->> 'talla_id', '')::uuid,
    nullif(trim(item ->> 'color_codigo'), ''),
    (item ->> 'precio')::numeric,
    coalesce((item ->> 'costo')::numeric, 0)
  from jsonb_array_elements(p_variantes) as item;

  return v_producto_id;
end;
$$;

grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid) to authenticated;

drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid);
