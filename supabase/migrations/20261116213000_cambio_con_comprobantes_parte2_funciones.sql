-- ============================================================================
-- 20261116213000 — Un cambio con diferencia emite su nota de crédito y su comprobante nuevo · PARTE 2 de 3: funciones (ADR-0671)
--
-- EL PROBLEMA. Ver la parte 1 y docs/adr/0671-cambio-con-diferencia-emite-sus-comprobantes.md.
--
-- LO QUE HACE.
--   1. Piezas nuevas (internas, sin permiso para nadie salvo las que se nombran):
--      · fn_original_del_cambio(venta): el documento vivo de la venta (boleta, factura o nota de venta; nunca un anticipo).
--      · fn_problema_cliente_del_cambio: el documento del cliente del comprobante nuevo (DNI 8, RUC 11, carné o pasaporte, factura a RUC, y una
--        boleta de más de S/ 700 lleva documento: Reglamento de Comprobantes de Pago, art. 8).
--      · fn_emitir_nota_del_cambio(cambio): emite la nota congelada en cambio_notas si la original está aceptada; si no, devuelve null.
--      · fn_documentos_del_cambio(cambio, ítems, total, cliente): el comprobante nuevo (con emitir_comprobante, token = id del cambio) y la nota.
--      · fn_emitir_notas_de_cambios_pendientes(): el barrido (authenticated y service_role), primer paso de /api/lucode/reintentar.
--      · previsualizar_documentos_cambio: lo que va a salir y lo que falta, para la pantalla (solo lee).
--      · fn_cambios_con_documentos_desde(): el corte (primer cambio con documentos) para metas y el vigía.
--   2. registrar_cambio y registrar_cambio_varias ganan `p_cliente jsonb default null` (la firma vieja se borra: dos firmas confunden a
--      PostgREST) y, justo antes de su único `return v_cambio_id`, llaman a fn_documentos_del_cambio con los MISMOS precios que dieron la
--      diferencia. Las vueltas tempranas por token no llegan ahí. El cliente entra a la huella del token solo si viene.
--   3. anular_comprobante y marcar_comprobante_no_emitido rechazan un documento que sale de un cambio y la original de un cambio cuya nota
--      todavía no sale.
--
-- QUÉ NO HACE. No toca el stock, la caja, venta_pagos ni las columnas de dinero de cambios. No toca emitir_comprobante, emitir_nota ni
--   aprobar_devolucion. No regulariza los cambios pasados (decisión de Felipe).
-- SE ROMPE SI: alguien cambia una de las funciones ancladas antes de pegar esto: el ancla no aparece exactamente una vez y la migración se
--   detiene sin aplicar nada. Las anclas van entre $…$ (nunca un «select … into» dentro de un texto entre comillas, ADR-0288).
-- CÓMO SE PEGA. Una sola ejecución, DESPUÉS de la parte 1. Idempotente (si la firma nueva ya existe, no vuelve a anclar). Solo funciones:
--   sin políticas ni disparadores (ADR-0195). `lock_timeout` 3 s.
-- CAÍDA EXTERNA. Nada llama a la red: la transmisión a Lucode sigue en la web y en el cron.
-- PRUEBA. `pnpm pruebas:cambio-con-comprobantes`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. Piezas nuevas ----------

create or replace function retail.fn_original_del_cambio(p_venta_id uuid)
returns retail.comprobantes
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  -- El documento de la venta: el vivo primero (un liberado o anulado solo si no hay otro), el más reciente. Nunca un anticipo de apartado.
  select c.*
    from retail.comprobantes c
   where c.venta_id = p_venta_id
     and c.tipo in ('boleta', 'factura', 'nota_venta')
     and not coalesce(c.es_anticipo, false)
   order by (c.estado in ('anulado', 'no_emitido')), c.created_at desc
   limit 1;
$function$;

comment on function retail.fn_original_del_cambio(uuid) is
  'ADR-0671: el documento original de una venta para un cambio (boleta, factura o nota de venta; el vivo primero). Interna.';

create or replace function retail.fn_problema_cliente_del_cambio(p_tipo text, p_tipo_doc text, p_num_doc text, p_total numeric)
returns text
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select case
    when p_tipo not in ('boleta', 'factura') then null
    when p_tipo = 'factura' and coalesce(p_tipo_doc, '') <> 'ruc' then 'Una factura va a un RUC.'
    when p_tipo_doc in ('carne_extranjeria', 'pasaporte') and retail.fn_documento_clienta(p_tipo_doc, p_num_doc) is null then
      'El número del ' || case p_tipo_doc when 'pasaporte' then 'pasaporte' else 'carné de extranjería' end
        || ' no es válido. Corrígelo, o elige «Sin documento».'
    when retail.fn_problema_documento_comprobante(p_tipo, p_tipo_doc, p_num_doc) is not null then
      retail.fn_problema_documento_comprobante(p_tipo, p_tipo_doc, p_num_doc)
    when p_tipo = 'boleta' and p_total > 700 and coalesce(p_tipo_doc, 'sin_documento') = 'sin_documento' then
      'Una boleta de más de S/ 700 lleva el documento del cliente (DNI, carné de extranjería o pasaporte).'
  end;
$function$;

comment on function retail.fn_problema_cliente_del_cambio(text, text, text, numeric) is
  'ADR-0671: qué impide emitir el comprobante nuevo de un cambio a ese cliente, o null. La comparten la emisión y previsualizar_documentos_cambio.';

create or replace function retail.fn_emitir_nota_del_cambio(p_cambio_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_cn retail.cambio_notas%rowtype;
  v_orig retail.comprobantes%rowtype;
  v_id uuid; v_serie text; v_numero integer; v_igv numeric; v_techo numeric;
begin
  -- La fila congelada, bloqueada: dos barridos (o el cambio y un barrido) no emiten dos notas.
  select * into v_cn from retail.cambio_notas where cambio_id = p_cambio_id for update;
  if not found then return null; end if;
  v_id := (select n.id from retail.comprobantes n where n.cambio_id = p_cambio_id and n.tipo = 'nota_credito');
  if v_id is not null then return v_id; end if;

  -- La original con candado: si SUNAT la está aceptando en este momento, se espera y se vuelve a leer (sin aviso perdido).
  select * into v_orig from retail.comprobantes where id = v_cn.comprobante_original_id for update;
  if v_orig.estado <> 'aceptado' or v_orig.anulacion_solicitada_at is not null then
    return null;  -- por emitir: la emite el barrido cuando SUNAT la acepte
  end if;

  -- El mismo techo que emitir_nota (ADR-0380): las notas vivas no pasan de lo que cobró el original.
  v_techo := round(v_orig.total + v_orig.anticipo_deducido, 2);
  if round(v_cn.total + (select coalesce(sum(n.total), 0) from retail.comprobantes n
                          where n.comprobante_original_id = v_orig.id and n.tipo = 'nota_credito'
                            and n.estado not in ('rechazado', 'anulado')), 2) > v_techo then
    raise exception 'Las notas de crédito de % pasarían de lo que cobró (S/ %): ya se acreditó lo que corresponde.',
      v_orig.serie || '-' || v_orig.numero, v_techo
      using errcode = 'P0001', hint = 'nota_sobre_el_techo';
  end if;

  -- SUNAT: la nota lleva la letra del documento que corrige (ADR-0278), en la serie de la tienda del original.
  select serie, numero into v_serie, v_numero
    from retail.fn_reservar_numero_serie(v_orig.ubicacion_id, 'nota_credito',
                                         case v_orig.tipo when 'boleta' then 'B' when 'factura' then 'F' end);
  v_igv := round(v_cn.total - v_cn.total / 1.18, 2);
  insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
                                   subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items, cambio_id)
    values (v_orig.ubicacion_id, 'nota_credito', v_serie, v_numero, v_orig.cliente_tipo_doc, v_orig.cliente_num_doc,
            v_orig.cliente_nombre, v_cn.total - v_igv, v_igv, v_cn.total, v_cn.usuario_id, v_orig.id, v_cn.motivo, v_cn.items,
            p_cambio_id)
    returning id into v_id;
  return v_id;
end;
$function$;

comment on function retail.fn_emitir_nota_del_cambio(uuid) is
  'ADR-0671: emite la nota de crédito congelada de un cambio si su original ya está aceptado por SUNAT (y la devuelve); si no, null. Idempotente. Interna: no pide sesión, así la usa también el barrido del cron.';

create or replace function retail.fn_documentos_del_cambio(p_cambio_id uuid, p_items_nuevo jsonb, p_total_nuevo numeric, p_cliente jsonb)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_c retail.cambios%rowtype;
  v_item retail.venta_items%rowtype;
  v_orig retail.comprobantes%rowtype;
  v_hay_orig boolean;
  v_tipo text; v_tdoc text; v_ndoc text; v_nom text;
  v_pagado numeric; v_igv numeric; v_nuevo uuid; v_problema text; v_es_total boolean;
begin
  select * into v_c from retail.cambios where id = p_cambio_id;
  if not found then raise exception 'El cambio % no existe', p_cambio_id; end if;
  -- Mismo precio, o el mismo modelo en otra talla o color sin diferencia: no se emite nada (decisión de Felipe).
  if v_c.diferencia = 0 then return; end if;
  select * into v_item from retail.venta_items where id = v_c.venta_item_id;
  if coalesce((select v.es_prueba from retail.ventas v where v.id = v_item.venta_id), false) then return; end if;

  -- Los montos que llegan son los que dieron la diferencia; se comprueba que cuadren antes de reservar nada.
  v_pagado := round((v_item.precio_unitario - v_item.descuento_unitario) * v_c.cantidad, 2);
  if p_total_nuevo is null or round(p_total_nuevo - v_pagado, 2) <> round(v_c.diferencia, 2) then
    raise exception 'El comprobante nuevo (S/ %) menos lo pagado (S/ %) no da la diferencia del cambio (S/ %).',
      p_total_nuevo, v_pagado, v_c.diferencia;
  end if;
  if p_items_nuevo is null or jsonb_typeof(p_items_nuevo) <> 'array' or jsonb_array_length(p_items_nuevo) = 0
     or round((select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::numeric)
                 from jsonb_array_elements(p_items_nuevo) e), 2) <> round(p_total_nuevo, 2) then
    raise exception 'Las líneas del comprobante nuevo no suman su total (S/ %).', p_total_nuevo;
  end if;

  v_orig := retail.fn_original_del_cambio(v_item.venta_id);
  v_hay_orig := v_orig.id is not null;

  -- El comprobante nuevo: el mismo tipo que el original (sin original, boleta) y, por defecto, el mismo cliente. En una boleta o una nota
  -- de venta se puede cambiar (un regalo); una factura va siempre al mismo RUC.
  v_tipo := case when v_hay_orig then v_orig.tipo else 'boleta' end;
  v_tdoc := coalesce(case when v_hay_orig then v_orig.cliente_tipo_doc end, 'sin_documento');
  v_ndoc := case when v_hay_orig then v_orig.cliente_num_doc end;
  v_nom := case when v_hay_orig then v_orig.cliente_nombre end;
  if p_cliente is not null and v_tipo <> 'factura' then
    v_tdoc := coalesce(nullif(btrim(p_cliente ->> 'tipo_doc'), ''), 'sin_documento');
    v_ndoc := case when v_tdoc = 'sin_documento' then null else nullif(btrim(p_cliente ->> 'num_doc'), '') end;
    v_nom := nullif(btrim(p_cliente ->> 'nombre'), '');
  end if;
  v_problema := retail.fn_problema_cliente_del_cambio(v_tipo, v_tdoc, v_ndoc, p_total_nuevo);
  if v_problema is not null then
    raise exception '%', v_problema using errcode = '22023', hint = 'documento_invalido';
  end if;

  v_igv := case when v_tipo = 'nota_venta' then 0 else round(p_total_nuevo - p_total_nuevo / 1.18, 2) end;
  v_nuevo := retail.emitir_comprobante(v_c.ubicacion_id, v_tipo, p_total_nuevo - v_igv, v_igv, p_total_nuevo, null,
                                       v_tdoc, v_ndoc, v_nom, p_items_nuevo, p_cambio_id);
  update retail.comprobantes set cambio_id = p_cambio_id where id = v_nuevo and cambio_id is null;

  -- La nota de crédito sobre la original: solo si es una boleta o factura viva y lo devuelto se pagó (una línea pagada en 0 no lleva nota,
  -- como en aprobar_devolucion). Motivo 06 si el cambio cubre toda la venta; si no, 07. Ítems: solo lo devuelto (ADR-0382).
  if v_hay_orig and v_orig.tipo in ('boleta', 'factura') and v_orig.estado not in ('anulado', 'no_emitido') and v_pagado > 0 then
    v_es_total := not exists (select 1 from retail.venta_items vi
                               where vi.venta_id = v_item.venta_id
                                 and vi.cantidad <> case when vi.id = v_item.id then v_c.cantidad else 0 end);
    insert into retail.cambio_notas (cambio_id, comprobante_original_id, motivo, items, total, usuario_id)
      values (p_cambio_id, v_orig.id, case when v_es_total then '06' else '07' end,
              jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'variante_id', v_item.variante_id, 'cantidad', v_c.cantidad,
                'precio_unitario', v_item.precio_unitario, 'descuento_unitario', v_item.descuento_unitario,
                'descripcion_libre', (select pr.descripcion from retail.prendas_por_regularizar pr
                                       where pr.venta_item_id = v_item.id limit 1)))),
              v_pagado, v_c.usuario_id);
    perform retail.fn_emitir_nota_del_cambio(p_cambio_id);
  end if;
end;
$function$;

comment on function retail.fn_documentos_del_cambio(uuid, jsonb, numeric, jsonb) is
  'ADR-0671: los documentos de un cambio con diferencia: el comprobante nuevo (siempre, al momento) y la nota de crédito sobre la original (en el acto si está aceptada; si no, por emitir). La llaman solo registrar_cambio y registrar_cambio_varias, en su misma transacción.';

create or replace function retail.fn_emitir_notas_de_cambios_pendientes()
returns integer
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare r record; v_n integer := 0; v_id uuid;
begin
  -- Las notas por emitir cuya original ya está aceptada. Cada una en su propio bloque: si una falla, se anota y siguen las demás.
  for r in
    select cn.cambio_id
      from retail.cambio_notas cn
      join retail.comprobantes o on o.id = cn.comprobante_original_id
     where o.estado = 'aceptado' and o.anulacion_solicitada_at is null
       and not exists (select 1 from retail.comprobantes n where n.cambio_id = cn.cambio_id and n.tipo = 'nota_credito')
     order by cn.created_at
     limit 50
  loop
    begin
      v_id := retail.fn_emitir_nota_del_cambio(r.cambio_id);
      if v_id is not null then v_n := v_n + 1; end if;
    exception when others then
      update retail.cambio_notas
         set intentos = intentos + 1, ultimo_intento_at = now(), ultimo_error = left(sqlerrm, 500)
       where cambio_id = r.cambio_id;
    end;
  end loop;
  return v_n;
end;
$function$;

comment on function retail.fn_emitir_notas_de_cambios_pendientes() is
  'ADR-0671: el barrido de las notas de crédito de cambios que esperaban a que SUNAT aceptara su original. Lo llama /api/lucode/reintentar (navegador y cron) antes de transmitir. Devuelve cuántas emitió.';

create or replace function retail.fn_cambios_con_documentos_desde()
returns timestamptz
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  select min(c.created_at) from retail.cambios c
   where exists (select 1 from retail.comprobantes x where x.cambio_id = c.id);
$function$;

comment on function retail.fn_cambios_con_documentos_desde() is
  'ADR-0671: desde cuándo los cambios emiten documentos (el primer cambio que los tuvo), o null. Lo leen las metas y el vigía para no reescribir los meses de antes.';

create or replace function retail.previsualizar_documentos_cambio(p_venta_item_id uuid, p_ubicacion_id uuid, p_cantidad integer,
                                                                  p_total_nuevo numeric, p_cliente jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_item retail.venta_items%rowtype;
  v_orig retail.comprobantes%rowtype;
  v_hay_orig boolean;
  v_tipo text; v_tdoc text; v_ndoc text; v_nom text;
  v_pagado numeric; v_dif numeric; v_nota text; v_problema text;
begin
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para hacer cambios en esa ubicación' using errcode = '42501';
  end if;
  select * into v_item from retail.venta_items where id = p_venta_item_id;
  if not found then raise exception 'La línea de venta % no existe', p_venta_item_id; end if;
  v_pagado := round((v_item.precio_unitario - v_item.descuento_unitario) * coalesce(p_cantidad, 1), 2);
  v_dif := round(coalesce(p_total_nuevo, v_pagado) - v_pagado, 2);
  if v_dif = 0 or coalesce((select v.es_prueba from retail.ventas v where v.id = v_item.venta_id), false) then
    return jsonb_build_object('emite', false, 'diferencia', v_dif);
  end if;

  v_orig := retail.fn_original_del_cambio(v_item.venta_id);
  v_hay_orig := v_orig.id is not null;
  v_tipo := case when v_hay_orig then v_orig.tipo else 'boleta' end;
  v_tdoc := coalesce(case when v_hay_orig then v_orig.cliente_tipo_doc end, 'sin_documento');
  v_ndoc := case when v_hay_orig then v_orig.cliente_num_doc end;
  v_nom := case when v_hay_orig then v_orig.cliente_nombre end;
  if p_cliente is not null and v_tipo <> 'factura' then
    v_tdoc := coalesce(nullif(btrim(p_cliente ->> 'tipo_doc'), ''), 'sin_documento');
    v_ndoc := case when v_tdoc = 'sin_documento' then null else nullif(btrim(p_cliente ->> 'num_doc'), '') end;
    v_nom := nullif(btrim(p_cliente ->> 'nombre'), '');
  end if;

  v_nota := case
    when not v_hay_orig or v_orig.tipo = 'nota_venta' or v_orig.estado in ('anulado', 'no_emitido') or v_pagado <= 0 then 'no'
    when v_orig.estado = 'aceptado' and v_orig.anulacion_solicitada_at is null then 'ahora'
    else 'despues'
  end;

  v_problema := retail.fn_problema_cliente_del_cambio(v_tipo, v_tdoc, v_ndoc, p_total_nuevo);
  if v_problema is null and not exists (select 1 from retail.series_comprobantes s
                                         where s.ubicacion_id = p_ubicacion_id and s.tipo = v_tipo and s.archivada_at is null) then
    v_problema := 'Esta tienda no tiene serie de ' || replace(v_tipo, '_', ' ') || ' activa: regístrala en Facturación.';
  end if;
  if v_problema is null and v_nota <> 'no' then
    if not exists (select 1 from retail.series_comprobantes s
                    where s.ubicacion_id = v_orig.ubicacion_id and s.tipo = 'nota_credito' and s.archivada_at is null
                      and left(s.serie, 1) = case v_orig.tipo when 'boleta' then 'B' else 'F' end) then
      v_problema := 'La tienda de la compra no tiene serie de nota de crédito activa: regístrala en Facturación.';
    elsif round(v_pagado + (select coalesce(sum(n.total), 0) from retail.comprobantes n
                             where n.comprobante_original_id = v_orig.id and n.tipo = 'nota_credito'
                               and n.estado not in ('rechazado', 'anulado')), 2)
          > round(v_orig.total + v_orig.anticipo_deducido, 2) then
      v_problema := 'Las notas de crédito de ' || v_orig.serie || '-' || v_orig.numero || ' ya cubren lo que cobró.';
    end if;
  end if;

  return jsonb_build_object(
    'emite', true,
    'diferencia', v_dif,
    'nuevo', jsonb_build_object('tipo', v_tipo, 'total', round(coalesce(p_total_nuevo, 0), 2),
                                'cliente_tipo_doc', v_tdoc, 'cliente_num_doc', v_ndoc, 'cliente_nombre', v_nom,
                                'editable', v_tipo <> 'factura'),
    'nota', jsonb_build_object('cuando', v_nota, 'total', v_pagado,
                               'original', case when v_hay_orig then v_orig.serie || '-' || v_orig.numero end,
                               'original_tipo', case when v_hay_orig then v_orig.tipo end),
    'problema', v_problema);
end;
$function$;

comment on function retail.previsualizar_documentos_cambio(uuid, uuid, integer, numeric, jsonb) is
  'ADR-0671: qué documentos va a emitir un cambio (comprobante nuevo con su cliente, nota de crédito ahora o después) y qué lo impediría, para decirlo antes de confirmar. Solo lee.';

-- La sonda: existe desde que la base emite los documentos de un cambio. Cambios la pregunta (como fn_acepta_qr_en_cambios) antes de
-- mandar p_cliente o de decir qué documentos salen: si la web se publica antes que esta migración, sigue cambiando como antes.
create or replace function retail.fn_cambio_emite_comprobantes()
returns boolean
language sql
stable
set search_path to 'retail', 'public', 'extensions'
as $function$
  select true;
$function$;

comment on function retail.fn_cambio_emite_comprobantes() is
  'ADR-0671: existe desde que un cambio con diferencia emite su comprobante nuevo y su nota de crédito. La pantalla de Cambios la pregunta antes de mandar p_cliente.';

revoke all on function retail.fn_cambio_emite_comprobantes() from public, anon;
grant execute on function retail.fn_cambio_emite_comprobantes() to authenticated;

revoke all on function retail.fn_original_del_cambio(uuid) from public, anon, authenticated, service_role;
revoke all on function retail.fn_problema_cliente_del_cambio(text, text, text, numeric) from public, anon, authenticated, service_role;
revoke all on function retail.fn_emitir_nota_del_cambio(uuid) from public, anon, authenticated, service_role;
revoke all on function retail.fn_documentos_del_cambio(uuid, jsonb, numeric, jsonb) from public, anon, authenticated, service_role;
revoke all on function retail.fn_emitir_notas_de_cambios_pendientes() from public, anon;
grant execute on function retail.fn_emitir_notas_de_cambios_pendientes() to authenticated, service_role;
revoke all on function retail.fn_cambios_con_documentos_desde() from public, anon;
grant execute on function retail.fn_cambios_con_documentos_desde() to authenticated, service_role;
revoke all on function retail.previsualizar_documentos_cambio(uuid, uuid, integer, numeric, jsonb) from public, anon;
grant execute on function retail.previsualizar_documentos_cambio(uuid, uuid, integer, numeric, jsonb) to authenticated;

-- ---------- 2. Las dos funciones de cambio: el cliente y los documentos ----------

create or replace function pg_temp.anclar_0671(p_def text, p_viejo text, p_nuevo text, p_que text)
returns text
language plpgsql
as $f$
declare v_n integer;
begin
  v_n := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). No se aplicó nada.', p_que, v_n;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$f$;

do $do$
declare v_def text;
begin
  if to_regprocedure('retail.registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text,jsonb)') is not null then
    raise notice 'registrar_cambio ya tiene p_cliente: no se vuelve a anclar.';
    return;
  end if;
  v_def := pg_get_functiondef('retail.registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text)'::regprocedure);
  v_def := pg_temp.anclar_0671(v_def,
    $v$p_condicion text DEFAULT 'vendible'::text)
 RETURNS uuid$v$,
    $n$p_condicion text DEFAULT 'vendible'::text, p_cliente jsonb DEFAULT NULL::jsonb)
 RETURNS uuid$n$,
    'registrar_cambio (firma)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text));$v$,
    $n$p_venta_item_id, p_ubicacion_id, p_variante_nueva_id, p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text
    || coalesce(p_cliente::text, '')));  -- ADR-0671: el cliente del comprobante nuevo entra a la huella solo si viene$n$,
    'registrar_cambio (huella)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$  return v_cambio_id;$v$,
    $n$  -- ADR-0671: con diferencia, el comprobante nuevo (al precio de cambio que dio la diferencia: no se vuelve a calcular) y la nota de
  -- crédito sobre la original, en esta misma transacción y después del stock: o queda el cambio con sus documentos, o nada.
  perform retail.fn_documentos_del_cambio(
    v_cambio_id,
    jsonb_build_array(jsonb_build_object(
      'variante_id', p_variante_nueva_id, 'cantidad', p_cantidad,
      'precio_unitario', greatest(v_precio_nuevo, round(v_diferencia / p_cantidad, 2) + (v_item.precio_unitario - v_item.descuento_unitario)),
      'descuento_unitario', greatest(v_precio_nuevo, round(v_diferencia / p_cantidad, 2) + (v_item.precio_unitario - v_item.descuento_unitario))
                            - (round(v_diferencia / p_cantidad, 2) + (v_item.precio_unitario - v_item.descuento_unitario)))),
    v_diferencia + (v_item.precio_unitario - v_item.descuento_unitario) * p_cantidad,
    p_cliente);

  return v_cambio_id;$n$,
    'registrar_cambio (documentos)');
  execute v_def;
  drop function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text);
end;
$do$;

revoke all on function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text, jsonb) from public, anon;
grant execute on function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text, jsonb) to authenticated;

do $do$
declare v_def text;
begin
  if to_regprocedure('retail.registrar_cambio_varias(uuid,uuid,jsonb,integer,text,uuid,text,text,jsonb)') is not null then
    raise notice 'registrar_cambio_varias ya tiene p_cliente: no se vuelve a anclar.';
    return;
  end if;
  v_def := pg_get_functiondef('retail.registrar_cambio_varias(uuid,uuid,jsonb,integer,text,uuid,text,text)'::regprocedure);
  v_def := pg_temp.anclar_0671(v_def,
    $v$p_condicion text DEFAULT 'vendible'::text)
 RETURNS uuid$v$,
    $n$p_condicion text DEFAULT 'vendible'::text, p_cliente jsonb DEFAULT NULL::jsonb)
 RETURNS uuid$n$,
    'registrar_cambio_varias (firma)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$    p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text));$v$,
    $n$    p_cantidad, p_metodo_pago_diferencia, p_motivo, p_condicion)::text
    || coalesce(p_cliente::text, '')));  -- ADR-0671: el cliente del comprobante nuevo entra a la huella solo si viene$n$,
    'registrar_cambio_varias (huella)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$  v_mismo integer := p_cantidad; v_k integer; v_pm numeric;  -- ADR-0655: unidades del mismo modelo que aún conservan su descuento$v$,
    $n$  v_mismo integer := p_cantidad; v_k integer; v_pm numeric;  -- ADR-0655: unidades del mismo modelo que aún conservan su descuento
  v_items_nuevo jsonb := '[]'::jsonb;  -- ADR-0671: las líneas del comprobante nuevo, con los mismos precios que dan la diferencia$n$,
    'registrar_cambio_varias (declaración)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$    v_total_nuevo := v_total_nuevo + coalesce(v_pm, 0) * v_k + v_precio * (v_cants[i] - v_k);$v$,
    $n$    v_total_nuevo := v_total_nuevo + coalesce(v_pm, 0) * v_k + v_precio * (v_cants[i] - v_k);
    -- ADR-0671: cada prenda con sus unidades del mismo modelo (al precio que conserva el descuento) y el resto a su precio de cambio.
    if v_k > 0 then
      v_items_nuevo := v_items_nuevo || jsonb_build_object('variante_id', v_vars[i], 'cantidad', v_k,
        'precio_unitario', greatest(v_precio, v_pm), 'descuento_unitario', greatest(v_precio, v_pm) - v_pm);
    end if;
    if v_cants[i] - v_k > 0 then
      v_items_nuevo := v_items_nuevo || jsonb_build_object('variante_id', v_vars[i], 'cantidad', v_cants[i] - v_k,
        'precio_unitario', v_precio, 'descuento_unitario', 0);
    end if;$n$,
    'registrar_cambio_varias (líneas)');
  v_def := pg_temp.anclar_0671(v_def,
    $v$  return v_cambio_id;$v$,
    $n$  -- ADR-0671: con diferencia, el comprobante nuevo y la nota de crédito, en esta misma transacción y después del stock.
  perform retail.fn_documentos_del_cambio(v_cambio_id, v_items_nuevo, v_total_nuevo, p_cliente);

  return v_cambio_id;$n$,
    'registrar_cambio_varias (documentos)');
  execute v_def;
  drop function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text);
end;
$do$;

revoke all on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text, jsonb) from public, anon;
grant execute on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text, jsonb) to authenticated, service_role;

comment on function retail.registrar_cambio(uuid, uuid, uuid, integer, text, uuid, text, text, jsonb) is
  'Cambia una prenda vendida por otra (stock, caja y, con diferencia, su comprobante nuevo y su nota de crédito: ADR-0671). p_cliente: el cliente del comprobante nuevo si no es el de la compra (boleta o nota de venta).';
comment on function retail.registrar_cambio_varias(uuid, uuid, jsonb, integer, text, uuid, text, text, jsonb) is
  'ADR-0470: cambia UNA línea de venta por VARIAS prendas en un solo guardado (stock, caja y cuentas con la diferencia total). Mismas reglas que registrar_cambio, también sus documentos (ADR-0671).';

-- ---------- 3. Anular o liberar una mitad de un cambio, no ----------

create or replace function pg_temp.reemplazar_0671(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare v_def text := pg_get_functiondef(p_firma::regprocedure);
begin
  if position(p_nuevo in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  execute pg_temp.anclar_0671(v_def, p_viejo, p_nuevo, p_firma);
end;
$f$;

select pg_temp.reemplazar_0671(
  'retail.anular_comprobante(uuid, text, boolean, jsonb)',
  $v$  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo de anulación es obligatorio';$v$,
  $n$  -- ADR-0671: un documento que sale de un cambio no se anula por separado (SUNAT quedaría sin la prenda que salió o con la que volvió),
  -- ni la original de un cambio cuya nota de crédito todavía no sale.
  if v_comp.cambio_id is not null then
    raise exception 'Este documento sale de un cambio: no se anula por separado.' using errcode = 'P0001', hint = 'documento_de_un_cambio';
  end if;
  if exists (select 1 from retail.cambio_notas cn
              where cn.comprobante_original_id = p_comprobante_id
                and not exists (select 1 from retail.comprobantes n where n.cambio_id = cn.cambio_id and n.tipo = 'nota_credito')) then
    raise exception 'Este comprobante tiene un cambio cuya nota de crédito todavía no sale: no se anula mientras tanto.'
      using errcode = 'P0001', hint = 'original_de_un_cambio';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo de anulación es obligatorio';$n$
);

select pg_temp.reemplazar_0671(
  'retail.marcar_comprobante_no_emitido(uuid, text)',
  $v$  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo es obligatorio para liberar un comprobante como no emitido';$v$,
  $n$  -- ADR-0671: un documento que sale de un cambio no se libera por separado, ni la original de un cambio cuya nota todavía no sale.
  if v_comp.cambio_id is not null then
    raise exception 'Este documento sale de un cambio: no se libera por separado.' using errcode = 'P0001', hint = 'documento_de_un_cambio';
  end if;
  if exists (select 1 from retail.cambio_notas cn
              where cn.comprobante_original_id = p_comprobante_id
                and not exists (select 1 from retail.comprobantes n where n.cambio_id = cn.cambio_id and n.tipo = 'nota_credito')) then
    raise exception 'Este comprobante tiene un cambio cuya nota de crédito todavía no sale: no se libera mientras tanto.'
      using errcode = 'P0001', hint = 'original_de_un_cambio';
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo es obligatorio para liberar un comprobante como no emitido';$n$
);
