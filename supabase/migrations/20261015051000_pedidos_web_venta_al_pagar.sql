-- ============================================================================
-- 20261015051000_pedidos_web_venta_al_pagar.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 10 (parte 1 de 3): la venta y la
-- boleta nacen con el pago que completa el total
--
-- EL PROBLEMA PRIMERO. Felipe decidió (ADR-0408, DECIDÍ 9, 2026-10-14) que la boleta de un pedido web sale SOLA en el momento en que el
-- pedido queda pagado completo, no con un botón; y que la prenda sale del stock recién al ENTREGARLA (sigue colgada o guardada en la
-- tienda hasta que el cliente la recoge). Hasta hoy el motor (20261014235000/20261015000000) solo dejaba el pedido «pagado»: no había
-- venta, ni boleta, ni nada que dijera que esa plata ya era una venta. Y una venta cobrada cuya prenda todavía no salió choca con dos
-- reglas que el ERP cuida en todas partes: INV-03 («cada línea de una venta completada tiene su salida de stock») y la de los anticipos
-- (`venta_pagos_anticipo_solo_de_apartado`: un pago «anticipo» solo existe en la entrega de un apartado).
--
-- QUÉ HACE
--   1. `pedidos_web.venta_id` (la venta del pedido) y `pedido_web_lineas.venta_item_id` (UNA línea de venta por prenda, de una unidad):
--      se anotan una sola vez, al quedar pagado completo, y no se cambian (los disparadores de las reglas lo hacen cumplir).
--   2. `fn_pedido_web_vender(pedido, persona)`: en la MISMA transacción del pago que completa el total nace la venta, como la de un
--      apartado al entregarse (`entregar_separacion`, ADR-0399): las prendas no quitadas como líneas (precio y descuento de campaña del
--      pedido, costo de hoy), UN pago «anticipo» por todo lo pagado (la plata ya entró con cada pago del pedido: el efectivo a la caja y lo
--      digital al banco, así que la venta no la cuenta otra vez) y la boleta por el TOTAL con `emitir_comprobante`, la misma pieza que usa
--      Apartados, con el DNI y el nombre de la ficha del cliente. La boleta queda «pendiente»: la manda a SUNAT la pantalla (el mismo
--      `/api/lucode/emitir` que usa Vender) o el barrido de la cola. Esta transacción NUNCA llama a Lucode: si Lucode o SUNAT no responden,
--      el cobro se guarda igual y la boleta espera en la cola (principio 9).
--   3. `registrar_pago_pedido_web` llama a `fn_pedido_web_vender` cuando su pago llegó al total, y antes de anotar nada exige una caja
--      abierta en la tienda del pedido si ese pago es el que lo completa: toda venta cae en la caja del día de su tienda (INV-04).
--   4. El aviso de una pasarela (futura) que completaría el pedido queda «por revisar» (no se pierde ni suma): una boleta necesita una caja
--      abierta y quién la firma, y el aviso no trae ninguna de las dos. Se decide al construir la pasarela.
--   5. `fn_anticipo_solo_de_apartado` acepta también la venta de un pedido web (su candado diferido de 20261013155000).
--   6. La verificación del pedido entero (`fn_pedido_web_verificar`, al confirmar la transacción): pagado o entregado ⇔ tiene su venta, de
--      su tienda, con una línea por prenda no quitada y nada más, cobrada con un solo «anticipo» por lo pagado y con su boleta; y lo
--      vendido sale del stock solo al entregarse (una salida por prenda entregada, ninguna por la que todavía espera).
--   7. Mientras el pedido no se entrega, su venta no admite cambio, devolución ni anulación (la prenda nunca salió: devolverla la haría
--      entrar dos veces). Dos disparadores sobre `cambios` y `devolucion_items` (como el de la liquidación, «venta final») y un ancla en
--      `anular_venta`. Lo que pasa con un pedido pagado que no se recoge (o que se anula) espera la decisión de Felipe.
--
-- POR QUÉ ASÍ (/rigor, lente de conjuntos).
--   DECIDÍ: la venta del pedido es una venta «completada» como cualquiera, desde el pago, y la prenda pendiente de entrega queda fuera de
--     INV-03 solo mientras su línea del pedido no se entrega. Así cada reporte (Resumen, Ventas, Análisis, IGV) la cuenta UNA vez, el día de
--     su boleta, y el stock la sigue mostrando reservada (no libre) hasta que sale: Análisis y Frescura cuentan lo LIBRE
--     (`fn_existencias_base`), así que la unidad nunca está a la vez vendida y disponible.
--   DESCARTÉ: un estado nuevo de venta («por entregar»). Hay más de cien lectores de `ventas`: unos filtran `estado = 'completada'` y
--     otros `estado <> 'anulada'`. Hoy esos dos conjuntos son el mismo; con un tercer estado dejan de serlo, y la venta por entregar
--     caería justo en la diferencia: contada en la caja y en Finanzas, ausente en Ventas y en Análisis. Además obligaba a cambiar dos
--     CHECK de `ventas`, la tabla más usada en producción.
--   DESCARTÉ: crear la venta al entregar (como Apartados). La boleta tiene que salir al cobrar el total (SUNAT: al cobrar o al entregar, lo
--     que pase primero), y una boleta cuelga de su venta.
--   DESCARTÉ: una línea de venta por modelo con su cantidad. Una por prenda del pedido hace que la relación prenda ↔ línea de venta sea
--     uno a uno: la verificación es una igualdad de conjuntos (nada sobra en ningún lado), no una suma por modelo que puede compensarse.
--   SE ROMPE SI: alguien vuelve a pegar 20261014235000, 20261015000000 o 20261015010000 después de esta (sus `create or replace` borran
--     las anclas: el pago completo dejaría el pedido pagado SIN venta, y la verificación lo rechazaría al confirmar la transacción). Se
--     arregla volviendo a pegar esta. `pnpm pruebas:pedidos-web-entregar` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va después de 20261015042000 (todo el motor, el ERP y el cobro). Una
-- sola parte, sin políticas ni `drop trigger`. Toma candados breves: `alter table` de `pedidos_web` y `pedido_web_lineas` (nadie las usa
-- todavía en producción), sus llaves hacia `ventas` y `venta_items`, y `create or replace trigger` sobre `cambios` y `devolucion_items`
-- (`lock_timeout = 3s`: si una tienda las tiene tomadas, falla sin tocar nada y se vuelve a pegar). Re-ejecutable: un ancla ya aplicada no
-- hace nada; si un ancla no aparece exactamente una vez, aborta sin tocar nada. Ningún `select … into` dentro de un texto entre comillas
-- (las anclas van entre `$v$`/`$n$` y usan asignaciones).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazo anclado (el de 20261015010000 y 20261015041000): si el texto nuevo ya está, no hace nada; si el viejo no aparece
-- EXACTAMENTE una vez, aborta.
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
-- 1. La venta del pedido y la línea de venta de cada prenda
-- ----------------------------------------------------------------------------
alter table retail.pedidos_web add column if not exists venta_id uuid references retail.ventas(id);
create unique index if not exists pedidos_web_venta_unica on retail.pedidos_web (venta_id) where venta_id is not null;
comment on column retail.pedidos_web.venta_id is
  'La venta del pedido (ADR-0408 act. 10): nace con el pago que completa el total, con su boleta. La prenda sale del stock al entregarla.';

alter table retail.pedido_web_lineas add column if not exists venta_item_id uuid references retail.venta_items(id);
create unique index if not exists pedido_web_lineas_venta_item_unica
  on retail.pedido_web_lineas (venta_item_id) where venta_item_id is not null;
comment on column retail.pedido_web_lineas.venta_item_id is
  'La línea de venta de esta prenda (una unidad), desde que el pedido queda pagado completo. Su salida de stock nace al entregarla.';

-- El pedido: la venta se anota una vez, al quedar pagado completo, y no se cambia.
select pg_temp.anclar('retail.fn_pedido_web_reglas()',
  $v$  return new;
end;$v$,
  $n$  -- ADR-0408 act. 10: la venta del pedido se anota una sola vez, cuando queda pagado completo, y no se cambia.
  if new.venta_id is distinct from old.venta_id
     and (old.venta_id is not null or new.estado <> 'pagado') then
    raise exception 'La venta de un pedido web nace cuando queda pagado completo, y no se cambia.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  return new;
end;$n$);

-- La línea: nace sin línea de venta; la recibe una sola vez, con el pedido pagado y si no se quitó, y no se cambia. (Las anclas no
-- tocan el texto que puso 20261015010000: así esa migración se puede volver a pegar después de esta.)
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$    return new;
  end if;$v$,
  $n$    -- ADR-0408 act. 10: una prenda nace sin línea de venta (la recibe al quedar el pedido pagado completo).
    if new.venta_item_id is not null then
      raise exception 'Una prenda se agrega a un pedido web sin venta: la recibe al quedar pagado completo.'
        using errcode = '23514', hint = 'pedido_web_transicion';
    end if;
    return new;
  end if;$n$);
select pg_temp.anclar('retail.fn_pedido_web_linea_reglas()',
  $v$  return new;
end;$v$,
  $n$  -- ADR-0408 act. 10: la línea de venta de la prenda se anota una sola vez, al quedar pagado completo (si no se quitó), y no se cambia.
  if new.venta_item_id is distinct from old.venta_item_id
     and (old.venta_item_id is not null or v_pedido is distinct from 'pagado' or new.estado = 'quitada') then
    raise exception 'La línea de venta de una prenda de un pedido web se anota una vez, al quedar pagado completo, y no se cambia.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  return new;
end;$n$);

-- ----------------------------------------------------------------------------
-- 2. La venta y su boleta (interna: la llaman las funciones que cobran, en la MISMA transacción del pago que completa el total)
-- ----------------------------------------------------------------------------
create or replace function retail.fn_pedido_web_vender(p_pedido_id uuid, p_persona uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  l record;
  v_caja uuid;
  v_venta uuid;
  v_item uuid;
  v_tienda text;
  v_doc_tipo text;
  v_doc_num text;
  v_nombre text;
  v_igv numeric;
  v_subtotal numeric;
  v_items jsonb;
begin
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  -- Ya tiene su venta (un reintento): es la misma.
  if p.venta_id is not null then
    return p.venta_id;
  end if;
  if p.estado <> 'pagado' then
    raise exception '%', retail.fn_pedido_web_no_admite(p, 'emitir su boleta todavía') using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;

  -- Toda venta cae en la caja del día de su tienda (INV-04), como la de un apartado al entregarse. `for share`: la caja no se cierra
  -- mientras la venta nace en ella (el mismo candado de `entregar_separacion`).
  select c.id into v_caja from retail.cajas c where c.ubicacion_id = p.ubicacion_id and c.estado = 'abierta' for share;
  if v_caja is null then
    v_tienda := (select u.nombre from retail.ubicaciones u where u.id = p.ubicacion_id);
    raise exception 'El pedido web % quedó pagado completo y su boleta va en la caja del día: no hay una caja abierta en %. Ábrela.',
      p.codigo, coalesce(v_tienda, 'esta tienda')
      using errcode = 'P0001', hint = 'pedido_web_sin_caja';
  end if;

  -- La venta: del cliente del pedido, sin asesora (la vendió la web) y firmada por quien registró el pago que la completó.
  insert into retail.ventas (ubicacion_id, cliente_id, caja_id, usuario_id, nota, emisor)
    values (p.ubicacion_id, p.clienta_id, v_caja, p_persona, left('Pedido web ' || p.codigo || ': se entrega en la tienda con su código', 200),
            'retail')
    returning id into v_venta;

  -- Una línea de venta por prenda no quitada, de una unidad, con el precio y la campaña que el pedido ya tenía. La que todavía viene en
  -- camino o está por conseguir también se vende (está pagada): sale del stock cuando llega y se entrega.
  for l in
    select x.id, x.variante_id, x.precio_lista, x.descuento, x.descuento_etiqueta_id, coalesce(va.costo, 0) as costo
      from retail.pedido_web_lineas x
      join retail.variantes va on va.id = x.variante_id
     where x.pedido_id = p.id and x.estado <> 'quitada'
     order by x.posicion
  loop
    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                    motivo_descuento, descuento_etiqueta_id)
      values (v_venta, l.variante_id, 1, l.precio_lista, l.descuento, l.costo,
              case when l.descuento > 0 then 'campana' end, l.descuento_etiqueta_id)
      returning id into v_item;
    update retail.pedido_web_lineas x set venta_item_id = v_item where x.id = l.id;
  end loop;

  -- La plata ya entró con cada pago del pedido (el efectivo a la caja, lo digital al banco): la venta la aplica como UN anticipo, igual
  -- que el adelanto de un apartado. Así ni la caja ni Finanzas la cuentan dos veces.
  insert into retail.venta_pagos (venta_id, metodo, monto) values (v_venta, 'anticipo', p.pagado);

  -- La boleta por el TOTAL, con la pieza de siempre (reserva el correlativo de la serie de la tienda) y el documento de la ficha (la
  -- base ya exige que el número calce con su tipo). Sin documento, «sin documento» con el nombre.
  v_doc_tipo := (select c.documento_tipo from retail.clientas c where c.id = p.clienta_id and c.documento_numero is not null);
  v_doc_num := (select c.documento_numero from retail.clientas c where c.id = p.clienta_id);
  v_nombre := (select nullif(btrim(c.nombre), '') from retail.clientas c where c.id = p.clienta_id);
  if v_doc_tipo is null or v_doc_num is null then
    v_doc_tipo := 'sin_documento';
    v_doc_num := null;
  end if;
  v_igv := round((p.total - p.total / 1.18) * 100) / 100;
  v_subtotal := round((p.total - v_igv) * 100) / 100;
  v_items := (select jsonb_agg(jsonb_build_object(
                       'variante_id', vi.variante_id, 'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario,
                       'descuento_unitario', vi.descuento_unitario)
                     order by x.posicion)
                from retail.pedido_web_lineas x join retail.venta_items vi on vi.id = x.venta_item_id
               where x.pedido_id = p.id);
  perform retail.emitir_comprobante(p.ubicacion_id, 'boleta', v_subtotal, v_igv, p.total, v_venta, v_doc_tipo, v_doc_num, v_nombre, v_items);

  update retail.pedidos_web w set venta_id = v_venta where w.id = p.id;
  return v_venta;
end;
$$;

comment on function retail.fn_pedido_web_vender(uuid, uuid) is
  'Pedidos web (ADR-0408 act. 10): la venta del pedido pagado completo (una línea por prenda, un pago anticipo por lo pagado) y su boleta pendiente en la cola de Lucode, en la caja abierta de su tienda. Interna: la llaman las funciones que cobran.';

-- ----------------------------------------------------------------------------
-- 3. El pago que completa el total: caja abierta antes de anotar nada, y la venta en la misma transacción
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)',
  $v$  v_persona := retail.fn_pedido_web_actor();

  if p_medio = 'efectivo' then$v$,
  $n$  v_persona := retail.fn_pedido_web_actor();

  -- ADR-0408 act. 10: con este pago el pedido queda pagado completo y nace su venta con su boleta, que va en la caja del día de su
  -- tienda. Sin una caja abierta ahí, se dice ANTES de anotar nada (también si paga por Yape o Plin).
  if p_monto = p.total - p.pagado
     and not exists (select 1 from retail.cajas cj where cj.ubicacion_id = p.ubicacion_id and cj.estado = 'abierta') then
    v_tienda := (select u.nombre from retail.ubicaciones u where u.id = p.ubicacion_id);
    raise exception 'Con este pago el pedido web % queda pagado completo y sale su boleta, que va en la caja del día: no hay una caja abierta en %. Ábrela antes de registrarlo.',
      p.codigo, coalesce(v_tienda, 'esta tienda')
      using errcode = 'P0001', hint = 'pedido_web_sin_caja';
  end if;

  if p_medio = 'efectivo' then$n$);

select pg_temp.anclar('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)',
  $v$  return retail.fn_pedido_web_pago_respuesta(v_id);
end;$v$,
  $n$  -- ADR-0408 act. 10: si con este pago llegó al total, el disparador de la suma ya lo dejó «pagado»: en esta MISMA transacción nace su
  -- venta con su boleta. Lucode no se llama aquí: la boleta queda pendiente y la manda la pantalla o el barrido de la cola.
  if (select w.estado from retail.pedidos_web w where w.id = p.id) = 'pagado' then
    perform retail.fn_pedido_web_vender(p.id, v_persona);
  end if;
  return retail.fn_pedido_web_pago_respuesta(v_id);
end;$n$);

-- La respuesta de un pago dice la venta y la boleta del pedido (si ya quedó pagado completo): la pantalla la manda a SUNAT y la nombra.
select pg_temp.anclar('retail.fn_pedido_web_pago_respuesta(uuid)',
  $v$    'total', w.total, 'pagado', w.pagado, 'falta', w.total - w.pagado, 'estado_pedido', w.estado)$v$,
  $n$    'total', w.total, 'pagado', w.pagado, 'falta', w.total - w.pagado, 'estado_pedido', w.estado,
    -- ADR-0408 act. 10: la venta del pedido pagado completo y su boleta.
    'venta_id', w.venta_id,
    'boleta', (select c.serie || '-' || lpad(c.numero::text, 6, '0') from retail.comprobantes c
                where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura') order by c.created_at desc limit 1))$n$);

-- ----------------------------------------------------------------------------
-- 4. La pasarela (futura): el aviso que completaría el pedido queda por revisar
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_registrar_aviso_pasarela_pedido_web(uuid, text, text, text, numeric, text)',
  $v$                                to_char(p_monto, 'FM999999990.00'), p.codigo, to_char(p.total - p.pagado, 'FM999999990.00'));
      end if;$v$,
  $n$                                to_char(p_monto, 'FM999999990.00'), p.codigo, to_char(p.total - p.pagado, 'FM999999990.00'));
      elsif p_monto = p.total - p.pagado then
        -- ADR-0408 act. 10: este cobro completaría el pedido, y con eso nace su venta con su boleta, que va en la caja abierta de la
        -- tienda y la firma quien la registra. El aviso no trae ninguna de las dos: queda por revisar (no se pierde ni suma) hasta que la
        -- pasarela se construya y se decida cómo se emite su boleta.
        v_estado := 'por_revisar';
        v_observacion := format('La pasarela cobró S/ %s y con eso el pedido %s queda pagado completo: su boleta la emite la tienda, con su caja abierta. Revísalo en la tienda.',
                                to_char(p_monto, 'FM999999990.00'), p.codigo);
      end if;$n$);
select pg_temp.anclar('retail.fn_registrar_aviso_pasarela_pedido_web(uuid, text, text, text, numeric, text)',
  $v$    'motivo', case when v_ignorado then 'aviso_no_aplica'$v$,
  $n$    'motivo', case when v_ignorado then 'aviso_no_aplica'
                   when g.estado = 'por_revisar' and g.monto = (select w.total - w.pagado from retail.pedidos_web w where w.id = p.id)
                     then 'completa_el_pedido'$n$);

-- ----------------------------------------------------------------------------
-- 5. Un pago «anticipo» existe en la entrega de un apartado… o en la venta de un pedido web
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_anticipo_solo_de_apartado()',
  $v$  if not exists (select 1 from retail.separaciones s where s.venta_id = v_venta) then
    raise exception 'Un pago con anticipo solo existe al entregar un apartado: esta venta no viene de ninguno.'$v$,
  $n$  -- ADR-0408 act. 10: la venta de un pedido web aplica lo que se pagó dentro del pedido, como el adelanto de un apartado.
  if not exists (select 1 from retail.separaciones s where s.venta_id = v_venta)
     and not exists (select 1 from retail.pedidos_web w where w.venta_id = v_venta) then
    raise exception 'Un pago con anticipo solo existe al entregar un apartado o en la venta de un pedido web: esta venta no viene de ninguno.'$n$);

-- ----------------------------------------------------------------------------
-- 6. El pedido entero cuadra con su venta (al confirmar la transacción)
-- ----------------------------------------------------------------------------
select pg_temp.anclar('retail.fn_pedido_web_verificar(uuid)',
  $v$    raise exception 'En el pedido web %, % prenda(s) dicen viajar en un traslado que no las lleva a su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$v$,
  $n$    raise exception 'En el pedido web %, % prenda(s) dicen viajar en un traslado que no las lleva a su tienda.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;

  -- ADR-0408 act. 10: pagado o entregado ⇔ tiene su venta. Es de su tienda; tiene una línea por prenda no quitada (la misma prenda, una
  -- unidad, el mismo precio y descuento) y ninguna más; se cobró con UN pago «anticipo» por lo pagado; y tiene su boleta. Mientras no se
  -- entrega, la venta sigue completada (no se anula: la prenda nunca salió).
  if (p.estado in ('pagado', 'entregado')) <> (p.venta_id is not null) then
    raise exception 'El pedido web % está «%» y % su venta.', p.codigo, p.estado,
      case when p.venta_id is null then 'no tiene' else 'ya tiene' end
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
  if p.venta_id is not null then
    v_mal := (select count(*) from retail.ventas v
               where v.id = p.venta_id and (v.ubicacion_id <> p.ubicacion_id or (p.estado = 'pagado' and v.estado <> 'completada')))
           + (select count(*) from retail.pedido_web_lineas l
               where l.pedido_id = p.id and l.estado <> 'quitada'
                 and not exists (select 1 from retail.venta_items vi
                                  where vi.id = l.venta_item_id and vi.venta_id = p.venta_id and vi.variante_id = l.variante_id
                                    and vi.cantidad = 1 and vi.precio_unitario = l.precio_lista and vi.descuento_unitario = l.descuento))
           + (select count(*) from retail.pedido_web_lineas l
               where l.pedido_id = p.id and l.estado = 'quitada' and l.venta_item_id is not null)
           + (select count(*) from retail.venta_items vi
               where vi.venta_id = p.venta_id
                 and not exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = p.id and l.venta_item_id = vi.id));
    if v_mal > 0 then
      raise exception 'En el pedido web %, la venta no es la de sus prendas (% diferencia(s)).', p.codigo, v_mal
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if (select count(*) from retail.venta_pagos vp where vp.venta_id = p.venta_id) <> 1
       or not exists (select 1 from retail.venta_pagos vp where vp.venta_id = p.venta_id and vp.metodo = 'anticipo' and vp.monto = p.pagado) then
      raise exception 'En el pedido web %, la venta no se cobró con lo pagado en el pedido.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if not exists (select 1 from retail.comprobantes c where c.venta_id = p.venta_id and c.tipo in ('boleta', 'factura')) then
      raise exception 'El pedido web % quedó pagado completo sin su boleta.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
  end if;

  -- Lo vendido sale del stock recién al entregarse: una salida por cada prenda entregada, ninguna por la que todavía espera.
  v_mal := (select count(*) from retail.pedido_web_lineas l
             where l.pedido_id = p.id and l.venta_item_id is not null
               and coalesce((select sum(m.cantidad) from retail.movimientos m
                              where m.venta_item_id = l.venta_item_id and m.tipo = 'salida'), 0)
                   <> case when l.estado = 'entregada' then 1 else 0 end);
  if v_mal > 0 then
    raise exception 'En el pedido web %, % prenda(s) salieron del stock sin entregarse, o se entregaron sin salir.', p.codigo, v_mal
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$n$);

-- ----------------------------------------------------------------------------
-- 7. Mientras no se entrega, la venta del pedido no se cambia, no se devuelve ni se anula
-- ----------------------------------------------------------------------------

-- El pedido web de una línea de venta que todavía no se entrega (su número), o null. Una sola regla para los tres candados.
create or replace function retail.fn_pedido_web_por_entregar(p_venta_item_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select w.codigo
    from retail.pedido_web_lineas l join retail.pedidos_web w on w.id = l.pedido_id
   where l.venta_item_id = p_venta_item_id and l.estado <> 'entregada';
$$;

comment on function retail.fn_pedido_web_por_entregar(uuid) is
  'ADR-0408 act. 10: el número del pedido web de una línea de venta que todavía no se entrega, o null. Interna.';

-- La red de la base: un cambio o una devolución de esa prenda no se guarda, venga de donde venga.
create or replace function retail.fn_venta_de_pedido_web_por_entregar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_codigo text;
begin
  if new.venta_item_id is null then
    return new;
  end if;
  v_codigo := retail.fn_pedido_web_por_entregar(new.venta_item_id);
  if v_codigo is not null then
    raise exception 'Esta prenda es del pedido web %, que todavía no se entrega: primero se entrega con su código, y después se cambia o se devuelve como cualquier venta.', v_codigo
      using errcode = 'P0001', hint = 'pedido_web_por_entregar';
  end if;
  return new;
end;
$$;

comment on function retail.fn_venta_de_pedido_web_por_entregar() is
  'Candado de cambios y devolucion_items (ADR-0408 act. 10): la prenda de un pedido web que todavía no se entrega no se cambia ni se devuelve (nunca salió del stock).';

create or replace trigger cambios_pedido_web_por_entregar
  before insert on retail.cambios
  for each row execute function retail.fn_venta_de_pedido_web_por_entregar();
create or replace trigger devolucion_items_pedido_web_por_entregar
  before insert on retail.devolucion_items
  for each row execute function retail.fn_venta_de_pedido_web_por_entregar();

-- Y se dice ANTES de mover nada: `registrar_cambio` y `crear_devolucion` preguntan por la línea con `fn_exigir_linea_venta_disponible`
-- (antes de pedir stock de la prenda nueva o de anotar la devolución): ahí mismo, en palabras de tienda.
select pg_temp.anclar('retail.fn_exigir_linea_venta_disponible(uuid, integer, text)',
  $v$    raise exception 'Esta venta está anulada — ya no admite cambios ni devoluciones'
      using errcode = 'P0001', hint = 'venta_anulada';
  end if;$v$,
  $n$    raise exception 'Esta venta está anulada — ya no admite cambios ni devoluciones'
      using errcode = 'P0001', hint = 'venta_anulada';
  end if;
  -- ADR-0408 act. 10: la prenda de un pedido web que todavía no se entrega nunca salió del stock: no se cambia ni se devuelve.
  if retail.fn_pedido_web_por_entregar(p_venta_item_id) is not null then
    raise exception 'Esta prenda es del pedido web %, que todavía no se entrega: primero se entrega con su código, y después se cambia o se devuelve como cualquier venta.',
      retail.fn_pedido_web_por_entregar(p_venta_item_id)
      using errcode = 'P0001', hint = 'pedido_web_por_entregar';
  end if;$n$);

-- `anular_venta` es la única que escribe `venta_anulacion_items`, y antes de escribir revisa la salida de cada línea con un mensaje que
-- aquí no aplica («revisarse a mano»): se le dice primero, en palabras de tienda.
select pg_temp.anclar('retail.anular_venta(uuid, text, jsonb)',
  $v$  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;$v$,
  $n$  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;
  -- ADR-0408 act. 10: la venta de un pedido web que todavía no se entrega no se anula: sus prendas siguen reservadas en la tienda (nunca
  -- salieron), y anularla las devolvería al stock dos veces.
  if exists (select 1 from retail.pedidos_web w where w.venta_id = p_venta_id and w.estado <> 'entregado') then
    raise exception 'Esta venta es del pedido web %, que todavía no se entrega: no se anula desde aquí.',
      (select w.codigo from retail.pedidos_web w where w.venta_id = p_venta_id)
      using errcode = 'P0001', hint = 'pedido_web_por_entregar';
  end if;$n$);

-- ----------------------------------------------------------------------------
-- 8. Quién ejecuta qué: las internas, nadie de afuera
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_pedido_web_vender(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.fn_venta_de_pedido_web_por_entregar() from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_por_entregar(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Comprobación: si algo no quedó, la migración no se da por aplicada.
-- ----------------------------------------------------------------------------
do $$
begin
  if position('fn_pedido_web_vender' in pg_get_functiondef('retail.registrar_pago_pedido_web(uuid, numeric, text, text, uuid)'::regprocedure)) = 0 then
    raise exception 'registrar_pago_pedido_web no quedó haciendo nacer la venta del pedido pagado completo';
  end if;
  if position('pedidos_web w where w.venta_id = v_venta' in pg_get_functiondef('retail.fn_anticipo_solo_de_apartado()'::regprocedure)) = 0 then
    raise exception 'fn_anticipo_solo_de_apartado no quedó aceptando la venta de un pedido web';
  end if;
  if position('la venta no es la de sus prendas' in pg_get_functiondef('retail.fn_pedido_web_verificar(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_verificar no quedó revisando la venta del pedido';
  end if;
  if position('pedido_web_por_entregar' in pg_get_functiondef('retail.anular_venta(uuid, text, jsonb)'::regprocedure)) = 0 then
    raise exception 'anular_venta no quedó frenando la venta de un pedido web por entregar';
  end if;
  if position('completa_el_pedido' in pg_get_functiondef('retail.fn_registrar_aviso_pasarela_pedido_web(uuid, text, text, text, numeric, text)'::regprocedure)) = 0 then
    raise exception 'el aviso de la pasarela no quedó dejando por revisar el cobro que completaría el pedido';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.cambios'::regclass and tgname = 'cambios_pedido_web_por_entregar')
     or not exists (select 1 from pg_trigger where tgrelid = 'retail.devolucion_items'::regclass and tgname = 'devolucion_items_pedido_web_por_entregar') then
    raise exception 'faltan los candados de cambio y devolución de un pedido web por entregar';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
