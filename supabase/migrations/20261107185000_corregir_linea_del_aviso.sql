-- ============================================================================
-- 20261107185000_corregir_linea_del_aviso.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07 b)
-- Recibir CON aviso: la categoría y la marca de una línea del aviso también se corrigen en «¿Esta prenda ya existe?».
--
-- EL PROBLEMA PRIMERO. Llegaron shorts jean y en el aviso (la orden) venían como «Jean 248A» en Jeans. «Crear o asociar» solo busca en la categoría de la línea,
-- así que el short que ya existe no salía y no se podía asociar (Felipe 2026-11-07). Sin aviso ya se corregía (20261106230000, 20261107142000); con aviso, no.
--
-- QUÉ CAMBIA: `cambiar_linea_de_pendiente`, en un pendiente «por crear» de una línea del aviso, corrige la categoría y la marca de LA LÍNEA ENTERA
-- (`despacho_items`, lo que la guía dijo que venía), en vez de negarse. Lo que llegó fue un short, no un jean: la línea dice ahora lo que llegó.
--
-- LO QUE NO CAMBIA: la orden de compra (lo que se pidió) y la factura no se tocan; stock, movimientos y costos tampoco; toda prenda sigue siendo de la categoría
-- y la marca de su línea. Por eso se niega si algo de la línea ya entró al stock, ya tiene su prenda o anotó una diferencia al cerrar (quedó con la categoría vieja).
-- Una línea del aviso siempre lleva marca (`despacho_items.marca_id` no acepta vacío): «Sin marca» no se acepta ahí.
--
-- DESCARTÉ
--   · Mover el pendiente a una línea de fuera de la guía, como sin aviso: bajaría lo contado de la línea de la orden con el envío cerrado e inventaría un
--     faltante que no existe (y una diferencia que nadie anotó).
--   · Corregir la orden de compra: es lo que se pidió, y la corrige Compras si de verdad se pidió mal.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. Necesita 20261107142000.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.cambiar_linea_de_pendiente(p_despacho_id uuid, p_pendiente_id uuid, p_categoria_id uuid, p_marca_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_pend retail.despacho_pendientes;
  v_origen retail.despacho_conteos;
  v_destino retail.despacho_conteos;
  v_cat_antes text;
  v_cat text;
  v_marca_antes text;
  v_marca text;
  v_clave text;
  v_costo jsonb;
  v_nuevas jsonb;
  v_falta integer;
  v_x jsonb;
  v_item retail.despacho_items;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Terminar lo pendiente de un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío → su pendiente → sus líneas.
  v_despacho := (select d from retail.despachos d where d.id = p_despacho_id for update);
  if v_despacho.id is null then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'cerrado' then
    raise exception 'La categoría y la marca se corrigen aquí con el envío cerrado: mientras se cuenta, quita el modelo y agrégalo donde va' using hint = 'categoria_envio_no_cerrado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  v_pend := (select x from retail.despacho_pendientes x where x.id = p_pendiente_id for update);
  if v_pend.id is null or v_pend.despacho_id <> p_despacho_id then
    raise exception 'Ese pendiente no es de este envío: recarga la pantalla' using hint = 'pendiente_ajeno';
  end if;
  if v_pend.estado <> 'pendiente' or v_pend.tipo <> 'crear' then
    raise exception 'Esa prenda ya tiene ficha: recarga la pantalla' using hint = 'pendiente_ya_resuelto';
  end if;
  -- Una línea del aviso (20261107185000): se corrige la línea entera, en su sitio. Partirla bajaría lo contado de la orden e inventaría un faltante que no existe.
  if v_pend.extra_posicion is null then
    v_item := (select i from retail.despacho_items i where i.id = v_pend.despacho_item_id and i.despacho_id = p_despacho_id for update);
    if v_item.id is null then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
    end if;
    if p_categoria_id is null or not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
      raise exception 'Elige una categoría activa' using hint = 'recepcion_extra_categoria';
    end if;
    if p_marca_id is null then
      raise exception 'Una línea del aviso siempre lleva marca: elige la marca de la prenda' using hint = 'recepcion_marca';
    end if;
    if not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Esa marca ya no está activa: elige otra' using hint = 'recepcion_marca';
    end if;
    if p_categoria_id = v_item.categoria_id and p_marca_id = v_item.marca_id then
      return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', null, 'cambio', false);
    end if;
    if exists (select 1 from retail.despacho_diferencias f where f.despacho_id = p_despacho_id and f.despacho_item_id = v_item.id and f.vigente) then
      raise exception 'Esta línea anotó una diferencia al cerrar: reabre el envío para corregir su categoría o su marca' using hint = 'categoria_linea_con_diferencia';
    end if;
    -- Toda prenda es de la categoría y la marca de su línea: si algo de esta línea ya entró al stock (o ya tiene su prenda), la línea entera no se mueve.
    if exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id and r.despacho_item_id = v_item.id)
       or exists (select 1 from retail.despacho_pendientes y where y.despacho_id = p_despacho_id and y.despacho_item_id = v_item.id
                   and not (y.tipo = 'crear' and y.estado = 'pendiente'))
       or exists (select 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id and k.despacho_item_id = v_item.id
                   and jsonb_array_length(coalesce(k.separado -> 'prendas', '[]'::jsonb)) > 0) then
      raise exception 'Parte de esta línea del aviso ya entró al stock como prenda de su categoría: reabre el envío para corregirla' using hint = 'categoria_linea_con_stock';
    end if;

    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;

    v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);
    v_cat := (select c.nombre from retail.categorias c where c.id = p_categoria_id);
    v_marca_antes := coalesce((select m.nombre from retail.marcas m where m.id = v_item.marca_id), 'Sin marca');
    v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'Sin marca');
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'despacho_pendiente_categoria_cambiada',
        'pasó la línea ' || coalesce(v_item.descripcion, v_pend.descripcion, v_pend.cantidad || ' por crear') || ' del aviso de ' || v_cat_antes || ' · ' || v_marca_antes || ' a ' || v_cat || ' · ' || v_marca || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero),
        v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
        'despachos', p_despacho_id::text, now(),
        jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'despacho_item_id', v_item.id, 'categoria_antes', v_item.categoria_id, 'categoria_id', p_categoria_id, 'marca_antes', v_item.marca_id, 'marca_id', p_marca_id, 'cantidad', v_pend.cantidad),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el cambio de línea del aviso del envío % (%)', v_despacho.numero, sqlerrm;
    end;
    return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', null, 'cambio', true);
  end if;

  v_origen := (select k from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.extra_posicion = v_pend.extra_posicion for update);
  if v_origen.id is null then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;
  if p_categoria_id is null or not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
    raise exception 'Elige una categoría activa' using hint = 'recepcion_extra_categoria';
  end if;
  -- `p_marca_id` nulo = sin marca (ADR-0393, 2026-10-14): una línea de fuera de la guía puede no tenerla.
  if p_marca_id is not null and not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
    raise exception 'Esa marca ya no está activa: elige otra o «Sin marca»' using hint = 'recepcion_marca';
  end if;
  if p_categoria_id = v_origen.categoria_id and p_marca_id is not distinct from v_origen.marca_id then
    return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', v_pend.extra_posicion, 'cambio', false);
  end if;
  if exists (select 1 from retail.despacho_diferencias f where f.despacho_id = p_despacho_id and f.extra_posicion = v_pend.extra_posicion and f.vigente) then
    raise exception 'Esta línea anotó lo que sobró al cerrar: reabre el envío para corregir su categoría o su marca' using hint = 'categoria_linea_con_diferencia';
  end if;

  -- Lo separado de origen deja de traer este modelo; lo demás queda igual, en su orden.
  v_nuevas := '[]'::jsonb;
  v_falta := v_pend.cantidad;
  for v_x in select n.x from jsonb_array_elements(v_origen.separado -> 'nuevas') with ordinality n(x, o) order by n.o loop
    if v_falta > 0 and v_x ->> 'descripcion' is not distinct from v_pend.descripcion then
      if (v_x ->> 'cantidad')::integer > v_falta then
        v_nuevas := v_nuevas || jsonb_set(v_x, '{cantidad}', to_jsonb((v_x ->> 'cantidad')::integer - v_falta));
        v_falta := 0;
      else
        v_falta := v_falta - (v_x ->> 'cantidad')::integer;
      end if;
    else
      v_nuevas := v_nuevas || v_x;
    end if;
  end loop;

  -- El costo que se le puso por su descripción viaja con él (ADR-0519). En origen se queda si otro «por crear» de esa línea se llama igual.
  v_clave := 'nueva:' || v_pend.descripcion;
  v_costo := v_origen.costos_prendas -> v_clave;

  perform set_config('retail.cambia_categoria', 'si', true);
  begin
    -- La línea de destino: la de esa categoría, esa marca, el mismo proveedor y el mismo costo, o una nueva. Con otro costo no se junta: el modelo entraría con un costo que no es el suyo.
    v_destino := (select k from retail.despacho_conteos k
                   where k.despacho_id = p_despacho_id and k.extra_posicion is not null
                     and k.categoria_id = p_categoria_id
                     and k.marca_id is not distinct from p_marca_id
                     and k.proveedor_id is not distinct from v_origen.proveedor_id
                     and k.costo_unitario is not distinct from v_origen.costo_unitario
                   order by k.extra_posicion limit 1 for update);
    if v_destino.id is null then
      insert into retail.despacho_conteos (despacho_id, extra_posicion, proveedor_id, categoria_id, marca_id, contadas, costo_unitario, contado_por)
      values (p_despacho_id,
              (select coalesce(max(k.extra_posicion), 0) + 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id),
              v_origen.proveedor_id, p_categoria_id, p_marca_id, 0, v_origen.costo_unitario, v_actor)
      returning * into v_destino;
    end if;

    update retail.despacho_conteos k
       set contadas = k.contadas - v_pend.cantidad,
           separado = jsonb_set(k.separado, '{nuevas}', v_nuevas),
           costos_prendas = case
             when v_costo is null then k.costos_prendas
             when exists (select 1 from retail.despacho_pendientes y
                           where y.despacho_id = p_despacho_id and y.id <> p_pendiente_id and y.extra_posicion = v_pend.extra_posicion
                             and y.tipo = 'crear' and y.estado = 'pendiente' and y.descripcion = v_pend.descripcion) then k.costos_prendas
             else k.costos_prendas - v_clave end,
           version = k.version + 1
     where k.id = v_origen.id;

    update retail.despacho_conteos k
       set contadas = k.contadas + v_pend.cantidad,
           separado = jsonb_set(k.separado, '{nuevas}', (k.separado -> 'nuevas') || jsonb_strip_nulls(jsonb_build_object('cantidad', v_pend.cantidad, 'descripcion', v_pend.descripcion))),
           costos_prendas = case when v_costo is null then k.costos_prendas else k.costos_prendas || jsonb_build_object(v_clave, v_costo) end,
           version = k.version + 1
     where k.id = v_destino.id;

    update retail.despacho_pendientes x set extra_posicion = v_destino.extra_posicion where x.id = p_pendiente_id;
  exception when others then
    perform set_config('retail.cambia_categoria', '', true);
    raise;
  end;
  perform set_config('retail.cambia_categoria', '', true);

  v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_origen.categoria_id);
  v_cat := (select c.nombre from retail.categorias c where c.id = p_categoria_id);
  v_marca_antes := coalesce((select m.nombre from retail.marcas m where m.id = v_origen.marca_id), 'Sin marca');
  v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'Sin marca');
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_pendiente_categoria_cambiada',
      'pasó ' || coalesce(v_pend.descripcion, v_pend.cantidad || ' por crear') || ' de ' || v_cat_antes || ' · ' || v_marca_antes || ' a ' || v_cat || ' · ' || v_marca || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero),
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'categoria_antes', v_origen.categoria_id, 'categoria_id', p_categoria_id, 'marca_antes', v_origen.marca_id, 'marca_id', p_marca_id, 'cantidad', v_pend.cantidad),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cambio de línea del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', v_destino.extra_posicion, 'cambio', true);
end;
$$;
comment on function retail.cambiar_linea_de_pendiente(uuid, uuid, uuid, uuid) is
  'ADR-0393 (act. 2026-11-07, 20261107185000): con el envío CERRADO, pasa un pendiente «por crear» de fuera de la guía a una línea con su categoría y su marca de verdad (marca nula = sin marca; mismo '
  'proveedor y costo), moviendo lo contado con él. No toca stock ni costos. Módulo Recibir, su sede y la decisión 17; firma el responsable; queda en la Actividad. Sin cambio, no hace nada. En una línea del aviso corrige la línea entera (despacho_items), si nada de ella entró al stock.';
revoke all on function retail.cambiar_linea_de_pendiente(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function retail.cambiar_linea_de_pendiente(uuid, uuid, uuid, uuid) to authenticated, service_role;

reset lock_timeout;
