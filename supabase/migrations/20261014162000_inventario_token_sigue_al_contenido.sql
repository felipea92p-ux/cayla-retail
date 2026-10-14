-- ============================================================================
-- 20261014162000_inventario_token_sigue_al_contenido.sql — CAYLA V2 (/chaos de Inventario 2026-10-14, Felipe 2026-10-14)
--
-- EL PROBLEMA PRIMERO. El 2026-10-14 /chaos lo vio en Nuevo traslado: se envían 2 prendas, la base lo guarda y la respuesta se
-- pierde; la pantalla dice «No se pudo iniciar el traslado», la persona corrige a 3 y reintenta con el MISMO token. La base devuelve
-- el traslado viejo (2) y la pantalla anuncia «3 prendas enviadas», con el WhatsApp a la otra tienda. En la caja viajan 3, el
-- sistema descuenta 2, y la otra sede recibe 3 de un envío de 2 (la «prenda de más»: stock que aparece sin salir de ningún lado).
-- Es el mismo defecto que ADR-0398 cerró en Ventas: el token se mira, pero no lo que se manda con él. En Inventario lo tienen
-- `iniciar_traslado`, `enviar_pedido_a_otra_sede`, `recibir_lote`, `pedir_a_otra_sede`, `pedir_prenda_para_apartar`,
-- `apartar_prenda` y `bajar_al_piso_desde_vender` (devuelven lo del primer envío), y `arreglar_prenda_danada`, que con el mismo
-- token y la misma nota daba por arregladas DOS dañadas con un solo movimiento (una unidad quedaba en cuarentena sin dañada).
-- Ajustar, bajar, retirar, subir para enviar, reportar dañada, mover y cuadrar el piso ya comparaban el contenido: no se tocan.
--
-- LA DECISIÓN. La misma pieza de ADR-0398: cada una de esas funciones llama a `fn_intento_con_huella` ANTES de buscar su token
-- (con la huella de todo lo que se manda, menos el token). El mismo token con otro contenido se rechaza (`token_reusado`); con el
-- mismo contenido, todo sigue como siempre (devuelve lo que ya guardó). Y `fn_resolver_intento` aprende a revisar un traslado
-- (`iniciar_traslado`, `enviar_pedido_a_otra_sede`), para que Nuevo traslado y el pase de un pedido puedan preguntar «¿se guardó?».
--
-- CONTRATO (Liskov)
--   PROMETE: con un token ya usado y otro contenido, esas ocho funciones responden `token_reusado` sin escribir nada; con el mismo
--            contenido o un token nuevo, lo de siempre. `fn_resolver_intento` responde lo mismo que antes para las once
--            operaciones de Ventas y, para un traslado, `{estado: 'hecho', transferencia_id, numero, prendas}` o `no_llego`.
--   ASUME:   ADR-0398 (`intentos_con_token`, `fn_intento_con_huella`, `fn_resolver_intento`); las ocho funciones vivas a la fecha
--            (anclas verificadas en local y en producción el 2026-10-14).
--   NO HACE: no toca tablas ni políticas; no cambia qué valida cada función. `anular_traslado` queda igual: con el mismo token
--            anula otro traslado, pero cada anulación es legítima y no deja un estado imposible.
--
-- CÓMO SE PEGA. Una sola parte, solo funciones. Reemplazos ANCLADOS sobre la definición viva (ADR-0288): la llamada va antes de
-- la PRIMERA aparición del ancla, que tiene que aparecer exactamente las veces esperadas (si no, se detiene sin tocar nada). Anclas
-- de una línea de código, nunca comentarios. Idempotente. Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- El resolver: además de las once operaciones de Ventas, revisa un traslado (Nuevo traslado y el pase de un pedido).
-- ----------------------------------------------------------------------------
create or replace function retail.fn_resolver_intento(p_operacion text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_ubicacion uuid;
  v_datos jsonb;
  v_descartado timestamptz;
  v_vuelta integer;
begin
  if p_token is null then
    raise exception 'Falta el envío a revisar.' using errcode = 'P0001', hint = 'intento_sin_token';
  end if;
  if p_operacion not in ('registrar_venta', 'entregar_separacion', 'registrar_movimiento_caja', 'registrar_ingreso_caja',
                         'registrar_gasto', 'separar_prendas', 'abonar_separacion', 'editar_separacion',
                         'enviar_pedido_para_apartar', 'registrar_cambio', 'separar_pedido_para_apartar',
                         'iniciar_traslado', 'enviar_pedido_a_otra_sede') then
    raise exception 'No sé revisar «%».', p_operacion using errcode = 'P0001', hint = 'operacion_desconocida';
  end if;

  -- Dos vueltas: primero se busca la fila; si no está, se deja la marca de «no llegó». Si la marca choca con un envío que
  -- estaba guardando (misma llave), el insert espera a que termine y la segunda vuelta ve lo que de verdad quedó.
  for v_vuelta in 1..2 loop
    v_id := null;
    v_ubicacion := null;
    v_datos := null;
    if p_operacion in ('registrar_venta', 'entregar_separacion') then
      for v_id, v_ubicacion, v_datos in
        select v.id, v.ubicacion_id, jsonb_build_object(
                 'venta_id', v.id,
                 'creado_en', v.created_at,
                 'anulada', v.estado = 'anulada',
                 'total', (select coalesce(sum((vi.precio_unitario - vi.descuento_unitario) * vi.cantidad), 0)
                             from retail.venta_items vi where vi.venta_id = v.id),
                 'comprobante', (select jsonb_build_object('id', c.id, 'tipo', c.tipo, 'serie', c.serie, 'numero', c.numero, 'estado', c.estado)
                                   from retail.comprobantes c
                                  where c.venta_id = v.id and not coalesce(c.es_anticipo, false)
                                    and c.tipo in ('boleta', 'factura', 'nota_venta')
                                  order by c.created_at desc limit 1))
          from retail.ventas v where v.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion in ('registrar_movimiento_caja', 'registrar_ingreso_caja') then
      for v_id, v_ubicacion, v_datos in
        select m.id, c.ubicacion_id, jsonb_build_object('id', m.id, 'tipo', m.tipo, 'monto', m.monto, 'creado_en', m.created_at)
          from retail.caja_movimientos m join retail.cajas c on c.id = m.caja_id where m.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'registrar_gasto' then
      for v_id, v_ubicacion, v_datos in
        select g.id, g.ubicacion_id, jsonb_build_object('id', g.id, 'monto', g.monto_total, 'creado_en', g.created_at)
          from retail.gastos g where g.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion in ('separar_prendas', 'separar_pedido_para_apartar') then
      for v_id, v_ubicacion, v_datos in
        select s.id, s.ubicacion_id, jsonb_build_object('id', s.id, 'codigo', s.codigo, 'total', s.total, 'creado_en', s.created_at)
          from retail.separaciones s where s.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'abonar_separacion' then
      for v_id, v_ubicacion, v_datos in
        select a.id, s.ubicacion_id, jsonb_build_object('abono_id', a.id, 'codigo', s.codigo, 'monto', a.monto,
                                                        'vence_el', a.vence_despues, 'comprobante_id', a.comprobante_id)
          from retail.separacion_abonos a join retail.separaciones s on s.id = a.separacion_id where a.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'editar_separacion' then
      for v_id, v_ubicacion, v_datos in
        select e.id, s.ubicacion_id, jsonb_build_object('edicion_id', e.id, 'codigo', s.codigo, 'total', e.total_despues)
          from retail.separacion_ediciones e join retail.separaciones s on s.id = e.separacion_id where e.token_cliente = p_token
      loop
        exit;
      end loop;
    elsif p_operacion in ('enviar_pedido_para_apartar', 'iniciar_traslado', 'enviar_pedido_a_otra_sede') then
      for v_id, v_ubicacion, v_datos in
        select t.id, t.ubicacion_origen_id, jsonb_build_object('transferencia_id', t.id, 'numero', t.numero, 'creado_en', t.created_at,
                 'prendas', (select coalesce(sum(ti.cantidad), 0) from retail.transferencia_items ti where ti.transferencia_id = t.id))
          from retail.transferencias t where t.token_cliente = p_token
      loop
        exit;
      end loop;
    else -- registrar_cambio
      for v_id, v_ubicacion, v_datos in
        select cb.id, cb.ubicacion_id, jsonb_build_object('id', cb.id, 'diferencia', cb.diferencia, 'creado_en', cb.created_at)
          from retail.cambios cb where cb.token_cliente = p_token
      loop
        exit;
      end loop;
    end if;

    if v_id is not null then
      if v_ubicacion is null then
        if not retail.fn_es_lider() then
          raise exception 'Ese envío no es de tu tienda.' using errcode = '42501', hint = 'intento_de_otra_sede';
        end if;
      elsif not retail.fn_puede_operar_ubicacion(v_ubicacion) then
        raise exception 'Ese envío no es de tu tienda.' using errcode = '42501', hint = 'intento_de_otra_sede';
      end if;
      return jsonb_build_object('estado', 'hecho') || v_datos;
    end if;

    if v_vuelta = 1 then
      insert into retail.intentos_con_token (operacion, token, huella, descartado_en) values (p_operacion, p_token, '', now())
      on conflict (operacion, token) do nothing;
      if found then
        return jsonb_build_object('estado', 'no_llego');
      end if;
      -- Ya había una huella: o una marca anterior de «no llegó», o un envío que terminó mientras esperábamos.
      v_descartado := (select i.descartado_en from retail.intentos_con_token i where i.operacion = p_operacion and i.token = p_token);
      if v_descartado is not null then
        return jsonb_build_object('estado', 'no_llego');
      end if;
    end if;
  end loop;

  -- Una huella sin fila: el envío se anotó pero no dejó nada que mostrar. Se da por no llegado, con su marca.
  update retail.intentos_con_token set descartado_en = now() where operacion = p_operacion and token = p_token and descartado_en is null;
  return jsonb_build_object('estado', 'no_llego');
end;
$$;

comment on function retail.fn_resolver_intento(text, uuid) is
  '¿Llegó un envío con token? hecho (con lo que guardó) o no_llego (definitivo: si aparece después, se rechaza). Espera a un envío que todavía guarda.';
revoke all on function retail.fn_resolver_intento(text, uuid) from public, anon;
grant execute on function retail.fn_resolver_intento(text, uuid) to authenticated;

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces.
-- Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

select pg_temp.insertar_antes(
  'retail.iniciar_traslado(uuid, uuid, jsonb, timestamp with time zone, text, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otras prendas, otro destino u otra fecha se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('iniciar_traslado', p_token, md5(jsonb_build_array(p_ubicacion_origen_id, p_ubicacion_destino_id, p_items, p_fecha_estimada_llegada, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('iniciar_traslado'$v$);

select pg_temp.insertar_antes(
  'retail.enviar_pedido_a_otra_sede(uuid, timestamp with time zone, uuid)',
  $v$  perform 1 from separacion_pedidos where grupo_id = p_grupo_id order by id for update;$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pedido u otra fecha se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('enviar_pedido_a_otra_sede', p_token, md5(jsonb_build_array(p_grupo_id, p_fecha_estimada_llegada)::text));
$v$,
  $v$fn_intento_con_huella('enviar_pedido_a_otra_sede'$v$);

select pg_temp.insertar_antes(
  'retail.recibir_lote(uuid, uuid, jsonb, text, text, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otra llegada se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('recibir_lote', p_token, md5(jsonb_build_array(p_ubicacion_id, p_proveedor_id, p_items, p_numero_guia, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('recibir_lote'$v$);

select pg_temp.insertar_antes(
  'retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid)',
  $v$  if p_token is not null then$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro pedido se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('pedir_a_otra_sede', p_token, md5(jsonb_build_array(p_ubicacion_id, p_origen_id, p_lineas, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('pedir_a_otra_sede'$v$);

select pg_temp.insertar_antes(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  $v$  if p_token is not null then$v$, 2,
  $v$  -- El token sigue al contenido: el mismo token con otra prenda u otra clienta se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('pedir_prenda_para_apartar', p_token, md5(jsonb_build_array(p_ubicacion_id, p_origen_id, p_variante_id, p_cantidad, p_clienta_nombres, p_clienta_apellidos, p_clienta_celular, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('pedir_prenda_para_apartar'$v$);

select pg_temp.insertar_antes(
  'retail.apartar_prenda(uuid, uuid, integer, text, text, date, text, uuid, uuid)',
  $v$  return apartar_stock(p_variante_id, p_ubicacion_id, p_cantidad, p_clienta_nombre, p_clienta_contacto, p_vence_el,$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otro apartado se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('apartar_prenda', p_token, md5(jsonb_build_array(p_variante_id, p_ubicacion_id, p_cantidad, p_clienta_nombre, p_clienta_contacto, p_vence_el, p_nota, p_sububicacion_id)::text));
$v$,
  $v$fn_intento_con_huella('apartar_prenda'$v$);

select pg_temp.insertar_antes(
  'retail.bajar_al_piso_desde_vender(uuid, uuid, integer, uuid)',
  $v$  perform pg_advisory_xact_lock(hashtextextended('mover_interno:' || p_token::text, 0));$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con otra prenda u otra cantidad se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('bajar_al_piso_desde_vender', p_token, md5(jsonb_build_array(p_ubicacion_id, p_variante_id, p_piso_necesario)::text));
$v$,
  $v$fn_intento_con_huella('bajar_al_piso_desde_vender'$v$);

select pg_temp.insertar_antes(
  'retail.arreglar_prenda_danada(uuid, text, uuid)',
  $v$  v_marca := md5('arreglar_prenda_danada:' || p_token::text)::uuid;$v$, 1,
  $v$  -- El token sigue al contenido: el mismo token con OTRA dañada se rechaza (antes daba por arregladas dos con un solo movimiento) (token_reusado).
  perform retail.fn_intento_con_huella('arreglar_prenda_danada', p_token, md5(jsonb_build_array(p_id, p_nota)::text));
$v$,
  $v$fn_intento_con_huella('arreglar_prenda_danada'$v$);
