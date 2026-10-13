-- ============================================================================
-- 20261013200000_token_sigue_al_contenido_parte1.sql — CAYLA V2 (/chaos 2026-10-13, Felipe 2026-10-13)
--
-- EL PROBLEMA PRIMERO. Cada pantalla que guarda manda un `p_token` para que un doble toque o un reintento tras una red
-- caída no guarde dos veces: la función busca el token y, si ya existe, devuelve lo que guardó el primero. Pero solo
-- mira el TOKEN, no lo que se manda con él. El 2026-10-13 /chaos lo vio en Vender: la respuesta del cobro se pierde, la
-- vendedora saca una prenda del ticket (o agrega otra) y vuelve a cobrar; la pantalla reusa el mismo token, la base
-- devuelve la venta VIEJA y la pantalla anuncia la NUEVA. La boleta, el stock y la caja dicen una cosa; la vendedora y la
-- clienta, otra. Es el mismo defecto en las once funciones de Ventas y Caja que reciben un token.
--
-- LA DECISIÓN. El token sigue al contenido, en la base: la primera vez que llega un token se anota su HUELLA (el md5 de
-- todo lo que se mandó con él, menos el token) en `intentos_con_token`. Si vuelve el mismo token con la misma huella, es
-- un reintento de verdad y la función sigue como siempre (devuelve lo que ya guardó). Si vuelve con OTRA huella, se
-- rechaza (`token_reusado`): la pantalla tiene que preguntar primero qué pasó con el envío anterior. Para eso está
-- `fn_resolver_intento`: dice si un envío llegó (`hecho`, con lo que guardó) o no (`no_llego`). Un «no llegó» es
-- definitivo: deja una marca, y si ese envío aparece después (estaba en camino), se rechaza (`intento_descartado`). Así
-- la pantalla nunca anuncia algo distinto de lo que quedó guardado.
--
-- Esta parte crea la tabla y las dos funciones; la parte 2 hace que las once funciones llamen a la primera.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_intento_con_huella(op, token, huella)` no hace nada con un token nulo; con un token nuevo lo anota; con
--            uno conocido y la misma huella, no hace nada; con otra huella, `token_reusado`; con uno descartado,
--            `intento_descartado`. Dos envíos simultáneos con el mismo token se ordenan por la llave primaria: el segundo
--            espera al primero. `fn_resolver_intento(op, token)` devuelve `{estado: 'hecho', …}` si la fila existe (y la
--            cuenta puede ver su tienda), o `{estado: 'no_llego'}` después de dejar la marca de descartado. Si el envío
--            original todavía está guardando, el resolver espera a que termine y responde lo que pasó de verdad.
--   ASUME:   las columnas `token_cliente` de ventas, caja_movimientos, gastos, separaciones, separacion_abonos,
--            separacion_ediciones, cambios y transferencias; `fn_puede_operar_ubicacion` y `fn_es_lider`.
--   NO HACE: no toca las funciones que guardan (parte 2), ni las tablas que ya existen, ni políticas.
--
-- CÓMO SE PEGA. Una sola parte: una tabla NUEVA (con RLS encendido y sin políticas: solo la leen funciones `security
-- definer`, ADR-0195) y dos funciones. No hay `alter` de una tabla en uso ni políticas. Idempotente.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.intentos_con_token (
  operacion text not null,
  token uuid not null,
  -- md5 de todo lo que se mandó con el token (menos el token). Vacío en una marca de «no llegó».
  huella text not null,
  creado_en timestamptz not null default now(),
  -- Con fecha: `fn_resolver_intento` dio este envío por no llegado; si aparece después, se rechaza.
  descartado_en timestamptz,
  primary key (operacion, token)
);
alter table retail.intentos_con_token enable row level security;
revoke all on retail.intentos_con_token from public, anon, authenticated;

comment on table retail.intentos_con_token is
  'La huella de cada envío con token de Ventas y Caja: un mismo token con otro contenido se rechaza. La escriben las funciones que guardan y fn_resolver_intento.';

-- ----------------------------------------------------------------------------
-- La regla: el mismo token solo vale para el mismo contenido.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_intento_con_huella(p_operacion text, p_token uuid, p_huella text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_huella text;
  v_descartado timestamptz;
begin
  if p_token is null then
    return;
  end if;
  insert into retail.intentos_con_token (operacion, token, huella) values (p_operacion, p_token, p_huella)
  on conflict (operacion, token) do nothing;
  if found then
    return;
  end if;
  for v_huella, v_descartado in
    select i.huella, i.descartado_en from retail.intentos_con_token i where i.operacion = p_operacion and i.token = p_token
  loop
    exit;
  end loop;
  if v_descartado is not null then
    raise exception 'Este envío ya se dio por no llegado. Vuelve a guardarlo desde la pantalla.'
      using errcode = 'P0001', hint = 'intento_descartado';
  end if;
  if v_huella is distinct from p_huella then
    raise exception 'Lo que mandas ahora no es lo que se mandó la primera vez. Revisa si el envío anterior se guardó antes de volver a intentar.'
      using errcode = 'P0001', hint = 'token_reusado';
  end if;
end;
$$;

comment on function retail.fn_intento_con_huella(text, uuid, text) is
  'Interna: anota la huella de un envío con token; el mismo token con otra huella se rechaza (token_reusado) y uno descartado también (intento_descartado).';
revoke all on function retail.fn_intento_con_huella(text, uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- La pregunta de la pantalla: ¿llegó mi envío?
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
                         'enviar_pedido_para_apartar', 'registrar_cambio', 'separar_pedido_para_apartar') then
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
    elsif p_operacion = 'enviar_pedido_para_apartar' then
      for v_id, v_ubicacion, v_datos in
        select t.id, t.ubicacion_origen_id, jsonb_build_object('transferencia_id', t.id, 'creado_en', t.created_at)
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
