-- ============================================================================
-- 20261028221000_alta_con_llegada.sql — CAYLA V2 · ADR-0328 (actualización 2026-10-28)
-- Nuevo producto, con la carga inicial de la sede ya cerrada: las unidades entran como una LLEGADA del proveedor, en el mismo paso.
--
-- EL PROBLEMA PRIMERO. Desde el 15-oct Trujillo cerró su carga inicial (ADR-0328): «lo que ya tenías» no entra más sin historia. Pero
-- Nuevo producto apagó la tabla entera («La carga inicial de Tienda Trujillo ya se cerró») y la prenda nacía sin unidades: quien la
-- tenía en la mano tenía que ir a «Llegó mercadería», buscar la prenda recién creada y escribir otra vez lo mismo. Felipe
-- (2026-10-28): «se debe poder ingresar unidades por ahí, ya que a veces pasa que lo usan y es engorroso tener que ir a otro módulo».
--
-- LA DECISIÓN. La carga inicial sigue cerrada: lo que se escribe en el alta NO es «lo que ya tenía» sin historia, es una llegada de
-- mercadería del proveedor elegido en el paso 2, con su fecha de hoy, igual que la puerta «Llegó mercadería» (ADR-0330). Por
-- eso esta función no carga stock por su cuenta: hace las dos cosas que ya existen, en UNA transacción.
--   1. El alta de siempre SIN cantidades (`crear_producto_con_stock_inicial`, o `crear_producto_con_empresa` desde una sede con dos
--      tiendas), con todos sus candados: si el nombre choca o falta algo, no se crea nada.
--   2. La llegada con `recibir_lote` (sin cambios), con sus candados: permiso de la sede, responsable de turno (ADR-0162), el almacén
--      de entrada de la sede y, en Lima, el dueño de la cabecera (ADR-0542). Si falla, tampoco queda la prenda.
--
-- SIN CONEXIÓN (ADR-0210). El alta con llegada también se encola: al subir, la firma tiene que mirar la asistencia a la HORA DEL ALTA
-- (`x-momento`), no a la de subida. Por eso se suma a la lista de `fn_actor_persona_id` que lee `request.path` (20261013155000), que queda:
--      /rpc/(registrar_venta|recibir_lote|recibir_envio|crear_producto_con_stock_inicial|crear_producto_con_empresa|crear_producto_con_llegada|crear_producto_con_variantes)$
-- Con un reemplazo anclado por TEXTO, como 20261020225000: si la lista no está todavía (20261013155000 sin pegar), la hora declarada vale en
-- todas las funciones y no hay nada que sumar; al pegar esa después, hay que VOLVER A PEGAR esta (es repetible).
--
-- EL DOBLE CLIC (ADR-0190). El alta usa el token del formulario; la llegada, uno que sale de él (`md5('llegada-alta:' || token)`).
-- Un reintento devuelve el mismo producto y `recibir_lote` encuentra su lote por el token: no se crea otro ni se duplican unidades.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (frente a hacerlo en dos llamadas desde el navegador):
--   · Una prenda creada «con unidades» cuya llegada no se guardó (corte de red entre las dos llamadas).
--   · Una llegada sin proveedor: `lotes.proveedor_id` es obligatorio y se exige ANTES de crear nada (hint `llegada_sin_proveedor`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte, solo funciones (una nueva y el reemplazo anclado de la lista): no toma tablas en uso, no
-- lleva políticas ni `drop trigger` (ADR-0195). Idempotente. Se pega ANTES de publicar la web (sin ella, el alta con la carga cerrada dice que no encontró la función).
--
-- SE ROMPE SI: alguien cambia la firma de `crear_producto_con_stock_inicial`, `crear_producto_con_empresa` o `recibir_lote` sin
-- tocar esta (la prueba `alta_con_llegada.mjs` la llama de punta a punta en cada CI).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.crear_producto_con_llegada(
  p_referencia text,
  p_categoria_id uuid,
  p_variantes jsonb,
  p_ubicacion_id uuid,
  p_proveedor_id uuid,
  p_descripcion text default null,
  p_token uuid default null,
  p_tejido_id uuid default null,
  p_patron_id uuid default null,
  p_confirmo_distinto boolean default false,
  p_etiqueta_ids uuid[] default null,
  p_marca_id uuid default null,
  p_temporada text default null,
  p_empresa_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_producto uuid;
  v_sin_cantidades jsonb;
  v_items jsonb;
  v_con_cantidad integer;
begin
  -- 1. Las cantidades bien escritas y al menos una: esta puerta es para lo que llegó (sin unidades, el alta de siempre).
  if jsonb_typeof(p_variantes) = 'array' and exists (
    select 1 from jsonb_array_elements(p_variantes) i
     where jsonb_typeof(i) = 'object'
       and coalesce(i ->> 'cantidad', '') !~ '^[0-9]{0,4}$'
  ) then
    raise exception 'Cada cantidad tiene que ser un número entero de 0 a 9999.' using hint = 'carga_cantidad_invalida';
  end if;
  select count(*) into v_con_cantidad
    from jsonb_array_elements(case when jsonb_typeof(p_variantes) = 'array' then p_variantes else '[]'::jsonb end) i
   where jsonb_typeof(i) = 'object' and coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;
  if v_con_cantidad = 0 then
    raise exception 'Escribe cuántas llegaron de al menos una talla y color.' using hint = 'llegada_sin_unidades';
  end if;

  -- 2. Lo que la llegada necesita, ANTES de crear nada: el proveedor (`lotes.proveedor_id` es obligatorio) y poder operar la sede.
  if p_proveedor_id is null then
    raise exception 'Elige el proveedor en el paso 2: lo que llegó entra a su nombre.' using hint = 'llegada_sin_proveedor';
  end if;
  if p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir mercadería en esa sede.' using hint = 'llegada_sin_permiso';
  end if;

  -- 3. El alta de siempre, sin cantidades ni sede: no carga nada (la carga inicial de la sede puede estar cerrada).
  select jsonb_agg(case when jsonb_typeof(i) = 'object' then i - 'cantidad' else i end order by n)
    into v_sin_cantidades
    from jsonb_array_elements(p_variantes) with ordinality as e(i, n);

  if p_empresa_id is not null then
    v_producto := retail.crear_producto_con_empresa(
      p_referencia, p_categoria_id, v_sin_cantidades, p_empresa_id, p_ubicacion_id, p_descripcion, p_token, p_tejido_id, p_patron_id,
      p_confirmo_distinto, p_etiqueta_ids, p_marca_id, p_proveedor_id, null, false, p_temporada);
  else
    v_producto := retail.crear_producto_con_stock_inicial(
      p_referencia, p_categoria_id, v_sin_cantidades, p_descripcion, p_token, p_tejido_id, p_patron_id, p_confirmo_distinto,
      p_etiqueta_ids, p_marca_id, p_proveedor_id, null, false, p_temporada);
  end if;

  -- 4. Cada cantidad con la variante que acaba de nacer (por su talla y su color). SIN `costo_unitario`, a propósito (/chaos 2026-10-28,
  --    semilla 2810): el costo ya lo fijó el alta en la variante, y el promedio sobre un stock en cero daría el mismo número. Mandarlo
  --    lo hacía pasar por el «costo fuera de lo normal» de `recibir_lote`, que rechaza un costo igual o mayor que el precio: la pantalla
  --    decía «Todo listo» (el margen negativo solo se avisa) y el alta entera fallaba, o pedía a un líder confirmar algo que nadie podía
  --    confirmar desde aquí. Lo único que no queda es la línea «compra» del historial de costo de esa prenda.
  select jsonb_agg(
           jsonb_build_object('variante_id', v.id, 'cantidad', (i ->> 'cantidad')::integer)
           order by v.id)
    into v_items
    from jsonb_array_elements(p_variantes) i
    join retail.variantes v
      on v.producto_id = v_producto
     and v.talla_id is not distinct from nullif(i ->> 'talla_id', '')::uuid
     and v.color_codigo is not distinct from nullif(btrim(i ->> 'color_codigo'), '')
   where jsonb_typeof(i) = 'object' and coalesce(nullif(i ->> 'cantidad', ''), '0')::integer > 0;

  if coalesce(jsonb_array_length(v_items), 0) <> v_con_cantidad then
    -- Nunca debería pasar (las variantes se acaban de crear con esas tallas y colores); si pasa, no se pierde ni una unidad en
    -- silencio: no se crea nada.
    raise exception 'No se pudo emparejar cada cantidad con su talla y color. No se creó nada.' using hint = 'llegada_sin_emparejar';
  end if;

  -- 5. La llegada, con la puerta de siempre. El mismo token del alta da la misma llegada (un reintento no duplica).
  perform retail.recibir_lote(
    p_ubicacion_id, p_proveedor_id, v_items, null, 'Llegó con el alta del producto',
    case when p_token is null then null else md5('llegada-alta:' || p_token::text)::uuid end);

  return v_producto;
end;
$$;

comment on function retail.crear_producto_con_llegada(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, text, uuid) is
  'ADR-0328 act. 2026-10-28: Nuevo producto con la carga inicial cerrada. Crea el producto (sin carga inicial) y registra lo que llegó '
  'con recibir_lote, del proveedor elegido, en una sola transacción.';

revoke all on function retail.crear_producto_con_llegada(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, text, uuid) from public;
grant execute on function retail.crear_producto_con_llegada(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, text, uuid) to authenticated;

-- La hora declarada también vale en el alta con llegada (ver «SIN CONEXIÓN» arriba). ----------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: el texto nuevo contiene al viejo, así que si ya está puesto no se vuelve a parchear.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

do $lista$
begin
  if position('request.path' in pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure)) = 0 then
    raise notice 'ADR-0328: fn_actor_persona_id no tiene aún la lista de la hora declarada (20261013155000): nada que sumar. Vuelve a pegar esta migración después de esa.';
  else
    perform pg_temp.reemplazar(
      'retail.fn_actor_persona_id(boolean)',
      '|crear_producto_con_variantes)$',
      '|crear_producto_con_llegada|crear_producto_con_variantes)$',
      1
    );
  end if;
end
$lista$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», el texto se pegó cortado: es seguro volver a pegarlo.
select '20261028221000 · alta con llegada' as parte,
       case when to_regprocedure('retail.crear_producto_con_llegada(text, uuid, jsonb, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid, text, uuid)') is not null
             and (pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure) like '%crear_producto_con_llegada%'
                  or position('request.path' in pg_get_functiondef('retail.fn_actor_persona_id(boolean)'::regprocedure)) = 0)
            then 'QUEDÓ BIEN' else 'REVISAR: falta la función o la hora declarada' end as resultado;
