-- ============================================================================
-- 20260915224500 — Ficha de producto: fotos (varias, reordenables),
-- temporada y venta sin stock (Sesión F1, sobre DiegoN)
--
-- QUÉ TRAE
--   · `retail.producto_fotos` — varias fotos por producto, con orden y una
--     marcada principal (miniatura del listado).
--   · Bucket `retail-productos-fotos` (público, mismo patrón que
--     `retail-compras-adjuntos` de `20260914180000_compras_adjuntos.sql`).
--   · `retail.productos.temporada` (text) y
--     `retail.productos.permitir_venta_sin_stock` (boolean, default false).
--   · `catalogo_crear_producto`/`catalogo_actualizar_producto`
--     (`20260915150000_catalogo_alta_edicion.sql`, extendida ya una vez por
--     `20260915170000_stock_minimo_en_alta_edicion.sql`) ganan
--     `p_temporada`, `p_permitir_venta_sin_stock` y `p_fotos`.
--
-- LA VERIFICACIÓN CONTRA EL DICCIONARIO DE PRODUCCIÓN (pedida por la
-- consigna de esta sesión) — Y LO QUE SALIÓ DISTINTO A LO ASUMIDO
--   La consigna asumía que `retail.productos` en PRODUCCIÓN ya tiene
--   `foto_url` y `temporada` como columnas V1 muertas. Verificado contra
--   `docs/datos/generado/DICCIONARIO-RETAIL.md` (refrescado 2026-09-15
--   directo desde producción, no a mano): la tabla real tiene **7
--   columnas** — `id, categoria_id, referencia, descripcion, estado,
--   created_at, codigo` — ninguna de las dos existe ahí. Esa suposición
--   venía de `docs/datos/modulos/02-catalogo-y-vocabulario.md:105,107`,
--   que describe el `productos` de V1 (con `sku_padre`, `marca`, `genero`,
--   `foto_url`, `costo_mano_obra`...) — el aviso en la cabecera de
--   `CLAUDE.md`/`BACKLOG.md` de que esa carpeta describe V1, no lo que hoy
--   corre en producción, era literal también acá.
--   Conclusión: `temporada` y `permitir_venta_sin_stock` no se "resucitan",
--   se agregan de cero — mismo resultado práctico (`add column if not
--   exists`), pero el porqué es distinto del que traía la consigna. Y la
--   migración de `foto_url` de más abajo queda con guardia real (columna
--   puede no existir) en vez de asumida.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA `foto_url` COMO V1
--   "Varias fotos, reordenables, una principal" no cabe en una columna
--   `text`. Una fila por foto es lo mismo que ya se decidió para
--   `compra_adjuntos`: la tabla es la fuente de verdad, el bucket solo
--   aloja bytes.
--
-- POR QUÉ PÚBLICO Y NO PRIVADO CON URL FIRMADA (a diferencia de
-- `retail-compras-adjuntos`)
--   Una factura de proveedor lleva RUC y montos: no va en una URL
--   adivinable. Una foto de producto es al revés — existe para mostrarse
--   (catálogo, y a futuro POS/vitrina), así que una URL pública simple es
--   lo que la pantalla necesita, sin generar una URL firmada por cada
--   `<img>`. Mismo patrón que ya usa `fotos-perfil` (bucket de Dynamic,
--   ver `PerfilModal.tsx:133`, `getPublicUrl`) — no inventado acá, ya es
--   la convención del repo para imágenes.
--
-- POR QUÉ EL CANDADO DE NEGOCIO VIVE EN LA RPC Y NO EN LA POLICY DE STORAGE
--   Igual que `retail-compras-adjuntos`: la política de `storage.objects`
--   solo mira `bucket_id` (cualquier persona autenticada puede subir un
--   objeto ahí). Quién puede hacer que ese objeto EXISTA para el sistema
--   —es decir, quién puede escribir una fila en `producto_fotos`— lo
--   decide `producto_fotos_write_lider` (RLS), la misma policy que ya usan
--   `productos`/`variantes`. Subir a un bucket sin fila es indistinguible
--   de basura: ninguna pantalla lee el bucket directo.
--
-- POR QUÉ LAS FOTOS ENTRAN COMO `p_fotos` A LAS MISMAS DOS RPC, EN VEZ DE
-- RPC PROPIAS (`agregar_foto_producto`, etc.)
--   El criterio de verificación de esta sesión es "crear con 3 fotos,
--   reordenar, marcar principal, GUARDAR, recargar, confirmar que
--   persiste" — el guardado es un solo acto, igual que ya lo es para
--   variantes. `p_fotos` es un reemplazo completo de la lista (mismo
--   patrón que ya usa `p_variantes`: `id` presente = fila existente,
--   ausente = nueva), en el ORDEN en que llega el array — el cliente ya
--   reordenó localmente antes de mandar. `p_fotos = null` en
--   `catalogo_actualizar_producto` significa "no tocar fotos" (no todas
--   las llamadas futuras a esta RPC van a traer fotos); `[]` sí vacía la
--   galería a propósito.
--   El posible "doble true" de `es_principal` a mitad de un UPDATE fila
--   por fila (el índice único parcial de abajo no es diferible) se evita
--   poniendo TODO el producto en `es_principal = false` antes del loop
--   que vuelve a marcar como mucho una.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Columnas nuevas en `productos`
-- ---------------------------------------------------------------------------
alter table retail.productos add column if not exists temporada text;
alter table retail.productos add column if not exists permitir_venta_sin_stock boolean not null default false;

comment on column retail.productos.temporada is
  'Texto libre ("Verano 26"). Se escribe y se muestra desde ProductoForm.tsx — a diferencia de la columna homónima de V1 (docs/datos/modulos/02-catalogo-y-vocabulario.md:105), que ninguna pantalla leía.';
comment on column retail.productos.permitir_venta_sin_stock is
  'Si es true, el producto puede venderse aunque `stock` marque 0 (pedido especial / preventa). Checkbox en ProductoForm.tsx; el candado real en Vender/registrar_venta queda fuera de esta sesión (F1 solo escribe y muestra el dato).';

-- ---------------------------------------------------------------------------
-- 2. `producto_fotos` — varias por producto, reordenables, una principal
-- ---------------------------------------------------------------------------
create table retail.producto_fotos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references retail.productos (id),
  url text not null,
  orden integer not null default 0,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);
create index producto_fotos_producto_idx on retail.producto_fotos (producto_id, orden);
-- A lo más una foto principal por producto — el candado real, no una
-- convención de la UI.
create unique index producto_fotos_principal_unico on retail.producto_fotos (producto_id) where es_principal;

comment on table retail.producto_fotos is
  'Fotos de un producto (varias, reordenables). `url` apunta al bucket público retail-productos-fotos. `orden` decide el orden de la galería; `es_principal` marca la miniatura del listado, a lo más una por producto (índice único parcial). Se escribe completa desde catalogo_crear_producto/catalogo_actualizar_producto (p_fotos), nunca a mano.';

alter table retail.producto_fotos enable row level security;
create policy producto_fotos_select on retail.producto_fotos for select
  using (auth.role() = 'authenticated');
create policy producto_fotos_write_lider on retail.producto_fotos for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------------------------------------------------------------------------
-- 3. Migrar `foto_url` legado, SOLO si la columna existe en este Postgres
--    (ver nota de cabecera: en producción hoy no existe; se deja la
--    guardia real por si algún entorno todavía la tiene).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'retail' and table_name = 'productos' and column_name = 'foto_url'
  ) then
    execute $sql$
      insert into retail.producto_fotos (producto_id, url, orden, es_principal)
      select id, foto_url, 0, true
      from retail.productos
      where foto_url is not null
    $sql$;
    raise notice 'producto_fotos: migradas fotos legado desde productos.foto_url.';
  else
    raise notice 'producto_fotos: productos.foto_url no existe en este Postgres (confirmado también en producción, 2026-09-15) — nada que migrar.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El bucket y sus políticas — solo donde Storage existe (producción)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'producto_fotos: sin schema storage en este Postgres (Storage local apagado); el bucket retail-productos-fotos se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'retail-productos-fotos',
    'retail-productos-fotos',
    true,
    5 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Subir y leer: cualquier persona autenticada, solo en este bucket. El
  -- candado de negocio (quién puede hacer que la foto exista para el
  -- sistema) vive en producto_fotos_write_lider, no acá.
  drop policy if exists retail_productos_fotos_insert on storage.objects;
  create policy retail_productos_fotos_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'retail-productos-fotos');

  drop policy if exists retail_productos_fotos_select on storage.objects;
  create policy retail_productos_fotos_select on storage.objects
    for select to authenticated
    using (bucket_id = 'retail-productos-fotos');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. `catalogo_crear_producto` — gana p_temporada/p_permitir_venta_sin_stock/p_fotos
-- ---------------------------------------------------------------------------
drop function if exists retail.catalogo_crear_producto(text, jsonb, uuid, text, integer);

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
  'Alta de producto+variantes+fotos para /productos/nuevo (V2). Sin security definer: corre con los permisos de quien llama; productos_write_lider/variantes_write_lider/producto_fotos_write_lider (RLS) son el único candado de permiso. p_stock_minimo: umbral de "stock bajo" (20260915160000). p_temporada/p_permitir_venta_sin_stock: 20260915224500. p_fotos: reemplazo completo en el orden del array, [{url, es_principal?}]; sin id porque el producto todavía no existe.';

-- ---------------------------------------------------------------------------
-- 6. `catalogo_actualizar_producto` — gana p_temporada/p_permitir_venta_sin_stock/p_fotos
-- ---------------------------------------------------------------------------
drop function if exists retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer);

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
  'Edición de producto+variantes+fotos para /productos/[id]/editar (V2). Fotos: p_fotos null = no tocar la galería; [] = vaciarla; con elementos = reemplazo completo (id presente = fila existente, ausente = nueva), en el orden del array. p_temporada/p_permitir_venta_sin_stock: 20260915224500.';
