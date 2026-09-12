-- ============================================================================
-- 0059 · Toda variante nace con color del vocabulario y código corto,
--        por cualquier camino
--
-- EL DEFECTO (encontrado 2026-09-11 al mapear talla y color para el estándar,
-- docs/ESTANDAR-TALLA-Y-COLOR.md, mecanismo 1)
--   Cuatro caminos crean variantes. Dos ya hablaban el idioma nuevo:
--   `conteo_crear_variante` (0048/0051) e `importar_catalogo` (0056) resuelven el
--   color contra `colores` (0046), guardan `color_id` y llaman a
--   `fn_asignar_codigo_variante` (0047). Los otros dos —`crear_producto_con_variantes`
--   (la pantalla «Nuevo producto», con su matriz talla × color) y `recibir_lote`
--   («Recibir mercadería»)— se construyeron antes que el vocabulario y nadie los
--   hizo pasar por la puerta nueva: insertaban `color` como texto libre, sin
--   `color_id`, y nunca asignaban código. Consecuencias, en cadena: la variante
--   no tiene código corto, así que la etiqueta imprime el SKU de 40 caracteres que
--   la Zebra no lee (ADR-0025); no está en `codigos_barras`; y el vocabulario
--   cerrado se rompe por atrás — «azul» y «Azul marino» vuelven a convivir.
--   Medido en producción el 11-sep: 19 variantes, 2 sin código, color "azul " (con
--   espacio al final).
--
-- QUÉ HACE
--   1. `fn_normalizar_color(p_color_id, p_color)`: una sola regla para los cuatro
--      caminos. Si viene el código del vocabulario (el formulario nuevo lo manda),
--      se adopta su nombre canónico; si no viene pero el texto calza exacto con un
--      color (por `fn_clave_texto`), también; si no calza, el texto se conserva y
--      `color_id` queda null — el código no se inventa (ADR-0025). Esa tercera rama
--      es la de los clientes viejos: el deploy de Vercel puede seguir mandando
--      texto un rato sin que nada se rompa.
--   2. `crear_producto_con_variantes` y `recibir_lote`, con la MISMA firma (no hay
--      `drop`, no cambia la interfaz; ADR-0026 no aplica): aceptan `color_id`
--      (`colorId` en la primera, que ya hablaba camelCase) dentro de cada ítem,
--      normalizan, guardan las dos columnas y llaman a `fn_asignar_codigo_variante`
--      por cada variante nueva. Lo que hace `importar_catalogo` desde 0056.
--   3. Backfill, en tres pasos y con red de seguridad: (a) la decisión de Felipe
--      del 11-sep — «azul» a secas es Azul marino (AZM); (b) cualquier variante cuyo
--      color escrito a mano calce exacto con el vocabulario adopta su código —
--      salvo que eso la haga chocar con una hermana ya normalizada
--      (`variantes_identidad_unica`), en cuyo caso se deja como está para fusionarla
--      a mano, nunca borrarla; (c) código corto para todo lo que ya puede tenerlo.
--
-- QUÉ NO HACE
--   No exige color: una prenda sin color (bisutería, «Único») sigue siendo válida
--   y recibe código sin token de color, como siempre.
--   No rechaza texto libre: lo conserva sin código. Rechazarlo rompería «Recibir»
--   para el deploy viejo con el fardo abierto en el mostrador.
--
-- CÓMO SE VERIFICA
--   select sku, color, color_id, codigo from variantes where codigo is null;
--   → solo variantes con color escrito a mano que no calza con ningún color.
-- ============================================================================

-- ---------- 1. una sola regla para el color ----------
create or replace function fn_normalizar_color(
  p_color_id text,
  p_color text,
  out color_id text,
  out color text
)
language plpgsql stable
set search_path = public
as $$
begin
  -- El código del vocabulario, si el formulario lo mandó. Tiene que existir:
  -- un código inventado por un cliente es un error, no un color nuevo.
  if nullif(trim(p_color_id), '') is not null then
    select c.codigo, c.nombre into color_id, color
      from colores c where c.codigo = upper(trim(p_color_id));
    if color_id is null then
      raise exception 'El color % no está en el vocabulario de CAYLA', trim(p_color_id);
    end if;
    return;
  end if;

  -- Texto libre que calza exacto (sin mayúsculas ni acentos): se adopta el canónico.
  select c.codigo, c.nombre into color_id, color
    from colores c where fn_clave_texto(c.nombre) = fn_clave_texto(p_color);

  -- Si no calza, se conserva tal cual, sin código: ADR-0025, el código no se inventa.
  if color_id is null then
    color := nullif(trim(p_color), '');
  end if;
end;
$$;

comment on function fn_normalizar_color(text, text) is
  'Resuelve el color de una variante nueva contra `colores`: por código si viene, por nombre exacto si no, y texto libre sin código como último recurso.';

-- ---------- 2. crear_producto_con_variantes (misma firma que 0035) ----------
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
  v_variante_id uuid;
  v_item jsonb;
  v_color record;
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
    -- `colorId` es lo que manda el formulario nuevo; `color_id` por si alguien lo
    -- llama en snake_case; `color` texto es el camino del deploy viejo.
    select * into v_color from fn_normalizar_color(
      coalesce(v_item ->> 'colorId', v_item ->> 'color_id'), v_item ->> 'color');
    insert into variantes (producto_id, sku, talla, color, color_id, costo, precio, precio_oferta, stock_minimo)
      values (
        v_producto_id,
        trim(v_item ->> 'sku'),
        nullif(trim(v_item ->> 'talla'), ''),
        v_color.color,
        v_color.color_id,
        coalesce((v_item ->> 'costo')::numeric, 0),
        coalesce((v_item ->> 'precio')::numeric, 0),
        case when nullif(v_item ->> 'precioOferta', '') is not null then (v_item ->> 'precioOferta')::numeric else null end,
        coalesce((v_item ->> 'stockMinimo')::integer, 0)
      )
      returning id into v_variante_id;
    -- El código corto y parlante, el que va en la etiqueta. Devuelve null —sin
    -- asignar— si el color quedó como texto libre: ADR-0025.
    perform fn_asignar_codigo_variante(v_variante_id);
  end loop;

  return v_producto_id;
end;
$$;

-- ---------- 3. recibir_lote (misma firma que 0031) ----------
-- Local arrastraba una segunda firma: la de 8 parámetros de 0018 (con
-- `p_orden_produccion_id`), que 0031 «reafirmó» con 7 parámetros sin tirar la
-- anterior — dos funciones con el mismo nombre. Producción tiene una sola desde
-- `unificacion/31`. Se tira aquí la vieja (ADR-0026: la firma que se va, se va
-- con `drop`), porque su cuerpo no conoce el vocabulario y PostgREST la elegiría
-- cada vez que el formulario mande `p_orden_produccion_id` — el camino del Taller
-- que el BACKLOG tiene pendiente de reconciliar (`ordenes_produccion` vs
-- `producciones`); ese camino falla igual en producción, así que local deja de
-- mentir sobre él.
drop function if exists recibir_lote(uuid, text, jsonb, text, text, text, uuid, uuid);

create or replace function recibir_lote(
  p_sede_id uuid,
  p_origen text,
  p_items jsonb,
  p_proveedor text default null,
  p_numero_guia text default null,
  p_nota text default null,
  p_orden_compra_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_variante_id uuid;
  v_producto_id uuid;
  v_movimiento_id uuid;
  v_contenedor_id uuid;
  v_color record;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El lote no tiene ítems';
  end if;
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para recibir mercadería en ese almacén';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into lotes (sede_id, origen, proveedor, numero_guia, recibido_por, nota, orden_compra_id)
    values (p_sede_id, p_origen, p_proveedor, p_numero_guia, v_persona_id, p_nota, p_orden_compra_id)
    returning id into v_lote_id;

  if p_orden_compra_id is not null then
    update ordenes_compra set estado = 'recibida', updated_at = now()
      where id = p_orden_compra_id and estado in ('pendiente', 'confirmada');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item ->> 'variante_id') is not null then
      v_variante_id := (v_item ->> 'variante_id')::uuid;
    else
      if (v_item ->> 'producto_id') is not null then
        v_producto_id := (v_item ->> 'producto_id')::uuid;
      else
        insert into productos (sku_padre, referencia, categoria_id, genero, marca, temporada)
          values (
            v_item ->> 'sku_padre', v_item ->> 'referencia',
            case when (v_item ->> 'categoria_id') is not null then (v_item ->> 'categoria_id')::uuid else null end,
            v_item ->> 'genero', v_item ->> 'marca', v_item ->> 'temporada'
          )
          returning id into v_producto_id;
      end if;

      select * into v_color from fn_normalizar_color(
        coalesce(v_item ->> 'color_id', v_item ->> 'colorId'), v_item ->> 'color');
      -- La talla vacía entra como null (antes entraba como ''): para la identidad
      -- única da lo mismo (coalesce), y `fn_token_talla` la lee como «Único».
      insert into variantes (producto_id, sku, talla, color, color_id, costo, precio, stock_minimo)
        values (
          v_producto_id, v_item ->> 'sku', nullif(trim(v_item ->> 'talla'), ''),
          v_color.color, v_color.color_id,
          coalesce((v_item ->> 'costo')::numeric, 0), coalesce((v_item ->> 'precio')::numeric, 0),
          coalesce((v_item ->> 'stock_minimo')::integer, 0)
        )
        returning id into v_variante_id;
      perform fn_asignar_codigo_variante(v_variante_id);
    end if;

    v_contenedor_id := case when (v_item ->> 'contenedor_id') is not null
      then (v_item ->> 'contenedor_id')::uuid else null end;

    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, lote_id, contenedor_id)
      values (
        v_variante_id, p_sede_id, 'entrada', (v_item ->> 'cantidad')::integer,
        'ingreso de lote', v_persona_id, v_lote_id, v_contenedor_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_lote_id;
end;
$$;

-- ---------- 4. backfill ----------
-- (a) La decisión de Felipe (2026-09-11): «azul» a secas es Azul marino.
update variantes v
   set color = c.nombre, color_id = c.codigo
  from colores c
 where c.codigo = 'AZM'
   and v.color_id is null
   and fn_clave_texto(v.color) = 'azul'
   and not exists (
     select 1 from variantes h
      where h.producto_id = v.producto_id and h.id <> v.id
        and coalesce(h.talla, '') = coalesce(v.talla, '')
        and coalesce(h.color, '') = c.nombre);

-- (b) Todo color escrito a mano que calza exacto con el vocabulario adopta su
--     código — salvo que choque con una hermana ya normalizada: esa se fusiona a
--     mano, nunca se borra.
update variantes v
   set color = c.nombre, color_id = c.codigo
  from colores c
 where v.color_id is null
   and fn_clave_texto(v.color) = fn_clave_texto(c.nombre)
   and not exists (
     select 1 from variantes h
      where h.producto_id = v.producto_id and h.id <> v.id
        and coalesce(h.talla, '') = coalesce(v.talla, '')
        and coalesce(h.color, '') = c.nombre);

-- (c) Código corto para todo lo que ya puede tenerlo (la función devuelve null y
--     no toca nada cuando el color sigue sin normalizar).
do $$
declare v_n integer;
begin
  select count(fn_asignar_codigo_variante(id)) into v_n from variantes where codigo is null;
  raise notice '0059: % códigos cortos asignados en el backfill', v_n;
end $$;
