-- ============================================================================
-- 20261015052000_pedidos_web_entregar.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 10 (parte 2 de 3): entregar con el código
-- de 4 cifras
--
-- EL PROBLEMA PRIMERO. Un pedido pagado completo ya tiene su venta y su boleta (20261015051000), y sus prendas siguen reservadas en la
-- tienda hasta que el cliente las recoge. Faltaba lo último: que la tienda lo ENTREGUE. El cliente muestra en su teléfono el código de 4
-- cifras de su pedido (propuesta m); la caja lo escribe y, si es el suyo, el pedido se entrega: cada prenda deja de estar reservada y
-- sale del stock con su salida de venta, firmada por el responsable. Si el código está mal, no se entrega nada.
--
-- QUÉ HACE
--   1. `entregar_pedido_web(pedido, código, marca)`: en UNA transacción, con el permiso del módulo y la tienda (`fn_pedido_web_exigir`):
--        · el pedido tiene que estar pagado completo y LISTO PARA RECOGER: todas sus prendas reservadas en su tienda (una que todavía
--          viene en un traslado, o que está por conseguir, no deja entregar: lo dice y no toca nada);
--        · el código tiene que ser el de ese pedido (4 cifras; los espacios no cuentan). Mal escrito, nada se entrega;
--        · cada prenda pasa a «entregada», su reserva se cierra (la «liberacion_apartado» del libro y el apartado cerrado como «entregada»,
--          el mismo cierre de un apartado de tienda) y sale del stock con su «salida» de venta, enlazada a SU línea de venta (INV-03);
--        · el pedido queda «entregado», con quién y cuándo. La venta y la boleta no cambian: nacieron al pagarse.
--      Entregar dos veces no duplica nada: el candado del pedido ordena dos cajas a la vez (la segunda lo ve entregado), y la misma marca
--      (un doble clic, una red que se cayó después de guardar) devuelve la MISMA entrega. La marca sigue al contenido
--      (`fn_intento_con_huella`): la misma con otro pedido u otro código se rechaza.
--   2. `fn_resolver_intento` sabe revisar una entrega («Revisar si se guardó», cuando la respuesta se perdió).
--   3. Lo que la pantalla lee: el detalle del pedido dice su venta, su boleta (número y en qué va su envío a SUNAT) y quién lo entregó;
--      «Mis pedidos» de la tienda online dice el número de su boleta. El código para recoger NO sale en el ERP: lo muestra el cliente.
--
-- POR QUÉ ASÍ.
--   DECIDÍ: entregar el pedido entero, no prenda por prenda: el cliente elige una tienda para recoger todo (decisión de Felipe en la
--     maqueta) y el pedido tiene un solo código. Hasta que todo esté en la tienda, se avisa (el aviso de 7 días corre desde que está listo).
--   DECIDÍ: entregar no pide caja abierta: no mueve plata (todo se pagó antes y la venta ya cayó en la caja del día en que se completó).
--   DESCARTÉ: mostrar el código en el ERP para «comprobarlo a ojo»: cualquiera en el mostrador podría reclamar el pedido con solo su
--     número. La tienda escribe lo que el cliente muestra y la base lo compara.
--   SE ROMPE SI: alguien vuelve a pegar 20261014235000 (el motor) después de esta: el disparador de las reglas pierde el candado de la
--     marca de entrega. Se arregla volviendo a pegar 20261015051000 y esta. `pnpm pruebas:pedidos-web-entregar` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de 20261015051000. Una sola parte, sin políticas ni
-- `drop trigger`; el `alter table` es de `pedidos_web`, que nadie usa todavía en producción. Re-ejecutable (anclas idempotentes; si un
-- ancla no aparece exactamente una vez, aborta sin tocar nada). Ningún `select … into` dentro de un texto entre comillas.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 1. La marca de la entrega (un doble clic o un reintento devuelve la MISMA entrega)
-- ----------------------------------------------------------------------------
alter table retail.pedidos_web add column if not exists entrega_token uuid;
create unique index if not exists pedidos_web_entrega_token_key on retail.pedidos_web (entrega_token) where entrega_token is not null;
comment on column retail.pedidos_web.entrega_token is
  'La marca del intento con que se entregó (ADR-0408 act. 10): el mismo intento devuelve la misma entrega. Se anota al entregar y no cambia.';

-- Se anota una sola vez, al entregar, y no cambia. (Va antes del candado de la venta de 20261015051000, sin tocar su texto.)
select pg_temp.anclar('retail.fn_pedido_web_reglas()',
  $v$  -- ADR-0408 act. 10: la venta del pedido se anota una sola vez, cuando queda pagado completo, y no se cambia.$v$,
  $n$  -- ADR-0408 act. 10: la marca de la entrega se anota una sola vez, al entregar, y no se cambia.
  if new.entrega_token is distinct from old.entrega_token
     and (old.entrega_token is not null or new.estado <> 'entregado') then
    raise exception 'La marca de la entrega de un pedido web se anota al entregarlo, y no se cambia.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- ADR-0408 act. 10: la venta del pedido se anota una sola vez, cuando queda pagado completo, y no se cambia.$n$);

-- ----------------------------------------------------------------------------
-- 2. Entregar
-- ----------------------------------------------------------------------------
create or replace function retail.entregar_pedido_web(p_pedido_id uuid, p_codigo text, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  a retail.apartados%rowtype;
  l record;
  v_codigo text := regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g');
  v_existente uuid;
  v_persona uuid;
  v_falta text;
  v_mov uuid;
begin
  -- La marca sigue al contenido (como el cobro): la misma marca con otro pedido u otro código se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('entregar_pedido_web', p_token, md5(jsonb_build_array(p_pedido_id, v_codigo)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_entrega:' || p_token::text, 0));
    v_existente := (select w.id from retail.pedidos_web w where w.entrega_token = p_token);
    if v_existente is not null then
      if v_existente <> p_pedido_id then
        raise exception 'Esa marca de entrega es de otro pedido.' using errcode = '22023', hint = 'pedido_web_token';
      end if;
      return retail.fn_pedido_web_entrega_respuesta(v_existente) || jsonb_build_object('repetido', true);
    end if;
  end if;

  -- El candado del pedido: dos cajas que lo entregan a la vez se ordenan aquí; la segunda lo ve entregado.
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado <> 'pagado' then
    raise exception '%', case when p.estado in ('por_confirmar', 'confirmado')
                              then format('El pedido web %s todavía no está pagado completo: se entrega cuando lo esté.', p.codigo)
                              else retail.fn_pedido_web_no_admite(p, 'entregar') end
      using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;

  -- Listo para recoger: todo en su tienda y reservado. Lo que viene en camino o está por conseguir no deja entregar.
  v_falta := (select string_agg(coalesce(pr.referencia, 'Una prenda') || coalesce(' ' || t.valor, ''), ', ' order by x.posicion)
                from retail.pedido_web_lineas x
                join retail.variantes va on va.id = x.variante_id
                join retail.productos pr on pr.id = va.producto_id
                left join retail.tallas t on t.id = va.talla_id
               where x.pedido_id = p.id and x.estado <> 'quitada'
                 and (x.estado <> 'reservada' or x.ubicacion_id is distinct from p.ubicacion_id));
  if v_falta is not null then
    raise exception 'El pedido web % todavía no se puede entregar: falta que llegue a la tienda %.', p.codigo, v_falta
      using errcode = 'P0001', hint = 'pedido_web_no_listo';
  end if;

  -- El código que el cliente muestra en su pedido.
  if v_codigo !~ '^[0-9]{4}$' then
    raise exception 'El código para recoger tiene 4 cifras: pídeselo al cliente, lo ve en su pedido.'
      using errcode = '22023', hint = 'pedido_web_codigo';
  end if;
  if v_codigo <> p.codigo_recojo then
    raise exception 'Ese código no es el del pedido %. Pídele al cliente el de su pedido: lo ve en «Mis pedidos».', p.codigo
      using errcode = 'P0001', hint = 'pedido_web_codigo_incorrecto';
  end if;

  v_persona := retail.fn_pedido_web_actor();

  -- ADR-0190: el stock de sus prendas, bloqueado en orden antes de mover nada.
  perform retail.fn_bloquear_en_orden(p.ubicacion_id,
    array(select distinct x.variante_id from retail.pedido_web_lineas x where x.pedido_id = p.id and x.estado = 'reservada'));

  for l in
    select x.id, x.variante_id, x.apartado_id, x.venta_item_id
      from retail.pedido_web_lineas x
     where x.pedido_id = p.id and x.estado = 'reservada'
     order by x.posicion
       for update
  loop
    if l.venta_item_id is null then
      raise exception 'Una prenda del pedido web % no tiene su línea de venta.', p.codigo using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    -- (1) La prenda se entrega (primero la línea: con ella reservada, la reserva no se deja cerrar desde afuera).
    update retail.pedido_web_lineas x set estado = 'entregada' where x.id = l.id;
    -- (2) Su reserva se cierra como la de un apartado entregado.
    select * into a from retail.apartados ap where ap.id = l.apartado_id for update;
    if not found or a.estado <> 'abierto' then
      raise exception 'La reserva de una prenda del pedido web % ya no estaba abierta.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota)
      values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'liberacion_apartado', a.cantidad, 'liberacion_apartado', v_persona,
              left('Pedido web ' || p.codigo || ': se entrega al cliente', 500))
      returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
    update retail.apartados ap
       set estado = 'liberado', cerrado_por = v_persona, cerrado_en = now(), cierre_motivo = 'entregada', movimiento_cierre_id = v_mov
     where ap.id = a.id;
    -- (3) Y sale del stock: la salida de venta de SU línea de venta (la que nació al pagarse).
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id, nota)
      values (a.variante_id, a.ubicacion_id, a.sububicacion_id, 'salida', 1, 'venta', l.venta_item_id, v_persona,
              left('Pedido web ' || p.codigo || ': entregado con su código', 500))
      returning id into v_mov;
    perform retail.fn_aplicar_movimiento(v_mov);
  end loop;

  update retail.pedidos_web w
     set estado = 'entregado', entregado_en = now(), entregado_por = v_persona, entrega_token = p_token
   where w.id = p.id;
  return retail.fn_pedido_web_entrega_respuesta(p.id) || jsonb_build_object('repetido', false);
end;
$$;

-- Lo que responde una entrega: el resumen del pedido con su venta y su boleta.
create or replace function retail.fn_pedido_web_entrega_respuesta(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_pedido_web_resumen(w.id) || jsonb_build_object(
    'venta_id', w.venta_id, 'entregado_en', w.entregado_en,
    'boleta', (select c.serie || '-' || lpad(c.numero::text, 6, '0') from retail.comprobantes c
                where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura') order by c.created_at desc limit 1))
    from retail.pedidos_web w
   where w.id = p_pedido_id;
$$;

comment on function retail.entregar_pedido_web(uuid, text, uuid) is
  'Pedidos web (ADR-0408 act. 10): entrega un pedido pagado y listo para recoger con el código de 4 cifras del cliente. Cada prenda deja su reserva y sale del stock con la salida de su línea de venta. Código mal: nada se entrega. La misma marca devuelve la misma entrega.';

-- ----------------------------------------------------------------------------
-- 3. «Revisar si se guardó» sabe revisar una entrega. La misma pieza y la misma forma de 20261015042000 (`pg_temp.reemplazar` sobre
--    la lista de operaciones): `apps/web/lib/intento-reglas.test.ts` lee de aquí qué operaciones sabe revisar la base.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
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

select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$'separar_pedido_para_apartar', 'registrar_pago_pedido_web'$v$,
$n$'separar_pedido_para_apartar', 'registrar_pago_pedido_web', 'entregar_pedido_web'$n$,
1);
select pg_temp.anclar('retail.fn_resolver_intento(text, uuid)',
  $v$    elsif p_operacion in ('registrar_movimiento_caja', 'registrar_ingreso_caja') then$v$,
  $n$    elsif p_operacion = 'entregar_pedido_web' then
      -- ADR-0408 (actividad 10): la entrega de un pedido web. Se revisa en la tienda del pedido, como lo demás de una tienda.
      for v_id, v_ubicacion, v_datos in
        select w.id, w.ubicacion_id,
               jsonb_build_object('pedido_id', w.id, 'codigo', w.codigo, 'estado_pedido', w.estado, 'entregado_en', w.entregado_en,
                                  'venta_id', w.venta_id)
          from retail.pedidos_web w where w.entrega_token = p_token
      loop
        exit;
      end loop;
    elsif p_operacion in ('registrar_movimiento_caja', 'registrar_ingreso_caja') then$n$);

-- ----------------------------------------------------------------------------
-- 4. Lo que leen las pantallas
-- ----------------------------------------------------------------------------

-- El ERP: la venta del pedido, su boleta (y en qué va su envío a SUNAT) y quién lo entregó. El código para recoger no sale aquí.
select pg_temp.anclar('retail.fn_pedido_web_detalle(uuid)',
  $v$    'plazos', jsonb_build_object('horas_para_confirmar', v_horas_confirmar, 'horas_aviso_sin_pagar', v_horas_pagar,$v$,
  $n$    -- ADR-0408 act. 10: la venta del pedido pagado completo, su boleta y quién lo entregó. El código para recoger no sale aquí: lo
    -- muestra el cliente y la tienda lo escribe al entregar.
    'venta_id', (select w.venta_id from retail.pedidos_web w where w.id = p_pedido_id),
    'boleta', (select jsonb_build_object('comprobante_id', c.id, 'tipo', c.tipo, 'serie', c.serie, 'numero', c.numero,
                                          'texto', c.serie || '-' || lpad(c.numero::text, 6, '0'), 'estado', c.estado)
                 from retail.pedidos_web w join retail.comprobantes c on c.venta_id = w.venta_id
                where w.id = p_pedido_id and c.tipo in ('boleta', 'factura')
                order by c.created_at desc limit 1),
    'entregado_por', (select pe.nombres from retail.pedidos_web w join public.personas pe on pe.id = w.entregado_por
                       where w.id = p_pedido_id),
    'plazos', jsonb_build_object('horas_para_confirmar', v_horas_confirmar, 'horas_aviso_sin_pagar', v_horas_pagar,$n$);

-- La tienda online («Mis pedidos»): el número de la boleta de su pedido.
select pg_temp.anclar('retail.fn_pedidos_web_de_clienta(uuid, integer, integer)',
  $v$             'codigo_recojo', case when h.listo_para_recoger then w.codigo_recojo end,$v$,
  $n$             'codigo_recojo', case when h.listo_para_recoger then w.codigo_recojo end,
             -- ADR-0408 act. 10: el número de su boleta (nace al quedar pagado completo).
             'boleta', (select c.serie || '-' || lpad(c.numero::text, 6, '0') from retail.comprobantes c
                         where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura') and c.estado not in ('anulado', 'no_emitido')
                         order by c.created_at desc limit 1),$n$);

-- ----------------------------------------------------------------------------
-- 5. Quién ejecuta qué
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_pedido_web_entrega_respuesta(uuid) from public, anon, authenticated;
revoke all on function retail.entregar_pedido_web(uuid, text, uuid) from public, anon;
grant execute on function retail.entregar_pedido_web(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Comprobación: si algo no quedó, la migración no se da por aplicada.
-- ----------------------------------------------------------------------------
do $$
begin
  if position('entrega_token' in pg_get_functiondef('retail.fn_pedido_web_reglas()'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_reglas no quedó cuidando la marca de la entrega';
  end if;
  if position('p_operacion = ''entregar_pedido_web''' in pg_get_functiondef('retail.fn_resolver_intento(text, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_resolver_intento no quedó sabiendo revisar una entrega';
  end if;
  if position('''boleta''' in pg_get_functiondef('retail.fn_pedido_web_detalle(uuid)'::regprocedure)) = 0
     or position('''boleta''' in pg_get_functiondef('retail.fn_pedidos_web_de_clienta(uuid, integer, integer)'::regprocedure)) = 0 then
    raise exception 'las lecturas del pedido no quedaron diciendo su boleta';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
