-- ============================================================================
-- 20261015000000_pedidos_web_cobros.sql — CAYLA V2 · Tienda online (ADR-0408), base de la actividad 9
--
-- QUÉ HACE. Cobrar DENTRO del pedido web (las tablas y sus candados nacieron en `20261014235000_pedidos_web_modelo.sql`):
--   · registrar_pago_pedido_web            → el ERP anota un pago que el cliente coordinó por WhatsApp:
--       - digital (Yape, Plin, transferencia) con su n.º de operación, que no se repite en ningún pedido (propuesta a);
--       - efectivo, que entra a la caja ABIERTA de la tienda del pedido (un ingreso de caja que `cerrar_caja` ya suma).
--     Un pago puede ser una parte (el adelanto de lo que se consigue lo decide la tienda) y nunca pasa lo que falta. Cuando lo
--     pagado llega al total, el pedido pasa a «pagado» solo (lo hace el disparador de la migración anterior).
--   · anular_pago_pedido_web               → el ERP anula un pago mal anotado o devuelto. Si fue efectivo, sale de la caja
--     abierta (no se borra la entrada: se escribe la salida, y el candado de la caja impide sacar lo que no hay).
--   · fn_registrar_aviso_pasarela_pedido_web → la pasarela futura (Izipay o Culqi) avisa un cobro. El MISMO aviso dos veces no
--     duplica nada: (proveedor, referencia) es único y un aviso repetido solo devuelve lo que ya había. Un aviso viejo que llega
--     tarde no hace retroceder un pago. Un pedido se marca pagado solo con este aviso firmado, nunca por la vuelta del navegador,
--     y la tarjeta nunca pasa por aquí: llegan el proveedor, la referencia, el monto y el estado.
--
-- POR QUÉ ASÍ.
--   · El candado de «no pasa el total» es el CHECK `pagado <= total` de la fila del pedido (ver la migración anterior): estas
--     funciones lo dicen antes en palabras de tienda, pero aunque alguien se las saltara, la base no lo deja.
--   · El n.º de operación lo frena un índice único (vivo: un pago anulado lo libera para anotarlo bien). Dos cajas que anotan
--     el mismo n.º a la vez: una gana y la otra recibe «ya se registró en el pedido W-…».
--   · El efectivo en la caja de su tienda y por el mismo monto lo comprueba la base al confirmar la transacción.
--   · Principio 9: lo que la pasarela cobra y el pedido ya no puede recibir (se anuló, ya estaba pagado o pasa lo que faltaba)
--     NO se pierde ni se rechaza: queda «por revisar» (no suma) con su explicación, y la función devuelve `ok: false` con el
--     motivo para que la ruta que recibe el aviso lo mire. La sede decide (devolverlo, o aplicarlo si vuelve a caber).
--   · Las del ERP firman con el responsable (`fn_actor_persona_id(true)`) y piden el módulo `pedidos_web` y la tienda.
--
-- QUÉ NO HACE. No emite boleta: la boleta sale al quedar PAGADO COMPLETO y la encola la actividad 10 (los adelantos no llevan
-- comprobante, como en los apartados, ADR-0399). Por eso un pago de un pedido ya pagado completo no se anula aquí: su boleta
-- ya existe y devolverlo es una nota de crédito (actividad 10, con el OK de Felipe). Tampoco construye la pasarela (sus rutas,
-- su firma y su llave), ni le da esta función a nadie: la ruta que reciba el aviso decide con qué rol la llama.
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de `20261014235000_pedidos_web_modelo.sql`. Solo crea funciones (sin políticas,
-- sin disparadores, sin tocar tablas en uso): se pega tal cual y se puede volver a pegar.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- La respuesta de las funciones que cobran.
create or replace function retail.fn_pedido_web_pago_respuesta(p_pago_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'pago_id', g.id, 'pedido_id', w.id, 'codigo', w.codigo, 'origen', g.origen, 'medio', g.medio, 'monto', g.monto,
    'estado_pago', g.estado, 'numero_operacion', g.numero_operacion, 'observacion', g.observacion,
    'en_caja', g.caja_movimiento_id is not null,
    'total', w.total, 'pagado', w.pagado, 'falta', w.total - w.pagado, 'estado_pedido', w.estado)
  from retail.pedido_web_pagos g
  join retail.pedidos_web w on w.id = g.pedido_id
  where g.id = p_pago_id;
$$;

-- Anotar un pago (el ERP). `p_numero_operacion`: el de la app o del banco (de 6 a 12 dígitos; los espacios no cuentan); el
-- efectivo no lleva. `p_token`: la marca del intento (doble clic, red que se cae): con la misma marca devuelve el MISMO pago.
create or replace function retail.registrar_pago_pedido_web(p_pedido_id uuid, p_monto numeric, p_medio text,
                                                            p_numero_operacion text default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v_existente retail.pedido_web_pagos%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_cm uuid;
  v_id uuid;
  v_op text;
  v_otro text;
  v_tienda text;
  v_restriccion text;
begin
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_pagos:' || p_token::text, 0));
    select * into v_existente from retail.pedido_web_pagos g where g.token_cliente = p_token;
    if found then
      if v_existente.pedido_id <> p_pedido_id then
        raise exception 'Esa marca de pago es de otro pedido.' using errcode = '22023', hint = 'pedido_web_token';
      end if;
      return retail.fn_pedido_web_pago_respuesta(v_existente.id);
    end if;
  end if;

  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado <> 'confirmado' then
    raise exception '%', case when p.estado = 'por_confirmar'
                              then format('El pedido web %s todavía no está confirmado: primero se confirma y después se cobra.', p.codigo)
                              else retail.fn_pedido_web_no_admite(p, 'cobrar') end
      using errcode = 'P0001', hint = 'pedido_web_no_cobrable';
  end if;
  if p_monto is null or not (abs(p_monto) < 'Infinity') or p_monto <= 0 then
    raise exception 'Escribe el monto: más de S/ 0.' using errcode = '22023', hint = 'pedido_web_monto';
  end if;
  if round(p_monto, 2) <> p_monto then
    raise exception 'El monto lleva hasta dos decimales.' using errcode = '22023', hint = 'pedido_web_monto';
  end if;
  if p_monto > p.total - p.pagado then
    raise exception 'Es más de lo que falta pagar (S/ %).', to_char(p.total - p.pagado, 'FM999999990.00')
      using errcode = 'P0001', hint = 'pedido_web_pasa_el_total';
  end if;
  if p_medio is null or p_medio not in ('efectivo', 'yape', 'plin', 'transferencia') then
    raise exception 'Elige cómo pagó: efectivo, Yape, Plin o transferencia.' using errcode = '22023', hint = 'pedido_web_medio';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  if p_medio = 'efectivo' then
    if nullif(btrim(coalesce(p_numero_operacion, '')), '') is not null then
      raise exception 'El efectivo no lleva n.º de operación.' using errcode = '22023', hint = 'pedido_web_operacion';
    end if;
    select c.id into v_caja from retail.cajas c where c.ubicacion_id = p.ubicacion_id and c.estado = 'abierta' for share;
    if v_caja is null then
      select u.nombre into v_tienda from retail.ubicaciones u where u.id = p.ubicacion_id;
      raise exception 'No hay una caja abierta en %: ábrela antes de cobrar en efectivo.', coalesce(v_tienda, 'esta tienda')
        using errcode = 'P0001', hint = 'pedido_web_sin_caja';
    end if;
    insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota)
      values (v_caja, 'ingreso', p_monto, 'Pago del pedido web ' || p.codigo, v_persona,
              'En custodia hasta que el cliente recoja: no es venta')
      returning id into v_cm;
  else
    v_op := regexp_replace(coalesce(p_numero_operacion, ''), '\s', '', 'g');
    if v_op !~ '^[0-9]{6,12}$' then
      raise exception 'El n.º de operación tiene de 6 a 12 dígitos: cópialo de tu app o del banco.'
        using errcode = '22023', hint = 'pedido_web_operacion';
    end if;
    select w.codigo into v_otro
      from retail.pedido_web_pagos g join retail.pedidos_web w on w.id = g.pedido_id
     where g.numero_operacion = v_op and g.estado <> 'anulado'
     limit 1;
    if v_otro is not null then
      raise exception 'Ese n.º de operación ya se registró en el pedido %.', v_otro
        using errcode = 'P0001', hint = 'pedido_web_operacion_repetida';
    end if;
  end if;

  begin
    insert into retail.pedido_web_pagos (pedido_id, origen, medio, monto, estado, numero_operacion, caja_movimiento_id,
                                         registrado_por, token_cliente)
      values (p.id, 'tienda', p_medio, p_monto, 'aprobado', case when p_medio <> 'efectivo' then v_op end, v_cm, v_persona, p_token)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'pedido_web_pagos_operacion_unica' then
      -- Otra caja anotó el mismo n.º en el mismo instante (el índice es la última red).
      select w.codigo into v_otro
        from retail.pedido_web_pagos g join retail.pedidos_web w on w.id = g.pedido_id
       where g.numero_operacion = v_op and g.estado <> 'anulado'
       limit 1;
      raise exception 'Ese n.º de operación ya se registró en el pedido %.', coalesce(v_otro, 'otro')
        using errcode = 'P0001', hint = 'pedido_web_operacion_repetida';
    end if;
    raise;
  end;
  return retail.fn_pedido_web_pago_respuesta(v_id);
end;
$$;

-- Anular un pago (el ERP): `error_al_anotar` (se anotó mal: se anula y se vuelve a anotar bien) o `devuelto_al_cliente` (se le
-- devolvió el dinero, por ejemplo al anular el pedido). Un pedido pagado completo ya tiene su boleta: no se anula aquí.
create or replace function retail.anular_pago_pedido_web(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  g retail.pedido_web_pagos%rowtype;
  v_persona uuid;
  v_caja uuid;
  v_cm uuid;
  v_tienda text;
begin
  select w.* into p
    from retail.pedidos_web w join retail.pedido_web_pagos x on x.pedido_id = w.id
   where x.id = p_pago_id
     for update of w;
  if not found then
    raise exception 'Ese pago no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  select * into g from retail.pedido_web_pagos x where x.id = p_pago_id for update;
  if g.origen <> 'tienda' then
    raise exception 'Un cobro de la pasarela se devuelve desde la pasarela.' using errcode = 'P0001', hint = 'pedido_web_pago_pasarela';
  end if;
  if g.estado <> 'aprobado' then
    raise exception 'Ese pago ya estaba anulado.' using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if p.estado in ('pagado', 'entregado') then
    raise exception 'El pedido web % ya quedó pagado completo y su boleta sale en ese momento: devolver un pago ya no es anularlo.', p.codigo
      using errcode = 'P0001', hint = 'pedido_web_pagado';
  end if;
  if p_motivo is null or p_motivo not in ('error_al_anotar', 'devuelto_al_cliente') then
    raise exception 'Elige por qué se anula el pago: se anotó por error o se le devolvió al cliente.'
      using errcode = '22023', hint = 'pedido_web_motivo';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  if g.medio = 'efectivo' then
    select c.id into v_caja from retail.cajas c where c.ubicacion_id = p.ubicacion_id and c.estado = 'abierta' for share;
    if v_caja is null then
      select u.nombre into v_tienda from retail.ubicaciones u where u.id = p.ubicacion_id;
      raise exception 'No hay una caja abierta en %: ábrela para sacar el efectivo de este pago.', coalesce(v_tienda, 'esta tienda')
        using errcode = 'P0001', hint = 'pedido_web_sin_caja';
    end if;
    insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota)
      values (v_caja, 'egreso', g.monto, 'Anula un pago del pedido web ' || p.codigo, v_persona,
              case p_motivo when 'devuelto_al_cliente' then 'Se le devolvió al cliente' else 'Se había anotado por error' end)
      returning id into v_cm;
  end if;

  update retail.pedido_web_pagos x
     set estado = 'anulado', anulado_en = now(), anulado_por = v_persona, anulado_motivo = p_motivo, anulado_caja_movimiento_id = v_cm
   where x.id = g.id;
  return retail.fn_pedido_web_pago_respuesta(g.id);
end;
$$;

-- El aviso de la pasarela (futura). `p_estado`: 'pendiente' | 'aprobado' | 'rechazado', como lo diga el aviso firmado.
-- Devuelve el pago con `ok` (true si quedó como avisó) y, si no, `motivo`: quien recibe el aviso está obligado a mirarlo.
create or replace function retail.fn_registrar_aviso_pasarela_pedido_web(p_pedido_id uuid, p_proveedor text, p_referencia_externa text,
                                                                         p_estado text, p_monto numeric, p_medio text default 'tarjeta')
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  g retail.pedido_web_pagos%rowtype;
  v_ref text := btrim(coalesce(p_referencia_externa, ''));
  v_estado text;
  v_observacion text;
  v_id uuid;
  v_repetido boolean := false;
  v_ignorado boolean := false;
begin
  if p_proveedor is null or p_proveedor !~ '^[a-z][a-z0-9_]{1,29}$' then
    raise exception 'La pasarela no es válida.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;
  if char_length(v_ref) not between 1 and 100 then
    raise exception 'El aviso de la pasarela no trae su referencia.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;
  if p_estado is null or p_estado not in ('pendiente', 'aprobado', 'rechazado') then
    raise exception 'El aviso de la pasarela trae un estado que no se conoce.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;
  if p_medio is null or p_medio not in ('tarjeta', 'yape', 'plin', 'transferencia') then
    raise exception 'El aviso de la pasarela trae un medio que no se conoce.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;
  if p_monto is null or not (abs(p_monto) < 'Infinity') or p_monto <= 0 or round(p_monto, 2) <> p_monto then
    raise exception 'El aviso de la pasarela trae un monto que no es válido.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;

  -- El candado del pedido ordena dos avisos que llegan a la vez: el segundo ve lo que dejó el primero.
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'El aviso de la pasarela es de un pedido web que no existe.' using errcode = '22023', hint = 'pasarela_aviso_invalido';
  end if;

  select * into g from retail.pedido_web_pagos x where x.proveedor = p_proveedor and x.referencia_externa = v_ref for update;
  if found then
    if g.pedido_id <> p.id or g.monto <> p_monto or g.medio <> p_medio then
      raise exception 'El aviso no coincide con el cobro que ya se registró con esa referencia.'
        using errcode = 'P0001', hint = 'pasarela_aviso_no_coincide';
    end if;
    if g.estado = p_estado or (g.estado = 'por_revisar' and p_estado = 'aprobado') then
      v_repetido := true;            -- el mismo aviso otra vez: no cambia nada
      v_id := g.id;
    elsif g.estado = 'pendiente' then
      v_id := g.id;                  -- el que seguía pendiente se resuelve
    else
      v_ignorado := true;            -- un aviso viejo o contradictorio no hace retroceder el pago: se avisa, no se aplica
      v_id := g.id;
    end if;
  end if;

  if not v_repetido and not v_ignorado then
    v_estado := p_estado;
    if p_estado = 'aprobado' then
      if p.estado <> 'confirmado' then
        v_estado := 'por_revisar';
        v_observacion := format('La pasarela cobró S/ %s, pero el pedido %s estaba «%s»: no se le suma. Revísalo con el cliente (devolverlo).',
                                to_char(p_monto, 'FM999999990.00'), p.codigo, p.estado);
      elsif p_monto > p.total - p.pagado then
        v_estado := 'por_revisar';
        v_observacion := format('La pasarela cobró S/ %s y al pedido %s le faltaban S/ %s: no se le suma. Revísalo con el cliente.',
                                to_char(p_monto, 'FM999999990.00'), p.codigo, to_char(p.total - p.pagado, 'FM999999990.00'));
      end if;
    end if;
    if v_id is null then
      begin
        insert into retail.pedido_web_pagos (pedido_id, origen, medio, monto, estado, proveedor, referencia_externa, observacion)
          values (p.id, 'pasarela', p_medio, p_monto, v_estado, p_proveedor, v_ref, v_observacion)
          returning id into v_id;
      exception when unique_violation then
        -- Un aviso con la misma referencia para OTRO pedido que llegó en el mismo instante (el del mismo pedido ya esperó
        -- el candado de arriba): no es este cobro.
        raise exception 'El aviso no coincide con el cobro que ya se registró con esa referencia.'
          using errcode = 'P0001', hint = 'pasarela_aviso_no_coincide';
      end;
    else
      update retail.pedido_web_pagos x
         set estado = v_estado, observacion = coalesce(v_observacion, x.observacion), actualizado_en = now()
       where x.id = v_id;
    end if;
  end if;

  select * into g from retail.pedido_web_pagos x where x.id = v_id;
  return retail.fn_pedido_web_pago_respuesta(v_id) || jsonb_build_object(
    'ok', g.estado = p_estado,
    'repetido', v_repetido,
    'motivo', case when v_ignorado then 'aviso_no_aplica'
                   when g.estado = 'por_revisar' then 'pedido_no_lo_admite' end);
end;
$$;

revoke all on function retail.fn_pedido_web_pago_respuesta(uuid) from public, anon, authenticated;
-- La pasarela: nadie todavía (la ruta que reciba el aviso firmado decide con qué rol la llama).
revoke all on function retail.fn_registrar_aviso_pasarela_pedido_web(uuid, text, text, text, numeric, text) from public, anon, authenticated;
-- El ERP: `authenticated`, con el permiso (módulo y tienda) adentro.
revoke all on function retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid) from public, anon;
revoke all on function retail.anular_pago_pedido_web(uuid, text) from public, anon;
grant execute on function retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid) to authenticated;
grant execute on function retail.anular_pago_pedido_web(uuid, text) to authenticated;

comment on function retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid) is
  'Pedidos web (ADR-0408): anota un pago coordinado por WhatsApp. Digital con n.º de operación único; efectivo a la caja abierta. Nunca pasa lo que falta.';
comment on function retail.anular_pago_pedido_web(uuid, text) is
  'Pedidos web: anula un pago (error_al_anotar, devuelto_al_cliente). El efectivo sale de la caja abierta. Un pedido pagado completo no se toca aquí.';
comment on function retail.fn_registrar_aviso_pasarela_pedido_web(uuid, text, text, text, numeric, text) is
  'Pedidos web: el aviso de una pasarela (futura). Idempotente por (proveedor, referencia); lo que no cabe queda por revisar y devuelve ok=false.';
