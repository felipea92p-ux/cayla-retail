-- ADR-0362 · fase 4 (Felipe 2026-10-12, «desarrollar de corrido»): recibir en la sede un envío de una orden de compra — las funciones.
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-recepcion-de-envio.md. El esquema va en
-- 20261013001000_recepcion_de_envio_esquema.sql (tiene que estar antes).
--
-- EL PROBLEMA PRIMERO. Llega a la tienda un envío ENV-000061 (o una orden «directo» llega sin guía, decisión 48) y nadie puede
-- recibirlo: `recibir_envio` y `recibir_compras` topan por tienda contra `compra_item_destinos` (que en el papel de una orden está todo
-- en la gestora, decisión 46) y rechazan las líneas sin prenda, que son TODAS las de una orden (se pide por categoría y marca). Y la
-- prenda que llega casi siempre es nueva: hay que crearla ahí mismo, con las tallas y colores que vinieron (decisión 49).
--
-- QUÉ HACE (una sola parte, re-pegable). Permiso común a todo lo que escribe: el módulo Recibir (decisión 40: el módulo es la llave),
-- la sede del envío (`fn_puede_operar_ubicacion`) y la decisión 17 (quien firma —el responsable del combo, `fn_actor_persona_id(true)`—
-- no hizo ninguna de las órdenes del envío, ni siendo líder). Firma con `fn_actor_persona_id(true)`, SIN clave en
-- `acciones_sin_responsable`: en la tienda se elige quién recibe.
--   1. `abrir_despacho`: en camino → abierto («Empezar a recibir»); desde ahí la compradora ya no lo anula. Repetido, devuelve lo mismo.
--   2. `recibir_orden_sin_envio`: una orden «directo» que llegó sin guía: crea un envío con todo lo que le queda por enviar (mismas
--      reglas de líneas que `crear_envio`; el tope diferido sigue mandando) y lo deja abierto. Idempotente por token.
--   3. `preparar_prenda_al_recibir`: la prenda de una línea. Nueva → `crear_producto_con_variantes` con la marca de transacción
--      `retail.alta_al_recibir` (20261013001000), la categoría y la marca de la línea, el proveedor de la orden (registrando la pareja
--      marca–proveedor si faltaba) y el precio sugerido; ya existente → sus variantes, creando (o reactivando) las tallas y colores
--      que llegaron y le faltaban.
--   4. `recibir_despacho`: cierra la recepción. Por cada línea, lo contado talla por talla (buenas al almacén, dañadas a la
--      cuarentena con su fila en `prendas_danadas`), el costo que corrigió quien recibe (promedio ponderado con TODAS las unidades
--      que entran), lo que faltó o sobró con su causa, y lo que no estaba en la guía. Un lote por proveedor. Las entradas se cargan
--      a las líneas del papel vigentes hasta su cupo (decisión 9: lo que pase entra sin papel), así `compras_no_sobrerecibida` nunca
--      salta. Costo atípico: pide confirmarlo por línea. Idempotente por token + huella; la versión del envío manda.
--   5. Lecturas (Recibir u Órdenes de compra, como las de la fase 3): `fn_envios_por_recibir` (los envíos en camino y abiertos de una
--      sede, con su estado y si quien mira hizo alguna de sus órdenes), `fn_ordenes_directas_por_recibir`, `fn_envio_detalle`
--      ampliada (categoría, marca y orden como objetos, precio sugerido, y si está cerrado, cómo se cerró) y `fn_prendas_para_recibir`.
--
-- DESCARTÉ:
--   · Ampliar `fn_envios_por_abrir` (fase 3) como pedía el contrato: es `returns table`, y cambiarle las columnas obliga a borrarla y
--     crearla; la prueba de la fase 3 vuelve a pegar su migración (`create or replace` con las columnas viejas) y fallaría con «cannot
--     change return type» en el CI, donde ya estaría esta. Va como `fn_envios_por_recibir` (jsonb: sumarle llaves nunca rompe nada), y
--     `fn_envios_por_abrir` queda como la dejó la fase 3.
--   · Reusar `recibir_envio`, `recibir_compras` y `cerrar_linea_compra`: topan por tienda contra `compra_item_destinos` y rechazan las
--     líneas sin prenda. La recepción de un envío topa línea por línea contra el cupo del papel (facturado − recibido − cerrado).
--   · Promediar el costo una vez por movimiento: con el redondeo a 2 decimales de cada paso, partir una variante en dos entradas
--     (almacén y cuarentena, o dos líneas del papel) daría otro costo que entrarla junta. Se promedia UNA vez por línea y variante,
--     con todas sus unidades, antes de aplicar sus movimientos.
--   · Juzgar solo los costos mayores que 0 (como `recibir_lote`): aquí el costo viene puesto desde la orden, y dejarlo en 0 es un
--     cambio que vale la pena confirmar («sin costo»), como dice el contrato.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013001000. Solo funciones: sin tablas, sin políticas ni
-- `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). `fn_envio_detalle` se reemplaza entera
-- (es de la fase 3 y conserva todo lo que ya devolvía, salvo `categoria`, `marca` y `orden`, que pasan a objetos: la web de la fase 3
-- solo lee su `version`). Se puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- ---------- 0. Piezas internas ----------
-- Quién mira (la persona de la cuenta; una terminal no es nadie): para avisar «tú hiciste esta orden» antes de que la base lo frene.
create or replace function retail.fn_recepcion_quien_mira()
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select p.id from public.personas p where p.auth_user_id = auth.uid() limit 1;
$$;
comment on function retail.fn_recepcion_quien_mira() is
  'ADR-0362 (fase 4): la persona de la cuenta que mira (null en una terminal o sin sesión). Interna: la usan las lecturas de Recibir.';
revoke all on function retail.fn_recepcion_quien_mira() from public, anon, authenticated;

-- La sede del envío y la decisión 17. Quien firma (el responsable) no hizo ninguna de las órdenes del envío, ni siendo líder.
create or replace function retail.fn_recepcion_exigir(p_despacho_id uuid, p_ubicacion_id uuid, p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Este envío va a %: lo recibe esa tienda',
      coalesce((select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id), 'otra sede')
      using errcode = '42501', hint = 'recibir_otra_sede';
  end if;
  if p_actor is not null and exists (
    select 1
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.despacho_id = p_despacho_id
       and o.creada_por = p_actor
  ) then
    raise exception 'Hiciste esta orden: la tiene que recibir otra persona de la tienda'
      using errcode = '42501', hint = 'recibir_quien_compro';
  end if;
end;
$$;
comment on function retail.fn_recepcion_exigir(uuid, uuid, uuid) is
  'ADR-0362 (fase 4): la sede del envío (fn_puede_operar_ubicacion) y la decisión 17 (quien firma no hizo ninguna de sus órdenes). '
  'Interna.';
revoke all on function retail.fn_recepcion_exigir(uuid, uuid, uuid) from public, anon, authenticated;

-- Lee las prendas contadas de una línea (o de algo fuera de la guía) y las devuelve limpias: [{variante_id, cantidad, danadas,
-- solucion}]. Solo la forma: si la prenda existe y es de esa categoría y marca se mira después, con los candados tomados.
create or replace function retail.fn_recepcion_leer_variantes(p_variantes jsonb, p_donde text)
returns jsonb
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_salida jsonb := '[]'::jsonb;
  v_v jsonb;
  v_id uuid;
  v_cantidad numeric;
  v_danadas numeric;
  v_solucion text;
  v_vistos uuid[] := '{}';
begin
  if p_variantes is null or jsonb_typeof(p_variantes) = 'null' then
    return v_salida;
  end if;
  if jsonb_typeof(p_variantes) <> 'array' then
    raise exception 'Las prendas de % no se entienden: recarga la pantalla', p_donde using hint = 'recepcion_variantes';
  end if;
  for v_v in select e.value from jsonb_array_elements(p_variantes) e loop
    if jsonb_typeof(v_v) <> 'object' then
      raise exception 'Las prendas de % no se entienden: recarga la pantalla', p_donde using hint = 'recepcion_variantes';
    end if;
    begin
      v_id := nullif(btrim(v_v ->> 'variante_id'), '')::uuid;
    exception when others then
      raise exception 'Una talla o color de % no se entiende: recarga la pantalla', p_donde using hint = 'recepcion_variantes';
    end;
    begin
      v_cantidad := coalesce(nullif(btrim(v_v ->> 'cantidad'), '')::numeric, 0);
      v_danadas := coalesce(nullif(btrim(v_v ->> 'danadas'), '')::numeric, 0);
    exception when others then
      raise exception 'Una cantidad de % no se entiende: escribe solo números', p_donde using hint = 'recepcion_cantidad';
    end;
    v_solucion := nullif(btrim(coalesce(v_v ->> 'danada_solucion', '')), '');
    if v_id is null then
      raise exception 'A una de las prendas de % le falta su talla y color: recarga la pantalla', p_donde using hint = 'recepcion_variantes';
    end if;
    if v_id = any(v_vistos) then
      raise exception 'En % se repite una talla y color: cuéntala una sola vez', p_donde using hint = 'recepcion_variante_repetida';
    end if;
    v_vistos := v_vistos || v_id;
    if v_cantidad <> trunc(v_cantidad) or v_cantidad < 0 or v_cantidad > 99999 then
      raise exception 'Las cantidades de % van de 0 a 99 999, sin decimales', p_donde using hint = 'recepcion_cantidad';
    end if;
    if v_danadas <> trunc(v_danadas) or v_danadas < 0 or v_danadas > v_cantidad then
      raise exception 'Las dañadas de % van de 0 a lo que llegó de esa talla y color', p_donde using hint = 'recepcion_danadas';
    end if;
    if v_danadas > 0 and (v_solucion is null or v_solucion not in ('pendiente', 'sin_solucion')) then
      raise exception 'En % llegaron prendas dañadas: di si tienen arreglo', p_donde using hint = 'recepcion_danada_solucion';
    end if;
    v_salida := v_salida || jsonb_build_object(
      'variante_id', v_id, 'cantidad', v_cantidad::integer, 'danadas', v_danadas::integer,
      'solucion', case when v_danadas > 0 then v_solucion end);
  end loop;
  return v_salida;
end;
$$;
comment on function retail.fn_recepcion_leer_variantes(jsonb, text) is
  'ADR-0362 (fase 4): valida la forma de las prendas contadas de una línea y las devuelve limpias. Interna.';
revoke all on function retail.fn_recepcion_leer_variantes(jsonb, text) from public, anon, authenticated;

-- Cómo se cerró: la respuesta de recibir_despacho (también en un reintento) y el resumen del detalle de un envío cerrado.
create or replace function retail.fn_recepcion_resultado(p_despacho_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'despacho_id', d.id,
           'numero', retail.fn_envio_numero_texto(d.numero),
           'lotes', coalesce((select jsonb_agg(l.id order by l.proveedor_id) from retail.lotes l where l.despacho_id = d.id), '[]'::jsonb),
           'unidades', coalesce((select sum(r.cantidad) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'buenas', coalesce((select sum(r.cantidad - r.danadas) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'danadas', coalesce((select sum(r.danadas) from retail.despacho_recibidos r where r.despacho_id = d.id), 0)::integer,
           'faltan', coalesce((select sum(x.cantidad) from retail.despacho_diferencias x
                                where x.despacho_id = d.id and x.tipo = 'faltante'), 0)::integer,
           'sobran', coalesce((select sum(x.cantidad) from retail.despacho_diferencias x
                                where x.despacho_id = d.id and x.tipo = 'sobrante'), 0)::integer
         )
    from retail.despachos d
   where d.id = p_despacho_id;
$$;
comment on function retail.fn_recepcion_resultado(uuid) is
  'ADR-0362 (fase 4): {despacho_id, numero, lotes, unidades, buenas, danadas, faltan, sobran} de un envío recibido. Interna.';
revoke all on function retail.fn_recepcion_resultado(uuid) from public, anon, authenticated;

-- ---------- 1. Abrir un envío («Empezar a recibir») ----------
create or replace function retail.abrir_despacho(p_despacho_id uuid, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_version integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío se bloquea: abrir y anular (o dos personas abriendo) se ponen en fila, y la segunda ve lo que dejó la primera.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  if v_despacho.estado = 'abierto' then
    -- Doble clic, dos pestañas u otra persona que ya lo abrió: está hecho, se devuelve como quedó.
    return jsonb_build_object('despacho_id', v_despacho.id, 'numero', retail.fn_envio_numero_texto(v_despacho.numero),
                              'estado', 'abierto', 'version', v_despacho.version);
  end if;
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  update retail.despachos d
     set estado = 'abierto',
         abierto_por = v_actor,
         abierto_en = now()
   where d.id = p_despacho_id
  returning d.version into v_version;

  return jsonb_build_object('despacho_id', p_despacho_id, 'numero', retail.fn_envio_numero_texto(v_despacho.numero),
                            'estado', 'abierto', 'version', v_version);
end;
$$;
comment on function retail.abrir_despacho(uuid, integer) is
  'ADR-0362 (fase 4): «Empezar a recibir»: un envío en camino pasa a abierto (abierto_por/en; la compradora ya no lo anula). Módulo '
  'Recibir, la sede del envío y la decisión 17. Ya abierto, devuelve lo mismo; versión vieja: PT409. Devuelve {despacho_id, numero, '
  'estado, version}.';
revoke all on function retail.abrir_despacho(uuid, integer) from public, anon;
grant execute on function retail.abrir_despacho(uuid, integer) to authenticated, service_role;

-- ---------- 2. Una orden «directo» que llegó sin guía (decisión 48) ----------
create or replace function retail.recibir_orden_sin_envio(p_orden_id uuid, p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_orden record;
  v_huella text;
  v_existente record;
  v_item record;
  v_facturado integer;
  v_enviado integer;
  v_queda integer;
  v_compra_item uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_despacho_id uuid;
  v_numero integer;
  v_version integer;
  v_restriccion text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- La orden y sus líneas pedidas se bloquean en el mismo orden que crear_envio (orden → líneas): dos personas pulsando «Recibir sin
  -- guía» a la vez, o la compradora enviando lo mismo, se ponen en fila y la segunda ve lo que dejó la primera.
  select o.id, o.numero, o.estado, o.ubicacion_destino_id, o.creada_por, o.proveedor_id, u.nombre as sede, pr.nombre as proveedor
    into v_orden
    from retail.ordenes_compra o
    join retail.proveedores pr on pr.id = o.proveedor_id
    left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
   where o.id = p_orden_id
     for share of o;
  if not found then
    raise exception 'Esa orden de compra no existe' using hint = 'orden_compra_no_existe';
  end if;
  perform 1 from retail.orden_compra_items i where i.orden_compra_id = p_orden_id order by i.id for update;

  -- Doble clic o reintento sin red: el envío ya se creó y se devuelve. El mismo token con otra orden no es un reintento.
  v_huella := md5('recibir_orden_sin_envio:' || p_orden_id::text);
  if p_token is not null then
    for v_existente in select d.id, d.numero, d.estado, d.version, d.huella_envio from retail.despachos d where d.token_cliente = p_token loop
      if v_existente.huella_envio = v_huella then
        return jsonb_build_object('despacho_id', v_existente.id, 'numero', retail.fn_envio_numero_texto(v_existente.numero),
                                  'estado', v_existente.estado, 'version', v_existente.version);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'envio_otro_envio';
    end loop;
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se recibe' using hint = 'orden_compra_anulada';
  end if;
  if v_orden.ubicacion_destino_id is null then
    raise exception 'Esta orden es «Por repartir»: llega a Lima y se recibe con los envíos que salen de ahí'
      using hint = 'orden_por_repartir';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_orden.ubicacion_destino_id) then
    raise exception 'Esta orden llega a %: la recibe esa tienda', v_orden.sede using errcode = '42501', hint = 'recibir_otra_sede';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_orden.creada_por = v_actor then
    raise exception 'Hiciste esta orden: la tiene que recibir otra persona de la tienda'
      using errcode = '42501', hint = 'recibir_quien_compro';
  end if;

  -- Lo que le queda por enviar, línea por línea, con las reglas de crear_envio: lo pedido o lo facturado, lo mayor, menos lo enviado
  -- vigente; el precio neto congelado y la línea del papel si hay UNA sola vigente.
  for v_item in
    select i.id, i.cantidad, i.subtotal, i.categoria_id, i.marca_id, i.descripcion
      from retail.orden_compra_items i
     where i.orden_compra_id = p_orden_id
     order by i.posicion
  loop
    v_facturado := (select coalesce(sum(ci.cantidad), 0)::integer
                      from retail.compra_items ci
                      join retail.compras c on c.id = ci.compra_id
                     where ci.orden_compra_item_id = v_item.id and c.estado = 'vigente');
    v_enviado := (select coalesce(sum(di.cantidad), 0)::integer
                    from retail.despacho_items di
                    join retail.despachos d on d.id = di.despacho_id
                   where di.orden_compra_item_id = v_item.id and d.estado in ('en_camino', 'abierto', 'cerrado'));
    v_queda := greatest(greatest(v_item.cantidad, v_facturado) - v_enviado, 0);
    if v_queda > 0 then
      v_compra_item := (select case when count(*) = 1 then (array_agg(ci.id))[1] end
                          from retail.compra_items ci
                          join retail.compras c on c.id = ci.compra_id
                         where ci.orden_compra_item_id = v_item.id and c.estado = 'vigente');
      v_lineas := v_lineas || jsonb_build_object(
        'orden_compra_item_id', v_item.id, 'compra_item_id', v_compra_item, 'cantidad', v_queda,
        'categoria_id', v_item.categoria_id, 'marca_id', v_item.marca_id, 'descripcion', v_item.descripcion,
        'precio_unitario', round(v_item.subtotal / v_item.cantidad, 2));
    end if;
  end loop;

  if jsonb_array_length(v_lineas) = 0 then
    -- Ya no le queda nada por enviar. Si otra persona ya empezó a recibirla en su sede, se entra a esa misma recepción.
    for v_existente in
      select d.id, d.numero, d.estado, d.version
        from retail.despachos d
       where d.estado = 'abierto'
         and d.ubicacion_destino_id = v_orden.ubicacion_destino_id
         and exists (select 1 from retail.despacho_items di
                       join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                      where di.despacho_id = d.id and i.orden_compra_id = p_orden_id)
       order by d.numero desc
    loop
      return jsonb_build_object('despacho_id', v_existente.id, 'numero', retail.fn_envio_numero_texto(v_existente.numero),
                                'estado', v_existente.estado, 'version', v_existente.version);
    end loop;
    raise exception 'A esta orden ya no le queda nada por recibir sin guía: lo que falta ya llegó o viene en un envío'
      using hint = 'orden_sin_pendiente';
  end if;

  begin
    insert into retail.despachos (ubicacion_destino_id, numero_guia, nota, despachado_por, token_cliente, huella_envio)
    values (v_orden.ubicacion_destino_id, null, 'Llegó directo a la tienda, sin guía', v_actor, p_token, v_huella)
    returning id, numero into v_despacho_id, v_numero;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'despachos_token_cliente_key' then
      for v_existente in select d.id, d.numero, d.estado, d.version, d.huella_envio from retail.despachos d where d.token_cliente = p_token loop
        if v_existente.huella_envio = v_huella then
          return jsonb_build_object('despacho_id', v_existente.id, 'numero', retail.fn_envio_numero_texto(v_existente.numero),
                                    'estado', v_existente.estado, 'version', v_existente.version);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'envio_otro_envio';
    end if;
    raise;
  end;

  insert into retail.despacho_items (despacho_id, orden_compra_item_id, compra_item_id, cantidad, categoria_id, marca_id, descripcion,
                                     precio_unitario)
  select v_despacho_id, (l ->> 'orden_compra_item_id')::uuid, (l ->> 'compra_item_id')::uuid, (l ->> 'cantidad')::integer,
         (l ->> 'categoria_id')::uuid, (l ->> 'marca_id')::uuid, l ->> 'descripcion', (l ->> 'precio_unitario')::numeric
    from jsonb_array_elements(v_lineas) l;

  -- Abierto de una vez: quien lo recibe es quien lo abre.
  update retail.despachos d
     set estado = 'abierto',
         abierto_por = v_actor,
         abierto_en = now()
   where d.id = v_despacho_id
  returning d.version into v_version;

  -- Actividad (ADR-0207), sin montos. Si falla, el envío igual queda guardado.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_guia',
      'empezó a recibir sin guía la ' || retail.fn_orden_compra_numero_texto(v_orden.numero) || ' (' || v_orden.proveedor || ') en la '
        || retail.fn_envio_numero_texto(v_numero),
      v_actor, retail.fn_actividad_terminal_ahora(), v_orden.ubicacion_destino_id, null,
      'despachos', v_despacho_id::text, now(),
      jsonb_build_object('despacho_id', v_despacho_id, 'envio', retail.fn_envio_numero_texto(v_numero), 'orden_id', v_orden.id,
                         'orden', retail.fn_orden_compra_numero_texto(v_orden.numero)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el envío sin guía % (%)', v_numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', v_despacho_id, 'numero', retail.fn_envio_numero_texto(v_numero),
                            'estado', 'abierto', 'version', v_version);
end;
$$;
comment on function retail.recibir_orden_sin_envio(uuid, uuid) is
  'ADR-0362 (fase 4, decisión 48): una orden generada «directo» que llegó sin guía: crea un envío abierto con todo lo que le queda '
  'por enviar (reglas de crear_envio), nota «Llegó directo a la tienda, sin guía». Módulo Recibir, su sede y la decisión 17. '
  'Idempotente por token. Devuelve {despacho_id, numero, estado, version}.';
revoke all on function retail.recibir_orden_sin_envio(uuid, uuid) from public, anon;
grant execute on function retail.recibir_orden_sin_envio(uuid, uuid) to authenticated, service_role;

-- ---------- 3. La prenda de una línea: nueva o ya existente (decisiones 21 y 49) ----------
create or replace function retail.preparar_prenda_al_recibir(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_categoria_id uuid,
  p_marca_id uuid,
  p_producto_id uuid,
  p_referencia text,
  p_variantes jsonb,
  p_precio numeric,
  p_descripcion text,
  p_tejido_id uuid,
  p_patron_id uuid,
  p_confirmo_distinto boolean,
  p_token uuid,
  p_proveedor_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho record;
  v_linea record;
  v_categoria uuid;
  v_marca uuid;
  v_proveedor uuid;
  v_costo numeric;
  v_pedidas jsonb := '[]'::jsonb;
  v_e jsonb;
  v_talla uuid;
  v_color text;
  v_clave text;
  v_claves text[] := '{}';
  v_producto_id uuid;
  v_producto record;
  v_existente record;
  v_hermana_precio numeric;
  v_hermana_costo numeric;
  v_precio numeric;
  v_costo_nueva numeric;
  v_candidatos uuid[];
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  select d.id, d.numero, d.estado, d.ubicacion_destino_id into v_despacho from retail.despachos d where d.id = p_despacho_id;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;

  if p_despacho_item_id is not null then
    -- Una línea del envío: la categoría, la marca y el costo salen de ella; el proveedor, de su orden.
    select di.categoria_id, di.marca_id, di.precio_unitario, o.proveedor_id
      into v_linea
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
    end if;
    v_categoria := v_linea.categoria_id;
    v_marca := v_linea.marca_id;
    v_proveedor := v_linea.proveedor_id;
    v_costo := v_linea.precio_unitario;
  else
    -- Algo que no estaba en la guía (decisión 13): la categoría y la marca las elige quien recibe.
    if p_categoria_id is null or not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
      raise exception 'Elige una categoría activa para la prenda' using hint = 'recepcion_categoria';
    end if;
    if p_marca_id is null or not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Elige una marca activa para la prenda' using hint = 'recepcion_marca';
    end if;
    v_categoria := p_categoria_id;
    v_marca := p_marca_id;
    v_costo := 0;
    -- El proveedor: el elegido (uno de los del envío); si no, el único del envío, o el único del envío que ya trae esa marca.
    v_candidatos := array(select distinct o.proveedor_id
                            from retail.despacho_items di
                            join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                            join retail.ordenes_compra o on o.id = i.orden_compra_id
                           where di.despacho_id = p_despacho_id);
    if p_proveedor_id is not null then
      if not (p_proveedor_id = any(v_candidatos)) then
        raise exception 'Ese proveedor no viene en este envío: elige uno de los del envío' using hint = 'recepcion_proveedor';
      end if;
      v_proveedor := p_proveedor_id;
    elsif cardinality(v_candidatos) = 1 then
      v_proveedor := v_candidatos[1];
    else
      v_candidatos := array(select mp.proveedor_id from retail.marca_proveedores mp
                             where mp.marca_id = p_marca_id and mp.proveedor_id = any(v_candidatos));
      if cardinality(v_candidatos) <> 1 then
        raise exception 'Este envío trae varios proveedores: elige de cuál es esta prenda' using hint = 'recepcion_proveedor';
      end if;
      v_proveedor := v_candidatos[1];
    end if;
  end if;

  -- La matriz que llegó: [{talla_id, color_codigo}], cada combinación una sola vez.
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'Elige al menos una talla o un color de la prenda' using hint = 'recepcion_variantes';
  end if;
  for v_e in select e.value from jsonb_array_elements(p_variantes) e loop
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'Una talla o color no se entiende: recarga la pantalla' using hint = 'recepcion_variantes';
    end if;
    begin
      v_talla := nullif(btrim(v_e ->> 'talla_id'), '')::uuid;
    exception when others then
      raise exception 'Una talla no se entiende: recarga la pantalla' using hint = 'recepcion_variantes';
    end;
    v_color := nullif(btrim(coalesce(v_e ->> 'color_codigo', '')), '');
    v_clave := coalesce(v_talla::text, '') || '|' || coalesce(v_color, '');
    if v_clave = any(v_claves) then
      raise exception 'Repetiste la misma combinación de talla y color: cada una va una sola vez' using hint = 'recepcion_variantes';
    end if;
    v_claves := v_claves || v_clave;
    v_pedidas := v_pedidas || jsonb_build_object('talla_id', v_talla, 'color_codigo', v_color);
  end loop;
  if p_precio is not null and (p_precio < 0 or p_precio > 99999.99 or p_precio <> round(p_precio, 2)) then
    raise exception 'El precio de venta va de S/ 0.01 a S/ 99 999.99, con hasta dos decimales' using hint = 'recepcion_precio';
  end if;

  if p_producto_id is null then
    -- Una prenda NUEVA. La compra prueba que ese proveedor trae esa marca: la pareja se registra si faltaba [provisional].
    insert into retail.marca_proveedores (marca_id, proveedor_id) values (v_marca, v_proveedor) on conflict do nothing;
    -- La marca de transacción deja pasar a quien tiene Recibir por el candado de crear_producto_con_variantes (20261013001000), que
    -- sigue mandando en todo lo demás: nombre por marca, tejido y patrón, tallas, colores y precio, con sus mensajes tal cual.
    perform set_config('retail.alta_al_recibir', 'si', true);
    begin
      v_producto_id := retail.crear_producto_con_variantes(
        p_referencia => p_referencia,
        p_categoria_id => v_categoria,
        p_variantes => (select jsonb_agg(x.value || jsonb_build_object('precio', p_precio, 'costo', v_costo) order by x.ordinality)
                          from jsonb_array_elements(v_pedidas) with ordinality x),
        p_descripcion => p_descripcion,
        p_token => p_token,
        p_tejido_id => p_tejido_id,
        p_patron_id => p_patron_id,
        p_confirmo_distinto => coalesce(p_confirmo_distinto, false),
        p_etiqueta_ids => null,
        p_marca_id => v_marca,
        p_proveedor_id => v_proveedor);
    exception when others then
      perform set_config('retail.alta_al_recibir', '', true);
      raise;
    end;
    perform set_config('retail.alta_al_recibir', '', true);
  else
    v_producto_id := p_producto_id;
  end if;

  -- La prenda (nueva o ya existente) se bloquea: dos personas sumándole la misma talla a la vez se ponen en fila.
  select pr.id, pr.referencia, pr.codigo, pr.estado, pr.estado_alta, pr.categoria_id, pr.marca_id
    into v_producto
    from retail.productos pr
   where pr.id = v_producto_id
     for no key update;
  if not found then
    raise exception 'Esa prenda no existe: recarga la pantalla' using hint = 'recepcion_prenda_no_existe';
  end if;
  if v_producto.categoria_id is distinct from v_categoria or v_producto.marca_id is distinct from v_marca then
    raise exception 'Esa prenda es de otra categoría o marca: elige una de % · %',
      (select c.nombre from retail.categorias c where c.id = v_categoria), (select m.nombre from retail.marcas m where m.id = v_marca)
      using hint = 'recepcion_prenda_ajena';
  end if;
  if v_producto.estado <> 'activo' or v_producto.estado_alta = 'rechazado' then
    raise exception 'Esa prenda no está activa: elige otra o créala de nuevo' using hint = 'recepcion_prenda_inactiva';
  end if;

  -- Las tallas y colores que llegaron y la prenda no tenía: se crean (o se reactivan, si estaban desactivados). Mismas reglas que el
  -- alta: talla activa y habilitada en la categoría, color activo, precio (el sugerido, o si no viene, el de la prenda) y
  -- combinación única. El código lo pone variantes_asignar_codigo.
  for v_e in select e.value from jsonb_array_elements(v_pedidas) e loop
    v_talla := (v_e ->> 'talla_id')::uuid;
    v_color := v_e ->> 'color_codigo';
    select v.id, v.activo into v_existente
      from retail.variantes v
     where v.producto_id = v_producto_id
       and v.talla_id is not distinct from v_talla
       and v.color_codigo is not distinct from v_color;
    if found then
      if not v_existente.activo then
        update retail.variantes v set activo = true where v.id = v_existente.id;
      end if;
      continue;
    end if;
    if v_talla is not null then
      if not exists (select 1 from retail.tallas t where t.id = v_talla and t.activo) then
        raise exception 'Una de las tallas elegidas ya no está activa en el vocabulario' using hint = 'recepcion_talla';
      end if;
      if not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = v_categoria and ct.talla_id = v_talla) then
        raise exception 'Una de las tallas elegidas no está habilitada para esta categoría' using hint = 'recepcion_talla';
      end if;
    end if;
    if v_color is not null and not exists (select 1 from retail.colores c where c.codigo = v_color and c.activo) then
      raise exception 'Uno de los colores elegidos ya no está activo en el vocabulario' using hint = 'recepcion_color';
    end if;
    -- El precio y el costo de una hermana (la del mismo color primero, y la de mayor precio a igualdad), como censo_crear_variante.
    v_hermana_precio := null;
    v_hermana_costo := null;
    for v_hermana_precio, v_hermana_costo in
      select v.precio, v.costo
        from retail.variantes v
       where v.producto_id = v_producto_id and v.activo
       order by (v.color_codigo is not distinct from v_color) desc, v.precio desc
       limit 1
    loop
      exit;
    end loop;
    v_precio := coalesce(p_precio, v_hermana_precio);
    if v_precio is null or v_precio < 0 then
      raise exception 'Escribe el precio de venta de la prenda' using hint = 'recepcion_precio';
    end if;
    if v_precio = 0 and not retail.fn_categoria_admite_precio_cero(v_categoria) then
      raise exception 'Cada variante necesita un precio de venta mayor que S/ 0.' using hint = 'sin_precio';
    end if;
    v_costo_nueva := case when coalesce(v_hermana_costo, 0) > 0 then v_hermana_costo else coalesce(v_costo, 0) end;
    insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo)
    values (v_producto_id, v_talla, v_color, v_precio, v_costo_nueva);
  end loop;

  return jsonb_build_object(
    'producto_id', v_producto.id,
    'nombre', v_producto.referencia,
    'codigo', (select pr.codigo from retail.productos pr where pr.id = v_producto.id),
    'estado_alta', v_producto.estado_alta,
    'variantes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'talla_id', v.talla_id,
               'talla', t.valor,
               'color_codigo', v.color_codigo,
               'color', c.nombre,
               'color_hex', c.hex,
               'codigo', v.codigo
             ) order by t.valor nulls first, c.nombre nulls first, v.id)
        from retail.variantes v
        left join retail.tallas t on t.id = v.talla_id
        left join retail.colores c on c.codigo = v.color_codigo
       where v.producto_id = v_producto.id and v.activo
    ), '[]'::jsonb));
end;
$$;
comment on function retail.preparar_prenda_al_recibir(uuid, uuid, uuid, uuid, uuid, text, jsonb, numeric, text, uuid, uuid, boolean, uuid, uuid) is
  'ADR-0362 (fase 4, decisiones 21 y 49): la prenda de una línea de un envío (o de algo fuera de la guía). p_producto_id nulo: la crea '
  '(crear_producto_con_variantes con la marca retail.alta_al_recibir; nace pendiente si quien la crea no edita el catálogo). Dado: '
  'una prenda activa de esa categoría y marca, a la que se le crean o reactivan las tallas y colores que llegaron. Módulo Recibir, la '
  'sede del envío y la decisión 17. Devuelve {producto_id, nombre, codigo, estado_alta, variantes}.';
revoke all on function retail.preparar_prenda_al_recibir(uuid, uuid, uuid, uuid, uuid, text, jsonb, numeric, text, uuid, uuid, boolean, uuid, uuid)
  from public, anon;
grant execute on function retail.preparar_prenda_al_recibir(uuid, uuid, uuid, uuid, uuid, text, jsonb, numeric, text, uuid, uuid, boolean, uuid, uuid)
  to authenticated, service_role;

-- ---------- 4. Recibir el envío (cerrar) ----------
-- `p_lineas`: una entrada por CADA línea del envío, una sola vez: { despacho_item_id, costo_unitario (null = el de la línea),
-- confirma_costo, variantes: [{variante_id, cantidad, danadas, danada_solucion}], faltante_causa, sobrante_causa, nota? }.
-- `p_extras`: lo que no estaba en la guía: { proveedor_id (null = el único del envío), categoria_id, marca_id, costo_unitario,
-- confirma_costo, variantes, sobrante_causa, nota? }.
create or replace function retail.recibir_despacho(
  p_despacho_id uuid,
  p_version integer,
  p_lineas jsonb,
  p_extras jsonb default '[]'::jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_proveedores uuid[];
  v_unidades jsonb := '[]'::jsonb;
  v_vistas uuid[] := '{}';
  v_e jsonb;
  v_pos integer;
  v_item record;
  v_id uuid;
  v_costo numeric;
  v_vars jsonb;
  v_contado integer;
  v_falt text;
  v_sobr text;
  v_nota_u text;
  v_donde text;
  v_prov uuid;
  v_cat uuid;
  v_marca uuid;
  v_variantes uuid[];
  v_compra_items uuid[];
  v_malo record;
  v_atipicos jsonb;
  v_sin_marca jsonb;
  v_sub_almacen uuid;
  v_sub_cuarentena uuid;
  v_lote_de jsonb := '{}'::jsonb;
  v_lote uuid;
  v_n_atipicos integer;
  v_u jsonb;
  v_v jsonb;
  v_ci_ids uuid[];
  v_ci_cupo integer[];
  v_c record;
  v_k integer;
  v_var uuid;
  v_buenas integer;
  v_danadas integer;
  v_resto integer;
  v_toma integer;
  v_ci uuid;
  v_idx integer;
  v_ch_ci uuid[];
  v_ch_b integer[];
  v_ch_d integer[];
  v_tipo text;
  v_movs uuid[];
  v_mov_b uuid;
  v_mov_d uuid;
  v_m uuid;
  v_i integer;
  v_res jsonb;
  v_desc text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados, siempre en el mismo orden (ADR-0190): el envío → sus órdenes → sus líneas pedidas → los comprobantes y sus líneas →
  -- las variantes → el stock. Primero el envío: dos personas cerrando a la vez se ponen en fila y la segunda ve lo que dejó la primera.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma recepción (mismo token, misma huella) ya se guardó y se devuelve lo mismo, aunque quien
  -- la hizo ya no esté de turno (comprobar algo guardado no escribe nada). El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('lineas', p_lineas, 'extras', v_extras, 'nota', p_nota)::text);
  if p_token is not null then
    if v_despacho.recepcion_token = p_token then
      if v_despacho.recepcion_huella = v_huella then
        return retail.fn_recepcion_resultado(v_despacho.id);
      end if;
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
    if exists (select 1 from retail.despachos d where d.recepcion_token = p_token and d.id <> p_despacho_id) then
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recepcion_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Falta lo que se contó de cada línea: recarga la pantalla' using hint = 'recepcion_lineas';
  end if;
  if jsonb_typeof(v_extras) <> 'array' then
    raise exception 'Lo que no estaba en la guía no se entiende: recarga la pantalla' using hint = 'recepcion_extra';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.
  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by o.id
      for share;
  perform 1
     from retail.orden_compra_items i
    where i.id in (select di.orden_compra_item_id from retail.despacho_items di where di.despacho_id = p_despacho_id)
    order by i.id
      for update;
  v_proveedores := array(select distinct o.proveedor_id
                           from retail.despacho_items di
                           join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                           join retail.ordenes_compra o on o.id = i.orden_compra_id
                          where di.despacho_id = p_despacho_id);

  -- ---- Las líneas del envío: todas, una sola vez. Solo la forma y las cuentas; las prendas se miran con los candados tomados. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end if;
    begin
      v_id := nullif(btrim(v_e ->> 'despacho_item_id'), '')::uuid;
    exception when others then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end;
    select di.id, di.cantidad, di.precio_unitario, di.categoria_id, di.marca_id, di.compra_item_id, di.orden_compra_item_id,
           i.posicion, o.numero as orden_numero, o.proveedor_id,
           concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      into v_item
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.id = v_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'La línea % no es de este envío: recarga la pantalla', v_pos using hint = 'recepcion_linea_ajena';
    end if;
    if v_id = any(v_vistas) then
      raise exception 'La línea % se repite: cada línea del envío va una sola vez', v_pos using hint = 'recepcion_linea_repetida';
    end if;
    v_vistas := v_vistas || v_id;
    v_donde := v_item.etiqueta;

    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    v_costo := coalesce(v_costo, v_item.precio_unitario);
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    v_falt := nullif(btrim(coalesce(v_e ->> 'faltante_causa', '')), '');
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');

    -- Lo que faltó (decisión 14) o sobró (decisión 15): la causa la elige quien recibe, y solo cuando hace falta.
    if v_contado < v_item.cantidad then
      if v_falt is null then
        raise exception 'Faltan % de %: elige qué pasó', v_item.cantidad - v_contado, v_donde using hint = 'recepcion_faltante_causa';
      end if;
      if v_falt not in ('no_vino', 'se_perdio', 'otra_sede') then
        raise exception 'No se entiende qué pasó con lo que falta de %: elige una opción', v_donde using hint = 'recepcion_faltante_causa';
      end if;
    elsif v_falt is not null then
      raise exception 'De % no falta nada: quita «qué pasó»', v_donde using hint = 'recepcion_faltante_causa';
    end if;
    if v_contado > v_item.cantidad then
      if v_sobr is null then
        raise exception 'Vinieron % de más de %: elige qué pasa con ellas', v_contado - v_item.cantidad, v_donde
          using hint = 'recepcion_sobrante_causa';
      end if;
      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_donde using hint = 'recepcion_sobrante_causa';
      end if;
    elsif v_sobr is not null then
      raise exception 'De % no vino nada de más: quita «qué pasa con lo de más»', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;

    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'linea', 'despacho_item_id', v_item.id, 'extra', null, 'orden_numero', v_item.orden_numero, 'posicion', v_item.posicion,
      'orden_compra_item_id', v_item.orden_compra_item_id, 'compra_item_id', v_item.compra_item_id,
      'proveedor_id', v_item.proveedor_id, 'categoria_id', v_item.categoria_id, 'marca_id', v_item.marca_id,
      'enviado', v_item.cantidad, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', v_falt, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;
  for v_item in
    select di.id, i.posicion, o.numero as orden_numero, concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.despacho_id = p_despacho_id and not (di.id = any(v_vistas))
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta contar % (línea % de la %): cuéntala, aunque no haya llegado nada', v_item.etiqueta, v_item.posicion,
      retail.fn_orden_compra_numero_texto(v_item.orden_numero) using hint = 'recepcion_falta_linea';
  end loop;

  -- ---- Lo que no estaba en la guía (decisión 13): todo sobra, con su causa. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(v_extras) e loop
    v_pos := v_pos + 1;
    v_donde := 'lo que no estaba en la guía (fila ' || v_pos || ')';
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end if;
    begin
      v_prov := nullif(btrim(v_e ->> 'proveedor_id'), '')::uuid;
      v_cat := nullif(btrim(v_e ->> 'categoria_id'), '')::uuid;
      v_marca := nullif(btrim(v_e ->> 'marca_id'), '')::uuid;
    exception when others then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end;
    if v_prov is null then
      if cardinality(v_proveedores) <> 1 then
        raise exception 'Este envío trae varios proveedores: elige de cuál es %', v_donde using hint = 'recepcion_extra_proveedor';
      end if;
      v_prov := v_proveedores[1];
    elsif not (v_prov = any(v_proveedores)) then
      raise exception 'El proveedor de % no viene en este envío: elige uno de los del envío', v_donde using hint = 'recepcion_extra_proveedor';
    end if;
    if v_cat is null or not exists (select 1 from retail.categorias c where c.id = v_cat and c.activo) then
      raise exception 'Elige una categoría activa para %', v_donde using hint = 'recepcion_extra_categoria';
    end if;
    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Elige una marca activa para %', v_donde using hint = 'recepcion_extra_marca';
    end if;
    v_donde := concat_ws(' · ', (select c.nombre from retail.categorias c where c.id = v_cat),
                         (select m.nombre from retail.marcas m where m.id = v_marca)) || ' (fuera de la guía)';
    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    if v_costo is null then
      raise exception 'Escribe el costo de %', v_donde using hint = 'recepcion_costo';
    end if;
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    if v_contado = 0 then
      raise exception 'Cuenta lo que llegó de % o quítalo', v_donde using hint = 'recepcion_extra_vacio';
    end if;
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    if v_sobr is null or v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra') then
      raise exception 'Elige qué pasa con %', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;
    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'extra', 'despacho_item_id', null, 'extra', v_pos, 'orden_numero', null, 'posicion', null,
      'orden_compra_item_id', null, 'compra_item_id', null,
      'proveedor_id', v_prov, 'categoria_id', v_cat, 'marca_id', v_marca,
      'enviado', 0, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', null, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;

  -- ---- Los comprobantes de esas líneas y sus líneas (el papel), las variantes y el stock: en orden. ----
  v_variantes := array(select distinct (v ->> 'variante_id')::uuid
                         from jsonb_array_elements(v_unidades) u
                        cross join lateral jsonb_array_elements(u -> 'variantes') v);
  -- FOR KEY SHARE: un comprobante no se anula (anular_compra lo toma FOR UPDATE) mientras se le cargan entradas, y si se anuló justo
  -- antes, lo de abajo ya lo ve anulado. No choca con la escritura de `recibido_cantidad` (otra recepción del mismo papel espera
  -- en sus líneas, no aquí).
  perform 1
     from retail.compras c
    where c.id in (select ci.compra_id
                     from retail.compra_items ci
                     join retail.despacho_items di on di.orden_compra_item_id = ci.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by c.id
      for key share;
  v_compra_items := array(select ci.id
                            from retail.compra_items ci
                            join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
                            join retail.despacho_items di on di.orden_compra_item_id = ci.orden_compra_item_id
                           where di.despacho_id = p_despacho_id);
  perform retail.fn_bloquear_en_orden(v_despacho.ubicacion_destino_id, v_variantes, true, v_compra_items);

  -- ---- Cada prenda contada: existe, está activa y es de la categoría y marca de su línea. ----
  for v_malo in
    select u ->> 'donde' as donde, vr.id as variante_id, pr.estado, pr.estado_alta, vr.activo,
           (pr.categoria_id is not distinct from (u ->> 'categoria_id')::uuid
            and pr.marca_id is not distinct from (u ->> 'marca_id')::uuid) as de_la_linea
      from jsonb_array_elements(v_unidades) u
     cross join lateral jsonb_array_elements(u -> 'variantes') v
      left join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
      left join retail.productos pr on pr.id = vr.producto_id
     where vr.id is null
        or pr.categoria_id is distinct from (u ->> 'categoria_id')::uuid
        or pr.marca_id is distinct from (u ->> 'marca_id')::uuid
        or pr.estado <> 'activo' or pr.estado_alta = 'rechazado' or not vr.activo
     limit 1
  loop
    if v_malo.variante_id is null then
      raise exception 'Una de las prendas de % ya no existe: recarga la pantalla', v_malo.donde using hint = 'recepcion_prenda_no_existe';
    end if;
    if not v_malo.de_la_linea then
      raise exception 'Una de las prendas de % es de otra categoría o marca: elígela de nuevo', v_malo.donde
        using hint = 'recepcion_prenda_ajena';
    end if;
    raise exception 'Una de las prendas de % no está activa: elígela de nuevo', v_malo.donde using hint = 'recepcion_prenda_inactiva';
  end loop;

  -- ---- Costo atípico (decisión 18: quien recibe ve y corrige el costo). Las variantes ya están bloqueadas: su costo vigente no cambia
  -- mientras se compara. Se confirma por línea (`confirma_costo`), y lo confirma quien ve los costos al recibir. ----
  select jsonb_agg(jsonb_build_object(
           'despacho_item_id', u -> 'despacho_item_id', 'extra', u -> 'extra', 'variante_id', vr.id, 'motivo', x.motivo,
           'costo', (u ->> 'costo')::numeric, 'vigente', vr.costo, 'precio', vr.precio, 'sku', vr.codigo,
           'costo_unitario', (u ->> 'costo')::numeric, 'costo_vigente', vr.costo,
           'proveedor_id', u -> 'proveedor_id', 'confirmada', (u ->> 'confirma')::boolean
         ) order by (u ->> 'tipo') desc, (u ->> 'orden_numero')::integer, (u ->> 'posicion')::integer, (u ->> 'extra')::integer, vr.codigo)
    into v_atipicos
    from jsonb_array_elements(v_unidades) u
   cross join lateral jsonb_array_elements(u -> 'variantes') v
    join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
   cross join lateral (select retail.fn_costo_fuera_de_banda((u ->> 'costo')::numeric, vr.costo, vr.precio) as motivo) x
   where (v ->> 'cantidad')::integer > 0
     and x.motivo is not null;
  if v_atipicos is not null then
    if not retail.fn_ve_costos_al_recibir() then
      raise exception 'Hay un costo fuera de lo normal y tu rol no puede confirmarlo: pídeselo a quien ve los costos de Compras'
        using hint = 'recepcion_costo_atipico_sin_permiso';
    end if;
    select jsonb_agg(a - 'confirmada' - 'proveedor_id') into v_sin_marca
      from jsonb_array_elements(v_atipicos) a
     where not (a ->> 'confirmada')::boolean;
    if v_sin_marca is not null then
      raise exception 'Hay un costo fuera de lo normal: revísalo y confírmalo para recibir'
        using hint = 'recepcion_costo_atipico', detail = v_sin_marca::text;
    end if;
  end if;

  -- ---- Dónde entra: lo bueno al almacén, lo dañado a la cuarentena (decisión 23). ----
  v_sub_almacen := retail.fn_sububicacion_por_defecto(v_despacho.ubicacion_destino_id, 'entrada');
  v_sub_cuarentena := (select s.id from retail.sububicaciones s
                        where s.ubicacion_id = v_despacho.ubicacion_destino_id and s.tipo = 'cuarentena');
  if v_sub_cuarentena is null and exists (
    select 1 from jsonb_array_elements(v_unidades) u cross join lateral jsonb_array_elements(u -> 'variantes') v
     where (v ->> 'danadas')::integer > 0
  ) then
    raise exception 'Esta sede no separa la cuarentena: aquí no se reciben prendas dañadas' using hint = 'recepcion_sin_cuarentena';
  end if;

  -- ---- Un lote por proveedor que trajo algo (un fardo puede traer dos, decisión 11). ----
  for v_prov in
    select distinct (u ->> 'proveedor_id')::uuid
      from jsonb_array_elements(v_unidades) u
     where (u ->> 'contado')::integer > 0
     order by 1
  loop
    v_n_atipicos := coalesce((select count(*) from jsonb_array_elements(v_atipicos) a where (a ->> 'proveedor_id')::uuid = v_prov), 0);
    insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota, despacho_id)
    values (v_despacho.ubicacion_destino_id, v_prov, v_despacho.numero_guia, v_actor,
            concat_ws(' · ', 'Envío ' || v_envio, v_nota,
                      case when v_n_atipicos = 1 then 'Costo atípico confirmado en 1 talla o color'
                           when v_n_atipicos > 1 then 'Costo atípico confirmado en ' || v_n_atipicos || ' tallas o colores' end),
            p_despacho_id)
    returning id into v_lote;
    v_lote_de := v_lote_de || jsonb_build_object(v_prov::text, v_lote);
  end loop;

  -- ---- Lo que entra, línea por línea y variante por variante. ----
  for v_u in
    select u.value
      from jsonb_array_elements(v_unidades) u
     order by (u.value ->> 'tipo') desc, (u.value ->> 'orden_numero')::integer, (u.value ->> 'posicion')::integer,
              (u.value ->> 'extra')::integer
  loop
    v_lote := (v_lote_de ->> (v_u ->> 'proveedor_id'))::uuid;
    v_costo := (v_u ->> 'costo')::numeric;

    -- El papel (decisión 9): las líneas de comprobantes VIGENTES de esa línea pedida, con cupo (facturado − recibido − cerrado);
    -- primero la que nombra el envío, después las más antiguas. Lo que pase del cupo entra sin papel.
    v_ci_ids := '{}';
    v_ci_cupo := '{}';
    if v_u ->> 'tipo' = 'linea' then
      for v_c in
        select ci.id,
               ci.cantidad
                 - coalesce((select sum(mv.cantidad) from retail.movimientos mv where mv.compra_item_id = ci.id), 0)
                 - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0) as cupo
          from retail.compra_items ci
          join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
         where ci.orden_compra_item_id = (v_u ->> 'orden_compra_item_id')::uuid
         order by coalesce(ci.id = (v_u ->> 'compra_item_id')::uuid, false) desc, c.created_at, ci.id
      loop
        if v_c.cupo > 0 then
          v_ci_ids := array_append(v_ci_ids, v_c.id);
          v_ci_cupo := array_append(v_ci_cupo, v_c.cupo::integer);
        end if;
      end loop;
    end if;
    v_k := 1;

    for v_v in select x.value from jsonb_array_elements(v_u -> 'variantes') with ordinality x order by x.ordinality loop
      if (v_v ->> 'cantidad')::integer = 0 then
        continue;
      end if;
      v_var := (v_v ->> 'variante_id')::uuid;
      v_danadas := (v_v ->> 'danadas')::integer;
      v_buenas := (v_v ->> 'cantidad')::integer - v_danadas;

      -- Se reparte por el cupo del papel: primero las buenas, después las dañadas (también llegaron: cuentan como recibidas).
      v_ch_ci := '{}';
      v_ch_b := '{}';
      v_ch_d := '{}';
      foreach v_tipo in array array['buenas', 'danadas'] loop
        v_resto := case v_tipo when 'buenas' then v_buenas else v_danadas end;
        while v_resto > 0 loop
          if v_k <= coalesce(array_length(v_ci_ids, 1), 0) then
            v_toma := least(v_resto, v_ci_cupo[v_k]);
            v_ci := v_ci_ids[v_k];
            v_ci_cupo[v_k] := v_ci_cupo[v_k] - v_toma;
            if v_ci_cupo[v_k] = 0 then
              v_k := v_k + 1;
            end if;
          else
            v_toma := v_resto;
            v_ci := null;
          end if;
          v_idx := array_position(v_ch_ci, v_ci);
          if v_idx is null then
            v_ch_ci := array_append(v_ch_ci, v_ci);
            v_ch_b := array_append(v_ch_b, 0);
            v_ch_d := array_append(v_ch_d, 0);
            v_idx := array_length(v_ch_ci, 1);
          end if;
          if v_tipo = 'buenas' then
            v_ch_b[v_idx] := v_ch_b[v_idx] + v_toma;
          else
            v_ch_d[v_idx] := v_ch_d[v_idx] + v_toma;
          end if;
          v_resto := v_resto - v_toma;
        end loop;
      end loop;

      -- Las entradas (el stock todavía no se toca), su dañada y su fila de lo recibido.
      v_movs := '{}';
      for v_i in 1 .. coalesce(array_length(v_ch_ci, 1), 0) loop
        v_mov_b := null;
        v_mov_d := null;
        if v_ch_b[v_i] > 0 then
          insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id,
                                          usuario_id, nota)
          values (v_var, v_despacho.ubicacion_destino_id, v_sub_almacen, 'entrada', v_ch_b[v_i], 'recepcion', v_lote, v_ch_ci[v_i],
                  v_actor, 'Llegó en ' || v_envio)
          returning id into v_mov_b;
          v_movs := array_append(v_movs, v_mov_b);
        end if;
        if v_ch_d[v_i] > 0 then
          insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id,
                                          usuario_id, nota)
          values (v_var, v_despacho.ubicacion_destino_id, v_sub_cuarentena, 'entrada', v_ch_d[v_i], 'recepcion', v_lote, v_ch_ci[v_i],
                  v_actor, 'Llegó dañada en ' || v_envio)
          returning id into v_mov_d;
          v_movs := array_append(v_movs, v_mov_d);
          -- La dañada, en cuarentena con su fila (decisiones 23 y 27): se arregla, liquida, regala, desecha o devuelve desde
          -- Existencias. Sin proveedor: esa columna es solo de «devuelta al proveedor» (se lee del lote).
          insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte, nota)
          values (v_var, v_despacho.ubicacion_destino_id, v_ch_d[v_i], v_mov_d, 'Llegó dañada en ' || v_envio,
                  case v_v ->> 'solucion' when 'pendiente' then 'Tiene arreglo' else 'Sin arreglo' end);
        end if;
        insert into retail.despacho_recibidos (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id,
                                               variante_id, cantidad, danadas, danada_solucion, costo_unitario, movimiento_id,
                                               movimiento_danada_id, compra_item_id, creado_por)
        values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
                (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, v_var, v_ch_b[v_i] + v_ch_d[v_i], v_ch_d[v_i],
                case when v_ch_d[v_i] > 0 then v_v ->> 'solucion' end, v_costo, v_mov_b, v_mov_d, v_ch_ci[v_i], v_actor);
      end loop;

      -- El costo: UNA vez por variante, con todas sus unidades (buenas y dañadas) y ANTES de aplicar sus entradas [provisional:
      -- también lo que sobró, aun si es regalo, al costo de la línea]. Después, el stock.
      perform retail.fn_recalcular_costo_variante(v_var, v_buenas + v_danadas, v_costo, 'compra', v_movs[1]);
      foreach v_m in array v_movs loop
        perform retail.fn_aplicar_movimiento(v_m);
      end loop;
    end loop;

    -- Lo que faltó o sobró: la deuda que resuelve la fase 5.
    if v_u ->> 'tipo' = 'linea' and (v_u ->> 'contado')::integer < (v_u ->> 'enviado')::integer then
      insert into retail.despacho_diferencias (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id, tipo,
                                               causa, cantidad, costo_unitario, nota, creado_por)
      values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, null, (v_u ->> 'proveedor_id')::uuid, (v_u ->> 'categoria_id')::uuid,
              (v_u ->> 'marca_id')::uuid, 'faltante', v_u ->> 'faltante_causa',
              (v_u ->> 'enviado')::integer - (v_u ->> 'contado')::integer, v_costo, v_u ->> 'nota', v_actor);
    elsif (v_u ->> 'contado')::integer > (v_u ->> 'enviado')::integer then
      insert into retail.despacho_diferencias (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id, tipo,
                                               causa, cantidad, costo_unitario, nota, creado_por)
      values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
              (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, 'sobrante', v_u ->> 'sobrante_causa',
              (v_u ->> 'contado')::integer - (v_u ->> 'enviado')::integer, v_costo, v_u ->> 'nota', v_actor);
    end if;
  end loop;

  -- ---- El envío queda recibido (decisión 13: y muestra cómo se cerró). ----
  update retail.despachos d
     set estado = 'cerrado',
         cerrado_por = v_actor,
         cerrado_en = now(),
         nota_recepcion = v_nota,
         recepcion_token = p_token,
         recepcion_huella = v_huella
   where d.id = p_despacho_id;

  v_res := retail.fn_recepcion_resultado(p_despacho_id);

  -- Actividad (ADR-0207), sin montos: «recibió ENV-000061 (32 prendas: 30 buenas, 2 dañadas; faltan 2)». Si falla, igual queda.
  begin
    if (v_res ->> 'unidades')::integer = 0 then
      v_desc := 'cerró la ' || v_envio || ' sin prendas';
    else
      v_desc := 'recibió ' || v_envio || ' (' || (v_res ->> 'unidades')
        || case when (v_res ->> 'unidades')::integer = 1 then ' prenda' else ' prendas' end
        || case when (v_res ->> 'danadas')::integer > 0
                then ': ' || (v_res ->> 'buenas') || case when (v_res ->> 'buenas')::integer = 1 then ' buena, ' else ' buenas, ' end
                     || (v_res ->> 'danadas') || case when (v_res ->> 'danadas')::integer = 1 then ' dañada' else ' dañadas' end
                else '' end;
    end if;
    v_desc := v_desc
      || case when (v_res ->> 'faltan')::integer = 1 then '; falta 1'
              when (v_res ->> 'faltan')::integer > 1 then '; faltan ' || (v_res ->> 'faltan') else '' end
      || case when (v_res ->> 'sobran')::integer = 1 then '; sobra 1'
              when (v_res ->> 'sobran')::integer > 1 then '; sobran ' || (v_res ->> 'sobran') else '' end
      || case when (v_res ->> 'unidades')::integer = 0 then '' else ')' end;
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_recibido', v_desc,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'unidades', (v_res ->> 'unidades')::integer,
                         'buenas', (v_res ->> 'buenas')::integer, 'danadas', (v_res ->> 'danadas')::integer,
                         'faltan', (v_res ->> 'faltan')::integer, 'sobran', (v_res ->> 'sobran')::integer,
                         'ordenes', (select jsonb_agg(distinct retail.fn_orden_compra_numero_texto(o.numero))
                                       from retail.despacho_items di
                                       join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                       join retail.ordenes_compra o on o.id = i.orden_compra_id
                                      where di.despacho_id = p_despacho_id)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recepción del envío % (%)', v_envio, sqlerrm;
  end;

  return v_res;
end;
$$;
comment on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) is
  'ADR-0362 (fase 4): cierra la recepción de un envío abierto. Por línea (todas, una vez): lo contado talla por talla (buenas al '
  'almacén, dañadas a la cuarentena con su fila en prendas_danadas), el costo corregido (promedio ponderado), lo que faltó o sobró '
  'con su causa; y lo que no estaba en la guía. Un lote por proveedor; las entradas llevan la línea del papel hasta su cupo. Costo '
  'atípico: hint recepcion_costo_atipico con el detalle en JSON. Módulo Recibir, su sede y la decisión 17. Token + huella; versión '
  'vieja: PT409. Devuelve {despacho_id, numero, lotes, unidades, buenas, danadas, faltan, sobran}.';
revoke all on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) to authenticated, service_role;

-- ---------- 5. Lecturas ----------
-- 5a. Los envíos que una sede tiene por recibir: en camino y abiertos (la puerta «Llegó mercadería»).
create or replace function retail.fn_envios_por_recibir(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_yo uuid := retail.fn_recepcion_quien_mira();
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver los envíos necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id,
             'numero', retail.fn_envio_numero_texto(d.numero),
             'estado', d.estado,
             'numero_guia', d.numero_guia,
             'nota', d.nota,
             'despachado_por', nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
             'despachado_en', d.despachado_en,
             'abierto_por', nullif(btrim(concat_ws(' ', pa.nombres, pa.apellidos)), ''),
             'abierto_en', d.abierto_en,
             'version', d.version,
             'lineas', t.lineas,
             'unidades', t.unidades,
             'ordenes', to_jsonb(t.ordenes),
             'proveedores', to_jsonb(t.proveedores),
             'creado_por_mi', coalesce(t.creadores @> array[v_yo], false)
           ) order by d.numero)
      from retail.despachos d
      left join public.personas pe on pe.id = d.despachado_por
      left join public.personas pa on pa.id = d.abierto_por
     cross join lateral (
       select count(*)::integer as lineas,
              coalesce(sum(di.cantidad), 0)::integer as unidades,
              array_agg(distinct retail.fn_orden_compra_numero_texto(o.numero)) as ordenes,
              array_agg(distinct pr.nombre) as proveedores,
              array_agg(distinct o.creada_por) as creadores
         from retail.despacho_items di
         join retail.orden_compra_items i on i.id = di.orden_compra_item_id
         join retail.ordenes_compra o on o.id = i.orden_compra_id
         join retail.proveedores pr on pr.id = o.proveedor_id
        where di.despacho_id = d.id
     ) t
     where d.ubicacion_destino_id = p_ubicacion_id
       and d.estado in ('en_camino', 'abierto')
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_envios_por_recibir(uuid) is
  'ADR-0362 (fase 4): los envíos en camino y abiertos a una sede, del más antiguo al más nuevo: [{id, numero, estado, numero_guia, '
  'nota, despachado_por, despachado_en, abierto_por, abierto_en, version, lineas, unidades, ordenes, proveedores, creado_por_mi}] '
  '(creado_por_mi: quien mira hizo alguna de sus órdenes). Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envios_por_recibir(uuid) from public, anon;
grant execute on function retail.fn_envios_por_recibir(uuid) to authenticated, service_role;

-- 5b. Las órdenes «directo» a una sede con algo por enviar: se reciben sin guía (decisión 48).
create or replace function retail.fn_ordenes_directas_por_recibir(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_yo uuid := retail.fn_recepcion_quien_mira();
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver las órdenes por recibir necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'orden_id', q.id,
             'numero', retail.fn_orden_compra_numero_texto(q.numero),
             'proveedor', q.proveedor,
             'proveedor_id', q.proveedor_id,
             'fecha_entrega_estimada', q.fecha_entrega_estimada,
             'unidades_por_enviar', q.por_enviar,
             'creada_por_mi', coalesce(q.creada_por = v_yo, false)
           ) order by q.numero)
      from (
        select o.id, o.numero, o.creada_por, o.fecha_entrega_estimada, pr.id as proveedor_id, pr.nombre as proveedor,
               sum(greatest(greatest(i.cantidad, coalesce(f.facturado, 0)) - coalesce(e.enviado, 0), 0))::integer as por_enviar
          from retail.ordenes_compra o
          join retail.proveedores pr on pr.id = o.proveedor_id
          join retail.orden_compra_items i on i.orden_compra_id = o.id
          left join (
            select ci.orden_compra_item_id as item_id, sum(ci.cantidad) as facturado
              from retail.compra_items ci
              join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
             where ci.orden_compra_item_id is not null
             group by ci.orden_compra_item_id
          ) f on f.item_id = i.id
          left join (
            select di.orden_compra_item_id as item_id, sum(di.cantidad) as enviado
              from retail.despacho_items di
              join retail.despachos d on d.id = di.despacho_id and d.estado in ('en_camino', 'abierto', 'cerrado')
             group by di.orden_compra_item_id
          ) e on e.item_id = i.id
         where o.estado = 'generada'
           and o.ubicacion_destino_id = p_ubicacion_id
         group by o.id, o.numero, o.creada_por, o.fecha_entrega_estimada, pr.id, pr.nombre
      ) q
     where q.por_enviar > 0
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_ordenes_directas_por_recibir(uuid) is
  'ADR-0362 (fase 4, decisión 48): las órdenes generadas «directo» a una sede con algo por enviar: [{orden_id, numero, proveedor, '
  'proveedor_id, fecha_entrega_estimada, unidades_por_enviar, creada_por_mi}]. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_ordenes_directas_por_recibir(uuid) from public, anon;
grant execute on function retail.fn_ordenes_directas_por_recibir(uuid) to authenticated, service_role;

-- 5c. Un envío por dentro (la de la fase 3, ampliada para recibirlo y para ver cómo se cerró).
create or replace function retail.fn_envio_detalle(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_resultado jsonb;
  v_yo uuid := retail.fn_recepcion_quien_mira();
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;

  select jsonb_build_object(
           'id', d.id,
           'numero', retail.fn_envio_numero_texto(d.numero),
           'estado', d.estado,
           'sede', jsonb_build_object('id', u.id, 'nombre', u.nombre),
           'numero_guia', d.numero_guia,
           'nota', d.nota,
           'despachado_por', nullif(btrim(concat_ws(' ', pd.nombres, pd.apellidos)), ''),
           'despachado_en', d.despachado_en,
           'abierto_por', nullif(btrim(concat_ws(' ', pab.nombres, pab.apellidos)), ''),
           'abierto_en', d.abierto_en,
           'cerrado_por', nullif(btrim(concat_ws(' ', pce.nombres, pce.apellidos)), ''),
           'cerrado_en', d.cerrado_en,
           'anulado_por', nullif(btrim(concat_ws(' ', pan.nombres, pan.apellidos)), ''),
           'anulado_en', d.anulado_en,
           'motivo_anulacion', d.motivo_anulacion,
           'nota_recepcion', d.nota_recepcion,
           'version', d.version,
           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
           -- Si quien mira hizo alguna de sus órdenes (decisión 17: la pantalla avisa antes de que la base lo frene).
           'creado_por_mi', coalesce(v_yo is not null and exists (
             select 1 from retail.despacho_items x
               join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
               join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
              where x.despacho_id = d.id and xo.creada_por = v_yo), false),
           -- Los proveedores del envío (para elegir de cuál es lo que no estaba en la guía).
           'proveedores', coalesce((
             select jsonb_agg(jsonb_build_object('id', q.id, 'nombre', q.nombre) order by q.nombre)
               from (select distinct pr.id, pr.nombre
                       from retail.despacho_items x
                       join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
                       join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
                       join retail.proveedores pr on pr.id = xo.proveedor_id
                      where x.despacho_id = d.id) q
           ), '[]'::jsonb),
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', di.id,
                      'orden_compra_id', o.id,
                      'orden', jsonb_build_object('id', o.id, 'numero', retail.fn_orden_compra_numero_texto(o.numero)),
                      'orden_compra_item_id', i.id,
                      'posicion', i.posicion,
                      'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
                      'categoria_id', di.categoria_id,
                      'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),
                      'marca_id', di.marca_id,
                      'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre),
                      'descripcion', di.descripcion,
                      'cantidad', di.cantidad,
                      'precio_unitario', di.precio_unitario,
                      'compra_item_id', di.compra_item_id,
                      -- El precio de venta que sugirió quien compró (decisión 21): el de la línea del papel que nombra el envío, o el
                      -- más reciente de los comprobantes vigentes de esa línea pedida.
                      'precio_venta_sugerido', coalesce(
                        (select ci.precio_venta_sugerido from retail.compra_items ci where ci.id = di.compra_item_id),
                        (select ci.precio_venta_sugerido
                           from retail.compra_items ci
                           join retail.compras cc on cc.id = ci.compra_id and cc.estado = 'vigente'
                          where ci.orden_compra_item_id = i.id and ci.precio_venta_sugerido is not null
                          order by cc.created_at desc, ci.id
                          limit 1))
                    ) order by o.numero, i.posicion)
               from retail.despacho_items di
               join retail.orden_compra_items i on i.id = di.orden_compra_item_id
               join retail.ordenes_compra o on o.id = i.orden_compra_id
               join retail.proveedores pr on pr.id = o.proveedor_id
               join retail.categorias c on c.id = di.categoria_id
               join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id
           ), '[]'::jsonb),
           -- Cómo se cerró (decisión 13): lo que llegó, por línea (o fuera de la guía) y variante, y lo que faltó o sobró.
           'recibidos', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'despacho_item_id', r.despacho_item_id,
                      'extra', r.extra_posicion,
                      'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
                      'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),
                      'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre),
                      'producto_id', p.id,
                      'prenda', p.referencia,
                      'variante_id', v.id,
                      'codigo', v.codigo,
                      'talla', t.valor,
                      'color', co.nombre,
                      'color_hex', co.hex,
                      'cantidad', r.cantidad,
                      'danadas', r.danadas,
                      'danada_solucion', r.danada_solucion,
                      'costo', r.costo_unitario,
                      'costo_unitario', r.costo_unitario
                    ) order by r.extra_posicion nulls first, r.orden_numero, r.posicion, p.referencia, t.valor, co.nombre)
               from (select x.despacho_item_id, x.extra_posicion, x.proveedor_id, x.categoria_id, x.marca_id, x.variante_id,
                            sum(x.cantidad)::integer as cantidad, sum(x.danadas)::integer as danadas,
                            max(x.danada_solucion) as danada_solucion, max(x.costo_unitario) as costo_unitario,
                            max(xo.numero) as orden_numero, max(xi.posicion) as posicion
                       from retail.despacho_recibidos x
                       left join retail.despacho_items xd on xd.id = x.despacho_item_id
                       left join retail.orden_compra_items xi on xi.id = xd.orden_compra_item_id
                       left join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
                      where x.despacho_id = d.id
                      group by x.despacho_item_id, x.extra_posicion, x.proveedor_id, x.categoria_id, x.marca_id, x.variante_id) r
               join retail.proveedores pr on pr.id = r.proveedor_id
               join retail.categorias c on c.id = r.categoria_id
               join retail.marcas m on m.id = r.marca_id
               join retail.variantes v on v.id = r.variante_id
               join retail.productos p on p.id = v.producto_id
               left join retail.tallas t on t.id = v.talla_id
               left join retail.colores co on co.codigo = v.color_codigo
           ), '[]'::jsonb),
           'diferencias', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'despacho_item_id', x.despacho_item_id,
                      'extra', x.extra_posicion,
                      'tipo', x.tipo,
                      'causa', x.causa,
                      'cantidad', x.cantidad,
                      'costo', x.costo_unitario,
                      'costo_unitario', x.costo_unitario,
                      'nota', x.nota,
                      'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
                      'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre),
                      'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre)
                    ) order by x.extra_posicion nulls first, x.creado_en, x.id)
               from retail.despacho_diferencias x
               join retail.proveedores pr on pr.id = x.proveedor_id
               join retail.categorias c on c.id = x.categoria_id
               join retail.marcas m on m.id = x.marca_id
              where x.despacho_id = d.id
           ), '[]'::jsonb),
           'recepcion', case when d.estado = 'cerrado' then retail.fn_recepcion_resultado(d.id) end
         )
    into v_resultado
    from retail.despachos d
    join retail.ubicaciones u on u.id = d.ubicacion_destino_id
    left join public.personas pd on pd.id = d.despachado_por
    left join public.personas pab on pab.id = d.abierto_por
    left join public.personas pce on pce.id = d.cerrado_por
    left join public.personas pan on pan.id = d.anulado_por
   where d.id = p_despacho_id;

  return v_resultado;
end;
$$;
comment on function retail.fn_envio_detalle(uuid) is
  'ADR-0362 (fases 3 y 4): un envío con su cabecera (versión, creado_por_mi, proveedores) y sus líneas (orden {id, numero}, proveedor, '
  'categoria {id, nombre, prefijo, familia}, marca {id, nombre}, descripción, cantidad, precio congelado, precio_venta_sugerido); y, '
  'si está cerrado, cómo se cerró (recibidos, diferencias, recepcion). NULL si no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_detalle(uuid) from public, anon;
grant execute on function retail.fn_envio_detalle(uuid) to authenticated, service_role;

-- 5d. Las prendas de una categoría y marca, para «Ya la tengo».
create or replace function retail.fn_prendas_para_recibir(p_categoria_id uuid, p_marca_id uuid, p_busqueda text)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_q text := retail.fn_clave_texto(p_busqueda);
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las prendas para recibir necesita el módulo «Recibir mercadería» u «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_categoria_id is null or p_marca_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id,
             'nombre', q.referencia,
             'codigo', q.codigo,
             'estado_alta', q.estado_alta,
             'coincide', q.coincide,
             'foto', (select f.url from retail.producto_fotos f where f.producto_id = q.id
                       order by f.es_principal desc, f.orden, f.created_at limit 1),
             'categoria', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia)
                             from retail.categorias c where c.id = q.categoria_id),
             'variantes', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', v.id,
                        'talla_id', v.talla_id,
                        'talla', t.valor,
                        'color_codigo', v.color_codigo,
                        'color', co.nombre,
                        'color_hex', co.hex,
                        'codigo', v.codigo,
                        'costo', v.costo,
                        'precio', v.precio
                      ) order by t.valor nulls first, co.nombre nulls first, v.id)
                 from retail.variantes v
                 left join retail.tallas t on t.id = v.talla_id
                 left join retail.colores co on co.codigo = v.color_codigo
                where v.producto_id = q.id and v.activo
             ), '[]'::jsonb)
           ) order by q.coincide desc, q.referencia, q.id)
      from (
        select pr.id, pr.referencia, pr.codigo, pr.estado_alta, pr.categoria_id,
               (v_q is not null and (
                  retail.fn_clave_texto(pr.referencia) like '%' || v_q || '%'
                  or lower(coalesce(pr.codigo, '')) like '%' || v_q || '%'
                  or exists (select 1 from retail.variantes vv
                              where vv.producto_id = pr.id and lower(coalesce(vv.codigo, '')) like '%' || v_q || '%'))) as coincide
          from retail.productos pr
         where pr.categoria_id = p_categoria_id
           and pr.marca_id = p_marca_id
           and pr.estado = 'activo'
           and pr.estado_alta <> 'rechazado'
         order by coincide desc, pr.referencia, pr.id
         limit 30
      ) q
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_prendas_para_recibir(uuid, uuid, text) is
  'ADR-0362 (fase 4): las prendas activas de una categoría y marca, para «Ya la tengo»: [{id, nombre, codigo, estado_alta, coincide, '
  'foto, categoria, variantes: [{id, talla_id, talla, color_codigo, color, color_hex, codigo, costo, precio}]}]. Hasta 30, las que '
  'coinciden con la búsqueda (nombre o código, sin tildes ni mayúsculas) primero. Módulo Recibir u Órdenes de compra.';
revoke all on function retail.fn_prendas_para_recibir(uuid, uuid, text) from public, anon;
grant execute on function retail.fn_prendas_para_recibir(uuid, uuid, text) to authenticated, service_role;

-- ---------- 6. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
begin
  foreach v_funcion in array array[
    'retail.abrir_despacho(uuid,integer)',
    'retail.recibir_orden_sin_envio(uuid,uuid)',
    'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
    'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
    'retail.fn_envios_por_recibir(uuid)',
    'retail.fn_ordenes_directas_por_recibir(uuid)',
    'retail.fn_envio_detalle(uuid)',
    'retail.fn_prendas_para_recibir(uuid,uuid,text)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
      raise exception '% tiene que ser security definer', v_funcion;
    end if;
    if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
      raise exception '%: la ejecuta authenticated y no anon', v_funcion;
    end if;
  end loop;
  foreach v_funcion in array array[
    'retail.fn_recepcion_quien_mira()', 'retail.fn_recepcion_exigir(uuid,uuid,uuid)',
    'retail.fn_recepcion_leer_variantes(jsonb,text)', 'retail.fn_recepcion_resultado(uuid)'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  -- Ninguna sobrecarga: la web llama por nombre.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail'
                and p.proname in ('abrir_despacho', 'recibir_orden_sin_envio', 'preparar_prenda_al_recibir', 'recibir_despacho',
                                  'fn_envios_por_recibir', 'fn_ordenes_directas_por_recibir', 'fn_envio_detalle', 'fn_prendas_para_recibir')
              group by p.proname having count(*) > 1) then
    raise exception 'una de las funciones de la recepción quedó con dos versiones';
  end if;
  if position($t$current_setting('retail.alta_al_recibir', true)$t$ in pg_get_functiondef(
       'retail.crear_producto_con_variantes(text,uuid,jsonb,text,uuid,uuid,uuid,boolean,uuid[],uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'falta 20261013001000: crear_producto_con_variantes no tiene el alta al recibir';
  end if;
end;
$$;

reset lock_timeout;
