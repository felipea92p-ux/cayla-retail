-- ============================================================================
-- 20261015114000_pedidos_web_anular_pagado.sql — CAYLA V2 · Tienda online (ADR-0408): anular un pedido web PAGADO que todavía no se
-- entrega (parte 1 de 2: la operación)
--
-- EL PROBLEMA PRIMERO. Desde la actividad 10 (20261015051000), un pedido web que queda pagado completo ya tiene su venta y su boleta, y
-- sus prendas siguen reservadas en la tienda hasta que el cliente las recoge. Si el cliente se arrepiente, si hubo un error o si la
-- tienda ya no puede entregarlo (la prenda se dañó, la que se conseguía no llegó), no había salida: `anular_pedido_web` solo anula uno
-- confirmado, `anular_pago_pedido_web` no toca un pedido pagado, y la venta del pedido no se anula, no se cambia ni se devuelve
-- mientras no se entrega. La plata del cliente quedaba atrapada y la prenda, reservada para siempre.
-- Felipe, 2026-10-15: «Se debería poder anular el pedido y la boleta, cualquier persona con el módulo lo debería poder hacer». Y ya había
-- decidido (2026-10-14, ADR-0408 act. c) que el efectivo que se devuelve sale de la caja abierta del día en que se devuelve.
--
-- QUÉ HACE
--   1. `anular_pedido_web_pagado(pedido, motivo, marca)`: en UNA transacción, con el permiso del módulo y la tienda
--      (`fn_pedido_web_exigir`) y firmado por el Responsable (`fn_actor_persona_id(true)`):
--        · el pedido pasa de «pagado» a «anulado», con su motivo (el cliente desistió, error en el pedido, o el motivo nuevo «no se
--          puede entregar»), quién y cuándo;
--        · sus prendas reservadas vuelven a estar disponibles (su reserva se cierra con la «liberacion_apartado» de siempre,
--          `fn_pedido_web_soltar`). Nunca salieron del stock: no hay entrada. Lo que estaba por conseguir o en camino deja de ser del
--          pedido (lo que llega, entra libre);
--        · cada pago se devuelve por su medio: el efectivo sale de la caja abierta de HOY de la tienda del pedido (un egreso), lo digital
--          sale de la cuenta que selló al cobrarse (lo lleva el libro de Cuentas y dinero). Sin caja abierta, o si esa caja no tiene ese
--          efectivo, no se anula nada y se dice por qué;
--        · su venta se anula como lo hace `anular_venta` (estado, motivo, quién, cuándo y una `venta_anulacion_items` por línea,
--          «vendible» y sin movimiento: la prenda nunca salió);
--        · su boleta, por el camino que ya tiene el ERP: si todavía no se intentó mandar a SUNAT, se libera sin transmitir
--          (`no_emitido`, como `anular_venta` y ADR-0386); si SUNAT ya la aceptó, nace su NOTA DE CRÉDITO por el total con
--          `emitir_nota` (la pieza de `aprobar_devolucion`, ADR-0100), pendiente, y la manda a SUNAT la cola de siempre (ADR-0005/0009,
--          D-60). Si SUNAT la rechazó o ya se dio de baja, no queda nada vivo que anular. En cualquier otro caso (se está mandando,
--          se intentó y pudo haber llegado, una baja en trámite, la tienda sin serie de nota de crédito) NO se anula nada y se dice qué
--          hacer: lo decide `fn_pedido_web_camino_boleta`, la misma regla que lee la hoja antes de confirmar.
--      Dos toques no anulan dos veces: el candado del pedido ordena dos cajas a la vez (la segunda lo ve anulado) y la misma marca (un
--      doble clic, una red que se cayó después de guardar) devuelve la MISMA anulación. La marca sigue al contenido.
--   2. Los candados que lo sostienen: el pedido puede pasar de «pagado» a «anulado» (y solo así nace su marca de anulación); los
--      CHECK de `pedidos_web` aceptan un pedido anulado que se había pagado (su `pagado_en` se conserva: es historia) con su motivo; y la
--      verificación del pedido entero, al confirmar la transacción, exige que la venta quedó anulada entera, que se le devolvió TODO lo
--      pagado y que la boleta no quedó viva ante SUNAT sin su nota de crédito.
--   3. «Revisar si se guardó» sabe revisar una anulación (`fn_resolver_intento`).
--   4. El módulo «Pedidos web» dice en Roles y accesos que ahora también cobra, entrega y anula un pedido pagado devolviendo la plata.
--
-- POR QUÉ ASÍ (/rigor, lente de conjuntos y de resiliencia).
--   DECIDÍ: todo o nada, en la base. Prendas, plata, venta y boleta cambian juntas o no cambia nada: un pedido anulado con la plata a medio
--     devolver, o con su venta viva, es justo el estado imposible que el principio 2 prohíbe (la venta seguiría contando en Ventas y en
--     IGV, o el cliente quedaría con una boleta viva por algo que no se llevó). La verificación diferida lo vuelve imposible aunque una
--     función futura se equivoque.
--   DECIDÍ: la nota de crédito con el motivo «01» (Anulación de la operación, catálogo 09 de SUNAT, que `lib/lucode.ts` ya trae) y no
--     «06» (Devolución total): el cliente nunca se llevó la prenda, así que no hubo devolución de mercadería sino una operación que se
--     deja sin efecto. Misma pieza (`emitir_nota`), misma cola, mismo adaptador; solo cambia el código. A confirmar con el contador.
--   DECIDÍ: escribir la anulación de la venta aquí, con los mismos efectos que `anular_venta`, en vez de llamarla: `anular_venta` pide el
--     módulo Devoluciones, la caja de esa venta abierta y el mismo día, y Felipe decidió que lo hace cualquiera con «Pedidos web» y en
--     cualquier día. Lo que ella deja escrito (estado, motivo, quién, cuándo, una fila de anulación por línea) es lo mismo.
--   DECIDÍ: una boleta «pendiente» sin intentos pero recién nacida (menos de 2 minutos, el mismo margen de la cola) o tomada por la cola
--     (`proximo_reintento_at` en el futuro) puede estar viajando a Lucode en este instante: no se libera, se espera. Liberarla mientras
--     viaja dejaría una boleta aceptada por SUNAT que el ERP da por no emitida (ADR-0386: lo que pudo llegar no se libera).
--   DESCARTÉ: dar de baja la boleta con el resumen diario (`anular_comprobante`, ADR-0016). Es solo del líder, es asíncrona y dice que la
--     operación nunca existió; aquí existió (el cliente pagó y recibió su boleta) y se deja sin efecto: eso es una nota de crédito.
--   DESCARTÉ: devolver la plata en un paso aparte (como «Devolver» de la actividad 9). Con la venta y la boleta anuladas y la plata todavía
--     en la tienda, el cliente quedaría sin venta, sin boleta y sin su plata hasta que alguien se acuerde.
--   SE ROMPE SI: alguien vuelve a pegar 20261014235000 (el motor) después de esta (sus `create or replace` borran estas anclas: un pagado ya
--     no podría pasar a anulado y la verificación rechazaría la anulación). Se arregla volviendo a pegar 20261015051000, 052000 y esta.
--     Las anclas de esta migración no tocan el texto que pusieron 20261015010000, 041000, 051000 ni 052000: esas se pueden volver a pegar
--     después de esta. `pnpm pruebas:pedidos-web-anular` lo marca.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de 20261015053000 (todo el motor, el ERP, el cobro y la
-- actividad 10). Una sola parte, sin políticas ni `drop trigger`: el `alter table` es de `pedidos_web`, que nadie usa todavía en producción
-- (`lock_timeout = 3s`: si alguien la tuviera tomada, falla sin tocar nada y se vuelve a pegar). Re-ejecutable: un ancla ya aplicada no
-- hace nada; si un ancla no aparece exactamente una vez, aborta sin tocar nada. Ningún `select … into` dentro de un texto entre comillas
-- (las anclas van entre `$v$`/`$n$` y usan asignaciones).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplazo anclado (el de 20261015010000, 041000, 051000 y 052000): si el texto nuevo ya está, no hace nada; si el viejo no aparece
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

-- La lista de operaciones de `fn_resolver_intento` (la misma pieza de 20261015042000 y 052000: `apps/web/lib/intento-reglas.test.ts` lee
-- de aquí qué operaciones sabe revisar la base).
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

-- ----------------------------------------------------------------------------
-- 1. El pedido: la marca de la anulación y los CHECK que aceptan un anulado que se había pagado
-- ----------------------------------------------------------------------------
alter table retail.pedidos_web add column if not exists anulacion_token uuid;
create unique index if not exists pedidos_web_anulacion_token_key on retail.pedidos_web (anulacion_token) where anulacion_token is not null;
comment on column retail.pedidos_web.anulacion_token is
  'La marca del intento con que se anuló un pedido PAGADO (ADR-0408, anular pagado): el mismo intento devuelve la misma anulación. Se anota al anular y no cambia.';

alter table retail.pedidos_web
  -- Lo pagado es el total en un pedido pagado o entregado; en uno anulado DESPUÉS de pagarse, la plata se devuelve en la misma
  -- operación (la verificación diferida exige que quede en cero); en los demás, nunca llega al total.
  drop constraint if exists pedidos_web_pagado_completo,
  add constraint pedidos_web_pagado_completo check (
    case when estado in ('pagado', 'entregado') then total > 0 and pagado = total
         when estado = 'anulado' and pagado_en is not null then true
         else not (total > 0 and pagado = total) end),
  -- Cuándo se pagó es historia: un pedido anulado después de pagarse la conserva.
  drop constraint if exists pedidos_web_pago_coherente,
  add constraint pedidos_web_pago_coherente check (
    (estado not in ('pagado', 'entregado') or pagado_en is not null)
    and (pagado_en is null or estado in ('pagado', 'entregado', 'anulado'))),
  -- El motivo de un anulado depende de hasta dónde llegó: sin confirmar, confirmado sin pagar, o pagado (con el motivo nuevo).
  drop constraint if exists pedidos_web_cierre_coherente,
  add constraint pedidos_web_cierre_coherente check (
    (estado in ('vencido', 'anulado')) = (cerrado_en is not null)
    and (cerrado_en is null) = (cierre_motivo is null)
    and (cerrado_en is not null or cerrado_por is null)
    and (estado <> 'vencido' or (cierre_motivo = 'sin_confirmar' and cerrado_por is null))
    and (estado <> 'anulado' or (cerrado_por is not null and (
          (confirmado_en is null and cierre_motivo in ('sin_stock', 'cliente_no_respondio', 'cliente_desistio'))
       or (confirmado_en is not null and pagado_en is null and cierre_motivo in ('cliente_no_pago', 'cliente_desistio', 'error_en_pedido'))
       or (pagado_en is not null and cierre_motivo in ('cliente_desistio', 'error_en_pedido', 'no_se_puede_entregar')))))),
  drop constraint if exists pedidos_web_anulacion_token_coherente,
  add constraint pedidos_web_anulacion_token_coherente check (anulacion_token is null or (estado = 'anulado' and pagado_en is not null));

-- El disparador de las reglas: «pagado» también puede pasar a «anulado».
select pg_temp.anclar('retail.fn_pedido_web_reglas()',
  $v$    or (old.estado = 'pagado' and new.estado = 'entregado')) then$v$,
  $n$    or (old.estado = 'pagado' and new.estado in ('entregado', 'anulado'))) then$n$);

-- Y la marca de la anulación se anota una sola vez, al anular un pedido pagado, y no se cambia. (Va antes del candado de la entrega
-- de 20261015052000, sin tocar su texto.)
select pg_temp.anclar('retail.fn_pedido_web_reglas()',
  $v$  -- ADR-0408 act. 10: la marca de la entrega se anota una sola vez, al entregar, y no se cambia.$v$,
  $n$  -- ADR-0408 (anular un pedido pagado): la marca de la anulación se anota una sola vez, al anular un pedido pagado, y no se cambia.
  if new.anulacion_token is distinct from old.anulacion_token
     and (old.anulacion_token is not null or new.estado <> 'anulado' or old.estado <> 'pagado') then
    raise exception 'La marca de la anulación de un pedido web se anota al anularlo, y no se cambia.'
      using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  -- ADR-0408 act. 10: la marca de la entrega se anota una sola vez, al entregar, y no se cambia.$n$);

-- ----------------------------------------------------------------------------
-- 2. La verificación del pedido entero (al confirmar la transacción): un pedido anulado después de pagarse
-- ----------------------------------------------------------------------------
-- Se revisa lo suyo ANTES de lo demás y, al final, se mira como un anulado sin venta: el bloque de la actividad 10 (pagado o entregado ⇔
-- tiene su venta viva) no le aplica. Va antes de las comprobaciones generales, sin tocar el texto de 20261015010000 ni de 051000.
select pg_temp.anclar('retail.fn_pedido_web_verificar(uuid)',
  $v$  if v_vivas = 0 then
    raise exception 'El pedido web % quedaría sin ninguna prenda.', p.codigo using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$v$,
  $n$  -- ADR-0408 (anular un pedido pagado, 20261015114000): un pedido anulado DESPUÉS de quedar pagado completo conserva su venta, anulada.
  -- Su venta es de su tienda y quedó anulada entera (una línea por prenda no quitada, cada una con su anulación «vendible» y sin
  -- movimiento: la prenda nunca salió), cobrada con UN «anticipo» por el total; se le devolvió TODO lo pagado; y su boleta no quedó viva
  -- ante SUNAT sin su nota de crédito por el total. Después se mira como un anulado sin venta (lo de la actividad 10 es de una venta viva).
  if p.estado = 'anulado' and p.pagado_en is not null then
    if p.venta_id is null then
      raise exception 'El pedido web % se anuló después de pagarse y no tiene su venta.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    v_mal := (select count(*) from retail.ventas v
               where v.id = p.venta_id and (v.ubicacion_id <> p.ubicacion_id or v.estado <> 'anulada'))
           + (select count(*) from retail.pedido_web_lineas l
               where l.pedido_id = p.id and l.estado <> 'quitada'
                 and not exists (select 1 from retail.venta_items vi
                                  where vi.id = l.venta_item_id and vi.venta_id = p.venta_id and vi.variante_id = l.variante_id
                                    and vi.cantidad = 1 and vi.precio_unitario = l.precio_lista and vi.descuento_unitario = l.descuento))
           + (select count(*) from retail.pedido_web_lineas l
               where l.pedido_id = p.id and l.estado = 'quitada' and l.venta_item_id is not null)
           + (select count(*) from retail.venta_items vi
               where vi.venta_id = p.venta_id
                 and (not exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = p.id and l.venta_item_id = vi.id)
                      or not exists (select 1 from retail.venta_anulacion_items ai
                                      where ai.venta_item_id = vi.id and ai.condicion = 'vendible' and ai.movimiento_id is null)));
    if v_mal > 0 then
      raise exception 'En el pedido web %, la venta anulada no es la de sus prendas o no se anuló entera (% diferencia(s)).', p.codigo, v_mal
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if (select count(*) from retail.venta_pagos vp where vp.venta_id = p.venta_id) <> 1
       or not exists (select 1 from retail.venta_pagos vp where vp.venta_id = p.venta_id and vp.metodo = 'anticipo' and vp.monto = p.total) then
      raise exception 'En el pedido web %, la venta anulada no se había cobrado con lo pagado en el pedido.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if p.pagado <> 0 then
      raise exception 'El pedido web % se anuló sin devolver todo lo pagado (quedan S/ %).', p.codigo, p.pagado
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    if not exists (select 1 from retail.comprobantes c where c.venta_id = p.venta_id and c.tipo in ('boleta', 'factura'))
       or exists (select 1 from retail.comprobantes c
                   where c.venta_id = p.venta_id and c.tipo in ('boleta', 'factura')
                     and (c.estado in ('pendiente', 'pendiente_reintento', 'enviado', 'interna')
                          or (c.estado = 'aceptado'
                              and not exists (select 1 from retail.comprobantes n
                                               where n.comprobante_original_id = c.id and n.tipo = 'nota_credito' and n.total = c.total)))) then
      raise exception 'El pedido web % se anuló y su boleta quedó viva ante SUNAT sin su nota de crédito.', p.codigo
        using errcode = '23514', hint = 'pedido_web_incoherente';
    end if;
    p.venta_id := null;
  end if;

  if v_vivas = 0 then
    raise exception 'El pedido web % quedaría sin ninguna prenda.', p.codigo using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;$n$);

-- ----------------------------------------------------------------------------
-- 3. Qué le pasa a la boleta al anular (una sola regla: la usan la anulación y la hoja que lo dice antes de confirmar)
-- ----------------------------------------------------------------------------
-- `camino`: «liberar» (nunca se intentó mandar: se libera sin transmitir), «nota_credito» (SUNAT la aceptó: nace su nota de crédito),
-- «nada» (SUNAT la rechazó o ya se dio de baja: no queda nada vivo) o «esperar» (todavía no se puede anular: `explicacion` dice qué
-- hacer y `hint` es el que lleva el error). Solo lee.
create or replace function retail.fn_pedido_web_camino_boleta(p_venta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c retail.comprobantes%rowtype;
  v_texto text;
  v_base jsonb;
  v_tienda text;
begin
  select * into c from retail.comprobantes x
   where x.venta_id = p_venta_id and x.tipo in ('boleta', 'factura')
   order by x.created_at desc limit 1;
  if not found then
    return jsonb_build_object('camino', 'nada', 'explicacion', 'La venta del pedido no tiene boleta: no hay nada que anular ante SUNAT.');
  end if;
  v_texto := c.serie || '-' || lpad(c.numero::text, 6, '0');
  v_base := jsonb_build_object('comprobante_id', c.id, 'tipo', c.tipo, 'texto', v_texto, 'estado', c.estado, 'total', c.total,
                               'intentos', c.intentos_transmision);

  if c.estado in ('no_emitido', 'anulado') then
    return v_base || jsonb_build_object('camino', 'nada',
      'explicacion', format('La boleta %s ya está anulada: no hay nada que anular ante SUNAT.', v_texto));
  end if;
  if c.estado = 'rechazado' then
    return v_base || jsonb_build_object('camino', 'nada',
      'explicacion', format('SUNAT rechazó la boleta %s: no quedó viva, no hay nada que anular ante SUNAT.', v_texto));
  end if;
  if c.estado = 'aceptado' then
    if c.anulacion_solicitada_at is not null then
      return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_con_baja',
        'explicacion', format('La boleta %s tiene una baja en trámite ante SUNAT. Consulta su estado en Comprobantes y, cuando figure anulada, vuelve a anular el pedido.', v_texto));
    end if;
    if exists (select 1 from retail.comprobantes n
                where n.comprobante_original_id = c.id and n.tipo = 'nota_credito' and n.estado not in ('rechazado', 'anulado')) then
      return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_con_nota',
        'explicacion', format('La boleta %s ya tiene una nota de crédito. Revísala en Comprobantes antes de anular el pedido.', v_texto));
    end if;
    if not exists (select 1 from retail.series_comprobantes s
                    where s.ubicacion_id = c.ubicacion_id and s.tipo = 'nota_credito' and s.archivada_at is null
                      and left(s.serie, 1) = case c.tipo when 'boleta' then 'B' else 'F' end) then
      v_tienda := (select u.nombre from retail.ubicaciones u where u.id = c.ubicacion_id);
      return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_sin_serie_nota',
        'explicacion', format('La boleta %s ya está aceptada por SUNAT: para anularla sale una nota de crédito, y %s todavía no tiene su serie de nota de crédito. Pídele a un líder que la registre en Comprobantes ▸ Series y vuelve a anular.',
                              v_texto, coalesce(v_tienda, 'esta tienda')));
    end if;
    return v_base || jsonb_build_object('camino', 'nota_credito',
      'explicacion', format('La boleta %s ya está aceptada por SUNAT: sale una nota de crédito por S/ %s que la anula, y se envía sola por la cola de siempre.',
                            v_texto, to_char(c.total, 'FM999999990.00')));
  end if;
  if c.estado = 'enviado' then
    return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_en_camino',
      'explicacion', format('La boleta %s se envió a SUNAT y todavía no responde. Cuando figure aceptada, vuelve a anular el pedido: sale con su nota de crédito.', v_texto));
  end if;
  if c.estado in ('pendiente', 'pendiente_reintento', 'interna') then
    -- ADR-0386: lo que pudo llegar a SUNAT no se libera.
    if c.estado = 'pendiente_reintento' or c.intentos_transmision > 0 then
      return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_en_camino',
        'explicacion', format('La boleta %s ya se intentó enviar a SUNAT y pudo haber llegado. En Comprobantes ▸ Por enviar pulsa «Reintentar ahora»; cuando figure aceptada, vuelve a anular el pedido: sale con su nota de crédito.', v_texto));
    end if;
    -- Recién nacida (el mismo margen de la cola) o tomada por la cola: puede estar viajando a Lucode ahora mismo.
    if c.created_at > now() - interval '2 minutes' or c.proximo_reintento_at > now() then
      return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_enviandose',
        'explicacion', format('La boleta %s se está enviando a SUNAT ahora mismo. Espera un par de minutos y vuelve a anular.', v_texto));
    end if;
    return v_base || jsonb_build_object('camino', 'liberar',
      'explicacion', format('La boleta %s todavía no se envió a SUNAT: se libera sin enviarla (SUNAT nunca la recibió).', v_texto));
  end if;
  return v_base || jsonb_build_object('camino', 'esperar', 'hint', 'pedido_web_boleta_en_camino',
    'explicacion', format('La boleta %s está «%s»: revísala en Comprobantes antes de anular el pedido.', v_texto, c.estado));
end;
$$;

comment on function retail.fn_pedido_web_camino_boleta(uuid) is
  'Pedidos web (ADR-0408, anular pagado): qué le pasa a la boleta de la venta de un pedido si se anula ahora: liberar (nunca se intentó mandar), nota_credito (SUNAT la aceptó), nada (rechazada o ya anulada) o esperar (con qué hacer). Interna: la usan la anulación y la lectura del pedido.';

-- ----------------------------------------------------------------------------
-- 4. Anular un pedido pagado
-- ----------------------------------------------------------------------------
create or replace function retail.anular_pedido_web_pagado(p_pedido_id uuid, p_motivo text, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  p retail.pedidos_web%rowtype;
  v retail.ventas%rowtype;
  b retail.comprobantes%rowtype;
  g record;
  l record;
  r record;
  v_existente uuid;
  v_persona uuid;
  v_camino jsonb;
  v_efectivo numeric;
  v_caja uuid;
  v_cm uuid;
  v_tienda text;
  v_motivo text;
begin
  -- La marca sigue al contenido (como entregar y cobrar): la misma marca con otro pedido u otro motivo se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('anular_pedido_web_pagado', p_token, md5(jsonb_build_array(p_pedido_id, p_motivo)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('pedido_web_anulacion:' || p_token::text, 0));
    v_existente := (select w.id from retail.pedidos_web w where w.anulacion_token = p_token);
    if v_existente is not null then
      if v_existente <> p_pedido_id then
        raise exception 'Esa marca de anulación es de otro pedido.' using errcode = '22023', hint = 'pedido_web_token';
      end if;
      return retail.fn_pedido_web_anulacion_respuesta(v_existente) || jsonb_build_object('repetido', true);
    end if;
  end if;

  -- El candado del pedido: dos anulaciones, o anular y entregar a la vez, se ordenan aquí; la segunda lo ve cambiado.
  select * into p from retail.pedidos_web w where w.id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido web no existe.' using errcode = '22023', hint = 'pedido_web_no_existe';
  end if;
  perform retail.fn_pedido_web_exigir(p.ubicacion_id);
  if p.estado <> 'pagado' then
    raise exception '%', case p.estado
        when 'entregado' then format('El pedido web %s ya se entregó: lo que el cliente devuelve después va por Devoluciones, con su boleta.', p.codigo)
        when 'confirmado' then format('El pedido web %s todavía no está pagado completo: se anula con «Anular», que suelta sus prendas, y cada pago se devuelve aparte.', p.codigo)
        else retail.fn_pedido_web_no_admite(p, 'anular') end
      using errcode = 'P0001', hint = 'pedido_web_estado';
  end if;
  if p_motivo is null or p_motivo not in ('cliente_desistio', 'error_en_pedido', 'no_se_puede_entregar') then
    raise exception 'Elige por qué se anula: el cliente desistió, hubo un error en el pedido o no se puede entregar.'
      using errcode = '22023', hint = 'pedido_web_motivo';
  end if;
  v_persona := retail.fn_pedido_web_actor();

  -- La venta del pedido. `for update`, como en `anular_venta`: un cambio o una devolución de ella que llegue a la vez espera aquí.
  select * into v from retail.ventas x where x.id = p.venta_id for update;
  if not found or v.estado <> 'completada' then
    raise exception 'El pedido web % está pagado pero su venta no está como debería: revísalo con tu líder.', p.codigo
      using errcode = '23514', hint = 'pedido_web_incoherente';
  end if;
  -- Un cobro de la pasarela (futura) se devuelve desde la pasarela, nunca desde la tienda.
  if exists (select 1 from retail.pedido_web_pagos x where x.pedido_id = p.id and x.estado = 'aprobado' and x.origen <> 'tienda') then
    raise exception 'El pedido web % tiene un cobro de la pasarela: ese se devuelve desde la pasarela, no desde la tienda.', p.codigo
      using errcode = 'P0001', hint = 'pedido_web_pago_pasarela';
  end if;

  -- La boleta, tomada para que nadie la cambie mientras tanto, y qué le pasa (la misma regla que lee la hoja). Si todavía no se puede
  -- anular, se dice qué hacer y no se toca nada.
  select * into b from retail.comprobantes x
   where x.venta_id = v.id and x.tipo in ('boleta', 'factura')
   order by x.created_at desc limit 1
     for update;
  v_camino := retail.fn_pedido_web_camino_boleta(v.id);
  if v_camino ->> 'camino' = 'esperar' then
    raise exception '%', v_camino ->> 'explicacion' using errcode = 'P0001', hint = coalesce(v_camino ->> 'hint', 'pedido_web_boleta_en_camino');
  end if;

  -- El efectivo sale de la caja abierta de HOY de la tienda del pedido (Felipe, ADR-0408 act. c), no de la que lo recibió.
  -- `for share`: la caja no se cierra mientras sale la plata (el mismo candado de `anular_pago_pedido_web`).
  v_efectivo := (select coalesce(sum(x.monto), 0) from retail.pedido_web_pagos x
                  where x.pedido_id = p.id and x.estado = 'aprobado' and x.medio = 'efectivo');
  if v_efectivo > 0 then
    select c.id into v_caja from retail.cajas c where c.ubicacion_id = p.ubicacion_id and c.estado = 'abierta' for share;
    if v_caja is null then
      v_tienda := (select u.nombre from retail.ubicaciones u where u.id = p.ubicacion_id);
      raise exception 'Hay que devolverle S/ % en efectivo y no hay una caja abierta en %: ábrela y vuelve a anular. No se anuló nada.',
        to_char(v_efectivo, 'FM999999990.00'), coalesce(v_tienda, 'esta tienda')
        using errcode = 'P0001', hint = 'pedido_web_sin_caja';
    end if;
  end if;

  -- ADR-0190: el stock de lo reservado, bloqueado en orden (por tienda) antes de mover nada.
  for r in
    select x.ubicacion_id as ubic, array_agg(distinct x.variante_id) as variantes
      from retail.pedido_web_lineas x
     where x.pedido_id = p.id and x.estado = 'reservada'
     group by x.ubicacion_id
     order by x.ubicacion_id
  loop
    perform retail.fn_bloquear_en_orden(r.ubic, r.variantes);
  end loop;

  -- (1) El pedido queda anulado: con quién, cuándo, por qué y la marca. Su venta y cuándo se pagó quedan: son su historia.
  update retail.pedidos_web w
     set estado = 'anulado', cerrado_en = now(), cerrado_por = v_persona, cierre_motivo = p_motivo, anulacion_token = p_token
   where w.id = p.id;

  -- (2) Sus prendas reservadas vuelven a estar disponibles (la de otra tienda, allá). Nunca salieron del stock: no hay entrada. Lo que
  --     estaba por conseguir o en camino ya no es del pedido: lo que llega entra libre (los disparadores de traslado lo ven anulado).
  for l in select x.id from retail.pedido_web_lineas x where x.pedido_id = p.id and x.estado = 'reservada' order by x.posicion loop
    update retail.pedido_web_lineas x set estado = 'liberada' where x.id = l.id;
    perform retail.fn_pedido_web_soltar(l.id, v_persona,
      'Pedido web ' || p.codigo || ' anulado (estaba pagado): la prenda vuelve a estar disponible');
  end loop;

  -- (3) Cada pago se le devuelve por su medio: el efectivo, de la caja de hoy (un egreso); lo digital, por la cuenta que selló al
  --     cobrarse (lo lleva el libro de Cuentas y dinero con «devuelto al cliente»).
  for g in
    select x.id, x.medio, x.monto from retail.pedido_web_pagos x
     where x.pedido_id = p.id and x.estado = 'aprobado'
     order by x.registrado_en, x.id
       for update
  loop
    v_cm := null;
    if g.medio = 'efectivo' then
      insert into retail.caja_movimientos (caja_id, tipo, monto, motivo, usuario_id, nota)
        values (v_caja, 'egreso', g.monto, 'Devuelve un pago del pedido web ' || p.codigo || ' (anulado)', v_persona,
                'Se le devolvió al cliente: el pedido se anuló')
        returning id into v_cm;
    end if;
    update retail.pedido_web_pagos x
       set estado = 'anulado', anulado_en = now(), anulado_por = v_persona, anulado_motivo = 'devuelto_al_cliente',
           anulado_caja_movimiento_id = v_cm
     where x.id = g.id;
  end loop;
  -- La caja de hoy no queda con menos de cero: si no tiene ese efectivo, no se anula nada (el candado de siempre, ya y no recién al
  -- confirmar la transacción, para decirlo con su mensaje).
  perform retail.fn_exigir_efectivo_en_caja(v_caja);

  -- (4) La venta se anula como lo hace `anular_venta`: una fila de anulación por línea («vendible», sin movimiento: la prenda nunca
  --     salió del stock) y su estado, motivo, quién y cuándo.
  v_motivo := left('Pedido web ' || p.codigo || ' anulado: ' || case p_motivo
                     when 'cliente_desistio' then 'el cliente desistió'
                     when 'error_en_pedido' then 'error en el pedido'
                     else 'no se puede entregar' end, 200);
  insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
    select v.id, vi.id, 'vendible', null from retail.venta_items vi where vi.venta_id = v.id;
  update retail.ventas x set estado = 'anulada', motivo_anulacion = v_motivo, anulado_por = v_persona, anulado_en = now()
   where x.id = v.id;

  -- (5) La boleta: se libera sin transmitir, o nace su nota de crédito por el total (la misma boleta, línea por línea), pendiente para
  --     la cola de Lucode. Esta transacción nunca llama a Lucode.
  if v_camino ->> 'camino' = 'liberar' then
    update retail.comprobantes x
       set estado = 'no_emitido', motivo_no_emitido = v_motivo, marcado_no_emitido_por = v_persona, marcado_no_emitido_at = now()
     where x.id = b.id;
  elsif v_camino ->> 'camino' = 'nota_credito' then
    perform retail.emitir_nota(b.id, 'nota_credito', '01', b.subtotal, b.igv, b.total,
      (select jsonb_agg(jsonb_build_object('variante_id', vi.variante_id, 'cantidad', vi.cantidad, 'precio_unitario', vi.precio_unitario,
                                           'descuento_unitario', vi.descuento_unitario) order by x.posicion)
         from retail.pedido_web_lineas x join retail.venta_items vi on vi.id = x.venta_item_id
        where x.pedido_id = p.id));
  end if;

  return retail.fn_pedido_web_anulacion_respuesta(p.id) || jsonb_build_object('repetido', false);
end;
$$;

-- Lo que responde una anulación: el resumen del pedido, su venta, la boleta (cómo quedó), la nota de crédito que la anuló (si nació) y lo
-- que se le devolvió en esta anulación, pago por pago.
create or replace function retail.fn_pedido_web_anulacion_respuesta(p_pedido_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_pedido_web_resumen(w.id) || jsonb_build_object(
    'venta_id', w.venta_id, 'anulado_en', w.cerrado_en, 'cierre_motivo', w.cierre_motivo,
    'boleta', (select jsonb_build_object('comprobante_id', c.id, 'texto', c.serie || '-' || lpad(c.numero::text, 6, '0'), 'estado', c.estado)
                 from retail.comprobantes c
                where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura')
                order by c.created_at desc limit 1),
    'nota_credito', (select jsonb_build_object('comprobante_id', n.id, 'texto', n.serie || '-' || lpad(n.numero::text, 6, '0'),
                                               'estado', n.estado, 'total', n.total)
                       from retail.comprobantes c
                       join retail.comprobantes n on n.comprobante_original_id = c.id and n.tipo = 'nota_credito'
                      where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura')
                      order by n.created_at desc limit 1),
    'devuelto', coalesce((select jsonb_agg(jsonb_build_object('pago_id', g.id, 'medio', g.medio, 'monto', g.monto,
                                                              'de_la_caja', g.anulado_caja_movimiento_id is not null)
                                           order by g.registrado_en, g.id)
                            from retail.pedido_web_pagos g
                           where g.pedido_id = w.id and g.estado = 'anulado' and g.anulado_motivo = 'devuelto_al_cliente'
                             and g.anulado_en = w.cerrado_en), '[]'::jsonb))
    from retail.pedidos_web w
   where w.id = p_pedido_id;
$$;

comment on function retail.anular_pedido_web_pagado(uuid, text, uuid) is
  'Pedidos web (ADR-0408, anular pagado, Felipe 2026-10-15): anula un pedido pagado que todavía no se entrega. Suelta sus prendas, devuelve cada pago por su medio (el efectivo, de la caja abierta de hoy), anula su venta y su boleta (sin transmitir si nunca se intentó mandar; con su nota de crédito si SUNAT la aceptó). Todo o nada. La misma marca devuelve la misma anulación.';

-- ----------------------------------------------------------------------------
-- 5. «Revisar si se guardó» sabe revisar una anulación (la misma forma de 20261015042000 y 052000)
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar('retail.fn_resolver_intento(text, uuid)',
$v$'separar_pedido_para_apartar', 'registrar_pago_pedido_web', 'entregar_pedido_web'$v$,
$n$'separar_pedido_para_apartar', 'registrar_pago_pedido_web', 'entregar_pedido_web', 'anular_pedido_web_pagado'$n$,
1);
select pg_temp.anclar('retail.fn_resolver_intento(text, uuid)',
  $v$    elsif p_operacion = 'entregar_pedido_web' then$v$,
  $n$    elsif p_operacion = 'anular_pedido_web_pagado' then
      -- ADR-0408 (anular un pedido pagado): la anulación de un pedido web pagado. Se revisa en la tienda del pedido.
      for v_id, v_ubicacion, v_datos in
        select w.id, w.ubicacion_id,
               jsonb_build_object('pedido_id', w.id, 'codigo', w.codigo, 'estado_pedido', w.estado, 'anulado_en', w.cerrado_en,
                                  'venta_id', w.venta_id)
          from retail.pedidos_web w where w.anulacion_token = p_token
      loop
        exit;
      end loop;
    elsif p_operacion = 'entregar_pedido_web' then$n$);

-- ----------------------------------------------------------------------------
-- 6. El módulo dice lo que ahora incluye (Roles y accesos)
-- ----------------------------------------------------------------------------
update retail.modulos
   set incluye = 'Ver los pedidos que los clientes separan en la tienda online para su tienda, confirmarlos (de dónde sale cada prenda, conseguirla para una fecha o quitarla), no confirmarlos o anularlos con su motivo, cobrarlos, entregarlos con su código y, si ya pagó, anularlos devolviéndole su plata (el efectivo sale de la caja abierta de hoy) y anulando su boleta, y enviar a la tienda del pedido las prendas que se reservaron aquí'
 where clave = 'pedidos_web';

-- ----------------------------------------------------------------------------
-- 7. Quién ejecuta qué
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_pedido_web_camino_boleta(uuid) from public, anon, authenticated;
revoke all on function retail.fn_pedido_web_anulacion_respuesta(uuid) from public, anon, authenticated;
revoke all on function retail.anular_pedido_web_pagado(uuid, text, uuid) from public, anon;
grant execute on function retail.anular_pedido_web_pagado(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Comprobación: si algo no quedó, la migración no se da por aplicada.
-- ----------------------------------------------------------------------------
do $$
begin
  if position('new.estado in (''entregado'', ''anulado'')' in pg_get_functiondef('retail.fn_pedido_web_reglas()'::regprocedure)) = 0
     or position('anulacion_token' in pg_get_functiondef('retail.fn_pedido_web_reglas()'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_reglas no quedó dejando anular un pedido pagado con su marca';
  end if;
  if position('anulado DESPUÉS de quedar pagado completo' in pg_get_functiondef('retail.fn_pedido_web_verificar(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_verificar no quedó revisando un pedido anulado después de pagarse';
  end if;
  if position('la venta no es la de sus prendas' in pg_get_functiondef('retail.fn_pedido_web_verificar(uuid)'::regprocedure)) = 0 then
    raise exception 'fn_pedido_web_verificar perdió el bloque de la actividad 10';
  end if;
  if position('p_operacion = ''anular_pedido_web_pagado''' in pg_get_functiondef('retail.fn_resolver_intento(text, uuid)'::regprocedure)) = 0
     or position('p_operacion = ''entregar_pedido_web''' in pg_get_functiondef('retail.fn_resolver_intento(text, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_resolver_intento no quedó sabiendo revisar una anulación (y una entrega)';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.pedidos_web'::regclass and conname = 'pedidos_web_anulacion_token_coherente') then
    raise exception 'faltan los CHECK del pedido anulado después de pagarse';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
