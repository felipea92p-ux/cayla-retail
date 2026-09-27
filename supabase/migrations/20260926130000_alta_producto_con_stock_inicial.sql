-- ============================================================================
-- 20260926130000_alta_producto_con_stock_inicial.sql — CAYLA V2 · ADR-0212 «Nuevo producto con su stock de hoy»
-- Crear un producto y cargar las unidades que YA hay en tienda, en UNA sola operación (Felipe, 2026-09-26).
--
-- EL PROBLEMA. CAYLA está pasando su tienda al sistema desde cero: la prenda ya está colgada o en el almacén, no
-- «llega». «Nuevo producto» no pedía cantidades, así que después de crearla había que ir a Existencias ▸ Ajustar stock
-- ▸ «Reposición» a inventarlas una por una. En producción, el 24 y 25-sep entraron así 152 unidades: sin fecha de
-- llegada, sin decir que eran carga inicial y mezcladas con las correcciones de verdad. Y un producto creado sin
-- stock queda en «0» hasta que alguien se acuerde: «0» deja de significar «se agotó».
--
-- QUÉ HACE.
--   1. `fn_cargar_stock_inicial` (INTERNA: ningún rol la llama directo). Escribe una ENTRADA con motivo
--      `carga_inicial` por prenda, en el almacén de la tienda (o sin sububicación si la tienda no separa piso y
--      almacén, como el Taller), firmada por el responsable (ADR-0162), y la aplica al stock. El motivo ya existía:
--      `movimientos-reglas.ts` lo muestra como «Carga inicial» dentro de Entradas, y Análisis
--      (20260924010700, línea 514) ya lo cuenta como una llegada.
--   2. `crear_producto_con_stock_inicial` (la RPC que llama la pantalla). Llama a `crear_producto_con_variantes` tal
--      cual está —no copia su cuerpo: hereda sus candados y cualquier parche futuro—, busca el id de cada variante
--      recién nacida por su talla y color, y carga las cantidades. Si las prendas están colgadas (`p_al_piso`), las
--      baja con `bajar_al_piso` en la misma transacción: Frescura (ADR-0208) ve una bajada con su hora, no un piso
--      que sube de la nada.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · Un producto creado con cantidades y sin su stock (o al revés): todo es una transacción. Si la carga o la bajada
--     falla, el producto tampoco se crea.
--   · Una carga inicial sobre una prenda que ya tuvo cualquier movimiento en esa tienda (ni una venta, ni una
--     recepción, ni un ajuste). Por eso NO exige ser líder, a diferencia del ajuste (ADR-0143): el candado de líder
--     existe para que nadie tape un faltante con un ajuste, y una prenda sin historia no tiene faltante que tapar.
--     Lo mismo que ya permite `recibir_lote` (una recepción sin comprobante tampoco pide ser líder).
--   · Un doble clic que carga dos veces: el token del alta es el del producto; si el producto ya existe, su stock
--     entró con él y la función lo devuelve sin volver a cargar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual, en UNA vez (ya trae `retail.`). Solo crea dos funciones nuevas: no toca
-- tablas en uso, no crea políticas ni disparadores (ADR-0195 no aplica) y se puede pegar dos veces.
-- ANTES de publicar la web que la llama: sin ella, «Crear producto» fallaría con «function does not exist».
--
-- SE ROMPE SI:
--   · `crear_producto_con_variantes` cambia de firma (un parámetro nuevo sin default): esta función deja de compilar
--     su llamada y el alta falla entera. La prueba `scripts/pruebas/alta_con_stock_inicial.mjs` lo detecta en CI.
--   · Alguien usa esta puerta para mercadería que LLEGA de un proveedor: entra sin factura ni costo de compra y no
--     aparece en Compras ni en «sin comprobante». La pantalla lo dice; la base no puede saberlo (ver BACKLOG: cerrar
--     la carga inicial cuando termine el paso al sistema).
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. La carga inicial (interna)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_cargar_stock_inicial(p_ubicacion_id uuid, p_items jsonb, p_nota text default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ids uuid[];
  v_actor uuid;
  v_sub uuid;
  v_mov uuid;
  v_unidades integer := 0;
  r record;
begin
  if p_ubicacion_id is null or not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Falta la tienda donde está este stock.' using hint = 'carga_sin_tienda';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Solo puedes cargar stock en la tienda donde estás.' using hint = 'carga_sin_tienda';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay cantidades para cargar.' using hint = 'carga_vacia';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* c_uuid
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,3}$'
  ) then
    raise exception 'Cada cantidad tiene que ser un número entero de 1 a 9999.' using hint = 'carga_cantidad_invalida';
  end if;
  select array_agg(distinct (e ->> 'variante_id')::uuid) into v_ids from jsonb_array_elements(p_items) e;
  if cardinality(v_ids) <> jsonb_array_length(p_items) then
    raise exception 'Una prenda aparece dos veces en la carga.' using hint = 'carga_repetida';
  end if;
  if exists (select 1 from unnest(v_ids) x left join variantes va on va.id = x where va.id is null or not va.activo) then
    raise exception 'Una de las prendas no existe o está archivada.' using hint = 'carga_prenda_invalida';
  end if;

  -- Firma quien hace la operación en la tienda (el combo «Responsable», ADR-0162); sin responsable presente, 42501.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candados en el orden de ADR-0190 (variantes → stock) ANTES de mirar la historia: dos cargas de la misma prenda
  -- se ponen en fila, y la segunda ve lo que escribió la primera.
  perform fn_bloquear_en_orden(p_ubicacion_id, v_ids, true);
  if exists (select 1 from movimientos m where m.ubicacion_id = p_ubicacion_id and m.variante_id = any(v_ids)) then
    raise exception 'La carga inicial es solo para prendas que todavía no tienen ningún movimiento en esta tienda. Para las que ya tienen, usa Recibir o un Conteo.'
      using hint = 'carga_con_historia';
  end if;

  v_sub := fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');  -- el almacén; null en una tienda sin piso ni almacén

  for r in
    select (e ->> 'variante_id')::uuid as v, (e ->> 'cantidad')::integer as c
      from jsonb_array_elements(p_items) e
     order by 1
  loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
      values (r.v, p_ubicacion_id, v_sub, 'entrada', r.c, 'carga_inicial', v_actor, nullif(btrim(p_nota), ''))
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);
    v_unidades := v_unidades + r.c;
  end loop;

  return v_unidades;
end;
$$;

comment on function retail.fn_cargar_stock_inicial(uuid, jsonb, text) is
  'ADR-0212: entradas «carga_inicial» al almacén de una tienda (o sin sububicación si no separa piso y almacén), firmadas por el responsable. Solo para prendas SIN ningún movimiento en esa tienda. p_items = [{variante_id, cantidad 1..9999}], sin repetidas. Devuelve las unidades cargadas. Solo la llaman otras funciones.';

revoke all on function retail.fn_cargar_stock_inicial(uuid, jsonb, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. El alta con su stock de hoy (la RPC de la pantalla)
-- ----------------------------------------------------------------------------

create or replace function retail.crear_producto_con_stock_inicial(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null,
  p_marca_id uuid default null,
  p_proveedor_id uuid default null,
  p_ubicacion_id uuid default null,
  p_al_piso boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_reintento boolean;
  v_producto uuid;
  v_items jsonb;
  v_con_cantidad integer;
begin
  -- 1. Las cantidades bien escritas ANTES de crear nada: el mensaje habla de cantidades, no de otra cosa.
  --    Sin la clave, null, "" o 0 = sin stock en esa celda (la variante se crea igual).
  if jsonb_typeof(p_variantes) = 'array' and exists (
    select 1 from jsonb_array_elements(p_variantes) i
     where jsonb_typeof(i) = 'object'
       and coalesce(i ->> 'cantidad', '') !~ '^[0-9]{0,4}$'
  ) then
    raise exception 'Cada cantidad tiene que ser un número entero de 0 a 9999.' using hint = 'carga_cantidad_invalida';
  end if;

  -- 2. ¿Es un reintento del mismo intento? Si el producto de este token ya existe, su stock entró con él en la misma
  --    transacción: se devuelve sin volver a cargar (un doble clic no duplica las unidades). Dos llegadas SIMULTÁNEAS
  --    del mismo intento (la red reintenta) se ponen en fila con el candado del token (ADR-0190): la segunda espera a la
  --    primera y encuentra su producto, en vez de chocar con el índice único y mostrar un error de algo que sí se guardó.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('productos:' || p_token::text, 0));
  end if;
  v_reintento := p_token is not null and exists (select 1 from productos where token_cliente = p_token);

  -- 3. El producto y sus variantes, con la función de siempre (sus candados: nombre único, marca y proveedor, tallas de
  --    la categoría, tejido y patrón, permisos de catálogo). Si algo de eso falla, no se carga nada.
  v_producto := crear_producto_con_variantes(p_referencia, p_categoria_id, p_variantes, p_descripcion, p_token,
    p_tejido_id, p_patron_id, p_confirmo_distinto, p_etiqueta_ids, p_marca_id, p_proveedor_id);
  if v_reintento then
    return v_producto;
  end if;

  -- 4. Cada cantidad con el id de la variante que acaba de nacer (la celda se reconoce por su talla y su color).
  select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', (i ->> 'cantidad')::integer) order by v.id)
    into v_items
    from jsonb_array_elements(p_variantes) i
    join variantes v
      on v.producto_id = v_producto
     and v.talla_id is not distinct from nullif(i ->> 'talla_id', '')::uuid
     and v.color_codigo is not distinct from nullif(btrim(i ->> 'color_codigo'), '')
   where coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;

  select count(*) into v_con_cantidad
    from jsonb_array_elements(p_variantes) i
   where coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;
  if coalesce(jsonb_array_length(v_items), 0) <> v_con_cantidad then
    -- Nunca debería pasar (las variantes se acaban de crear con esas mismas tallas y colores); si pasa, no se pierde
    -- una cantidad en silencio: no se crea nada.
    raise exception 'No se encontró la variante de una de las cantidades. No se creó el producto: vuelve a intentarlo.'
      using hint = 'carga_sin_variante';
  end if;

  if v_items is null then
    return v_producto;  -- «todavía no tengo unidades»: el alta de siempre
  end if;

  -- 5. La carga al almacén de la tienda y, si ya están colgadas, su bajada al piso (misma transacción).
  perform fn_cargar_stock_inicial(p_ubicacion_id, v_items, 'Lo que ya había en tienda, cargado al crear el producto');
  if p_al_piso then
    perform bajar_al_piso(p_ubicacion_id, v_items, coalesce(p_token, gen_random_uuid()));
  end if;

  return v_producto;
end;
$$;

comment on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean) is
  'ADR-0212: crear_producto_con_variantes + la carga inicial de lo que ya hay en tienda, todo o nada. Cada ítem de p_variantes acepta «cantidad» (0..9999, vacío = 0). Con cantidades: p_ubicacion_id obligatorio (la tienda donde está el stock); p_al_piso = true las deja en el piso con una bajada (pide el módulo «Bajada al piso»). Mismo token = mismo producto y su stock no se vuelve a cargar.';

revoke all on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean) from public, anon;
grant execute on function retail.crear_producto_con_stock_inicial(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
