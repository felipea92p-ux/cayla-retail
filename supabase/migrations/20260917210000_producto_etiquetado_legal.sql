-- ============================================================================
-- 20260917210000_producto_etiquetado_legal.sql — CAYLA V2
--
-- La Ley 28405 (Ley de Rotulado de Productos Industriales Manufacturados) y
-- el Reglamento Técnico Andino de Etiquetado de Confecciones exigen que toda
-- prenda declare país de origen, fabricante/importador y composición del
-- material — hoy `retail.productos` no tiene dónde guardar ninguno de los
-- tres, así que no hay forma de imprimirlos en una etiqueta ni de responder
-- una fiscalización.
--
-- DECIDÍ: los 3 campos NULLABLE, sin backfill. El catálogo actual (cargado
-- antes de esta migración) no tiene este dato levantado producto por
-- producto — exigirlo retroactivamente dejaría productos existentes
-- rotos/bloqueados sin que nadie hubiera hecho nada mal. Se completan hacia
-- adelante, en el alta o edición, cuando quien carga el producto lo sepa.
--
-- DESCARTÉ: una tabla aparte `producto_etiquetado` (uno-a-uno con
-- productos). Ganas: aísla un concepto legal del núcleo de catálogo. Pagas:
-- un join más en cada lectura de ficha/formulario para 3 columnas de texto
-- que se leen y escriben siempre junto con el resto del producto — no hay
-- ningún caso de uso que lea etiquetado legal sin leer el producto. Antes de
-- agregar, se prueba que no puede vivir más simple: acá sí puede.
--
-- SE ROMPE SI: SUNAT/INDECOPI empiezan a exigir composición POR VARIANTE
-- (ej. una colección con telas distintas por color) — hoy es un solo texto
-- libre a nivel de producto, asumiendo que todas las variantes de un mismo
-- producto comparten material. Si eso deja de ser cierto, esto se mueve a
-- `variantes` en una migración aparte, no se fuerza acá.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.productos add column if not exists pais_origen text;
alter table retail.productos add column if not exists fabricante_declarado text;
alter table retail.productos add column if not exists material text;

comment on column retail.productos.pais_origen is
  'País de fabricación de la prenda, texto libre (ej. "Perú", "China") — exigido por la Ley 28405 (Ley de Rotulado de Productos Industriales Manufacturados) y el Reglamento Técnico Andino de Etiquetado de Confecciones. Nullable: el catálogo cargado antes de esta migración no lo tiene, y no se exige retroactivamente.';

comment on column retail.productos.fabricante_declarado is
  'Nombre del fabricante o importador responsable ante SUNAT/INDECOPI, tal como debe figurar en la etiqueta — exigido por la Ley 28405. Texto libre porque no siempre es CAYLA (prendas de terceros, maquila): no se asume razón social fija ni se referencia contra otra tabla. Nullable por la misma razón que pais_origen.';

comment on column retail.productos.material is
  'Composición del material declarada en la etiqueta (ej. "100% algodón", "60% algodón / 40% poliéster") — exigido por el Reglamento Técnico Andino de Etiquetado de Confecciones. Texto libre, no enum: la variedad real de composiciones textiles no calza en un vocabulario cerrado. Nullable por la misma razón que pais_origen. Ver nota "SE ROMPE SI" arriba si algún día compone distinto que otra variante del mismo producto.';

-- ---------------------------------------------------------------------------
-- `catalogo_crear_producto`/`catalogo_actualizar_producto` (última versión:
-- 20260917190000) ganan los 3 parámetros, todos opcionales al final de la
-- firma. A diferencia de 20260917190000 (que solo tocaba el CUERPO), acá SÍ
-- cambia la LISTA de parámetros — Postgres no reemplaza una función cuando
-- cambia el número de argumentos, crea una segunda función sobrecargada y
-- dos candidatos ambiguos para `supabase.rpc(...)`. Por eso se dropea la
-- firma vieja primero.
-- ---------------------------------------------------------------------------
drop function if exists retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb);
drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb);

create or replace function retail.catalogo_crear_producto(
  p_referencia text,
  p_variantes jsonb,
  p_categoria_id uuid default null,
  p_descripcion text default null,
  p_stock_minimo integer default null,
  p_temporada text default null,
  p_permitir_venta_sin_stock boolean default false,
  p_fotos jsonb default '[]'::jsonb,
  p_pais_origen text default null,
  p_fabricante_declarado text default null,
  p_material text default null
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

  insert into productos (categoria_id, referencia, descripcion, stock_minimo, temporada, permitir_venta_sin_stock, pais_origen, fabricante_declarado, material)
  values (
    p_categoria_id,
    trim(p_referencia),
    nullif(trim(coalesce(p_descripcion, '')), ''),
    p_stock_minimo,
    nullif(trim(coalesce(p_temporada, '')), ''),
    coalesce(p_permitir_venta_sin_stock, false),
    nullif(trim(coalesce(p_pais_origen, '')), ''),
    nullif(trim(coalesce(p_fabricante_declarado, '')), ''),
    nullif(trim(coalesce(p_material, '')), '')
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
    insert into producto_fotos (producto_id, url, orden, es_principal, color_codigo)
    values (
      v_producto_id,
      v_fila.foto->>'url',
      v_fila.orden,
      (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
      nullif(v_fila.foto->>'color_codigo', '')
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

comment on function retail.catalogo_crear_producto(text, jsonb, uuid, text, integer, text, boolean, jsonb, text, text, text) is
  'Alta de producto+variantes+fotos para /productos/nuevo (V2). Sin security definer: corre con los permisos de quien llama; productos_write_lider/variantes_write_lider/producto_fotos_write_lider (RLS) son el único candado de permiso. p_stock_minimo: umbral de "stock bajo" (20260915160000). p_temporada/p_permitir_venta_sin_stock: 20260915224500. p_fotos: reemplazo completo en el orden del array, [{url, es_principal?, color_codigo?}] (20260917190000: color_codigo); sin id porque el producto todavía no existe. p_pais_origen/p_fabricante_declarado/p_material: etiquetado legal (Ley 28405 / RTA, 20260917210000), todos opcionales.';

-- ---------------------------------------------------------------------------
-- `catalogo_actualizar_producto` — igual
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
  p_fotos jsonb default null,
  p_pais_origen text default null,
  p_fabricante_declarado text default null,
  p_material text default null
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
        permitir_venta_sin_stock = coalesce(p_permitir_venta_sin_stock, false),
        pais_origen = nullif(trim(coalesce(p_pais_origen, '')), ''),
        fabricante_declarado = nullif(trim(coalesce(p_fabricante_declarado, '')), ''),
        material = nullif(trim(coalesce(p_material, '')), '')
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
    -- único parcial de arriba no es diferible, y actualizar fila por fila
    -- sin este paso deja un instante con dos `true` a la vez si la
    -- principal nueva no es la misma fila que la principal vieja.
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
              es_principal = (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
              color_codigo = nullif(v_fila.foto->>'color_codigo', '')
          where id = v_foto_id and producto_id = p_producto_id;
      else
        insert into producto_fotos (producto_id, url, orden, es_principal, color_codigo)
        values (
          p_producto_id,
          v_fila.foto->>'url',
          v_fila.orden,
          (coalesce((v_fila.foto->>'es_principal')::boolean, false) and not v_ya_principal),
          nullif(v_fila.foto->>'color_codigo', '')
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

comment on function retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, text, text, text) is
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo (id presente = fila existente, ausente = nueva), en el orden del array, cada una con color_codigo? opcional (20260917190000). p_temporada/p_permitir_venta_sin_stock: 20260915224500. p_pais_origen/p_fabricante_declarado/p_material: etiquetado legal (Ley 28405 / RTA, 20260917210000), todos opcionales.';

-- ---------------------------------------------------------------------------
-- `crear_producto_con_variantes` (20260915221633) — la RPC REAL que usa hoy
-- /productos/nuevo (NuevoProductoForm.tsx). `catalogo_crear_producto` de
-- arriba quedó sin ruta que la llame desde que existe esta (confirmado por
-- grep, 2026-09-17) — se actualiza igual por prolijidad de la pareja
-- alta/edición, pero el alta real pasa por acá.
-- ---------------------------------------------------------------------------
drop function if exists retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid);

create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_pais_origen text default null,
  p_fabricante_declarado text default null,
  p_material text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto_id uuid;
  v_item jsonb;
  v_talla text;
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

  if p_token is not null then
    select id into v_producto_id from productos where token_cliente = p_token;
    if found then return v_producto_id; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_variantes) loop
    v_talla := nullif(trim(v_item ->> 'talla'), '');
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

    v_clave := coalesce(v_talla, '') || '|' || coalesce(v_color, '');
    if v_clave = any(v_claves) then
      raise exception 'Repetiste talla "%" y color "%" — cada celda de la matriz va una sola vez',
        coalesce(v_talla, '(sin talla)'), coalesce(v_color, '(sin color)');
    end if;
    v_claves := array_append(v_claves, v_clave);
  end loop;

  insert into productos (categoria_id, referencia, descripcion, token_cliente, pais_origen, fabricante_declarado, material)
    values (
      p_categoria_id,
      trim(p_referencia),
      nullif(trim(p_descripcion), ''),
      p_token,
      nullif(trim(coalesce(p_pais_origen, '')), ''),
      nullif(trim(coalesce(p_fabricante_declarado, '')), ''),
      nullif(trim(coalesce(p_material, '')), '')
    )
    returning id into v_producto_id;

  insert into variantes (producto_id, talla, color_codigo, precio, costo)
  select
    v_producto_id,
    nullif(trim(item ->> 'talla'), ''),
    nullif(trim(item ->> 'color_codigo'), ''),
    (item ->> 'precio')::numeric,
    coalesce((item ->> 'costo')::numeric, 0)
  from jsonb_array_elements(p_variantes) as item;

  return v_producto_id;
end;
$$;

grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, text, text, text) to authenticated;

comment on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, text, text, text) is
  'Alta de producto+matriz de variantes en una transacción, para /productos/nuevo (NuevoProductoForm.tsx) — la RPC real de creación (20260915221633). p_token: idempotencia de reintento de red. p_pais_origen/p_fabricante_declarado/p_material: etiquetado legal (Ley 28405 / RTA, 20260917210000), todos opcionales.';
