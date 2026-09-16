-- ============================================================================
-- 20260915221633_crear_producto_con_variantes.sql — CAYLA V2
--
-- Hoy `productos`/`variantes/page.tsx` es solo lectura — no existe forma de
-- dar de alta un producto con su matriz talla×color desde la UI. La única
-- vía sería un INSERT a `productos` + N INSERTs sueltos a `variantes` desde
-- el cliente: si el navegador falla a mitad de una matriz de 5×6, el
-- producto queda a medias. Esta función crea el producto y TODAS sus
-- variantes en una sola transacción — ADR: ver docs/adr/ (sku nullable +
-- esta función, cambio estructural sobre columnas del núcleo).
-- ============================================================================

-- ---------- sku deja de ser obligatorio ----------
-- `variantes.sku` es legado — el diccionario de datos ya lo describe como
-- "de antes del 2026-09-09". El identificador vivo es `variantes.codigo`,
-- autogenerado por el trigger `variantes_asignar_codigo`
-- (20260912235500_vocabulario_cerrado.sql). Pedirle a esta función un SKU
-- manual, o inventar uno sintético solo para satisfacer el NOT NULL, sería
-- meter un dato falso a la fuerza. Un índice UNIQUE en Postgres no choca
-- entre NULLs, así que relajar esto no arriesga nada de lo ya sembrado.
alter table retail.variantes alter column sku drop not null;

comment on column retail.variantes.sku is
  'Identificador legado (antes del 2026-09-09). Las variantes que crea '
  'crear_producto_con_variantes() no lo piden: el identificador vivo es '
  'variantes.codigo (trigger variantes_asignar_codigo). NOT NULL se retiró '
  'el 2026-09-15 — exigirlo forzaba un valor sintético sin sentido.';

-- ---------- idempotencia, mismo patrón que ventas/producciones ----------
alter table retail.productos add column if not exists token_cliente uuid unique;

comment on column retail.productos.token_cliente is
  'Idempotencia del formulario de alta: un reintento de red a mitad de '
  'insertar la matriz de variantes devuelve el mismo producto, no crea uno '
  'segundo. Mismo mecanismo que ventas.token_cliente/producciones.token_cliente.';

-- ---------- crear_producto_con_variantes ----------
-- Un producto NUEVO con su matriz completa de variantes en una sola
-- transacción: un INSERT a productos + N a variantes. El trigger
-- variantes_asignar_codigo (20260912235500) hace el resto — código de
-- producto, código de cada variante y su fila en codigos_barras — esta
-- función no toca ninguna de esas piezas.
--
-- Inmune por diseño al bug de docs/BITACORA.md 2026-09-10 (AltaEnConteo
-- perdía p_producto_id y creaba un producto nuevo por cada talla, partiendo
-- el inventario en dos): esta función NO acepta un producto_id — siempre
-- crea exactamente uno, nunca reutiliza uno existente. p_token es la
-- segunda capa: un reintento a mitad de los N inserts devuelve el mismo
-- producto en vez de uno nuevo.
--
-- p_variantes: [{ "talla": "M", "color_codigo": "AZM", "precio": 89.90,
--   "costo": 32.00 }, …]. talla y color_codigo pueden venir null (producto
-- sin ese eje, ej. una correa, un gorro).
create or replace function retail.crear_producto_con_variantes(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null
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
  -- Candado real: una función security definer corre con los privilegios de
  -- su dueño, y Postgres exime al dueño de una tabla de sus propias RLS
  -- policies salvo FORCE ROW LEVEL SECURITY (que esta base no usa en
  -- ninguna tabla). Sin este chequeo, cualquier `authenticated` podría
  -- llamar esta función directo (0005_grants.sql da execute a todos por
  -- defecto) sin que variantes_write_lider/productos_write_lider lo frenen.
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

  -- Idempotencia: el mismo token devuelve el producto que ya se creó.
  if p_token is not null then
    select id into v_producto_id from productos where token_cliente = p_token;
    if found then return v_producto_id; end if;
  end if;

  -- Valida TODO el array antes de escribir una sola fila. A diferencia de
  -- abrir_produccion (que suma cantidades repetidas con group by), acá dos
  -- precios distintos para la misma celda no tienen una fusión correcta —
  -- se rechaza con un error claro en vez de decidir en silencio cuál vale.
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

  insert into productos (categoria_id, referencia, descripcion, token_cliente)
    values (p_categoria_id, trim(p_referencia), nullif(trim(p_descripcion), ''), p_token)
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

grant execute on function retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid) to authenticated;
