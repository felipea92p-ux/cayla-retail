-- ============================================================================
-- 20261128163000_servicio_pagado_al_proveedor_actual.sql — CAYLA V2 (auditoría 2026-11-28, hallazgo N.º 3)
-- Lo pagado a un servicio cuenta solo para el servicio que hoy hace la fase
--
-- EL PROBLEMA PRIMERO. Se le paga a la maquila A por la costura. Después se anulan su vuelta y su salida («mandé al taller equivocado»), la fase pasa
-- a la maquila B y B devuelve las prendas. `fn_servicios_por_pagar` restaba de lo devengado TODO lo documentado de la fase, sin mirar a quién: lo
-- pagado a A tapaba la deuda con B. Por pagar no mostraba nada y `pagar_servicio_de_orden` rechazaba el pago («se le debe S/ 0»). La maquila que sí
-- hizo el trabajo quedaba sin cobrar y sin ninguna pantalla que lo dijera.
--
-- LA DECISIÓN.
--   (a) Lo documentado de una fase cuenta solo los comprobantes del proveedor que HOY la hace (`c.proveedor_id = pf.proveedor_id`). Si la fase
--       vuelve a A, lo pagado a A vuelve a contar solo. `pagar_servicio_de_orden` no calcula aparte: lee `falta` de esta misma función, así que
--       queda alineada sin tocarla.
--   (b) No se cambia de servicio (`cambiar_quien_fase`, `dejar_fase_pendiente_de_registrar`) mientras el servicio de antes tenga en esa fase un papel
--       vigente que SE PUEDE anular (a crédito, sin pagos): rechaza con `servicio_con_papel_anulable` y dice cuál anular en Facturas de insumos. Ese papel
--       cobraría por un trabajo anulado y Por pagar lo seguiría mostrando como deuda con A.
--       Un papel CON pagos (lo normal: «Pagar» al contado) no frena: `anular_comprobante_produccion` no deja anular un comprobante con pagos y la
--       web no tiene cómo borrar un pago, así que frenar ahí dejaría la orden encerrada sin salida. Ese pago queda como plata adelantada a A sin
--       trabajo, igual que el hallazgo N.º 13; resolverlo (saldo a favor) es otra decisión.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_servicios_por_pagar()` → misma forma; `documentado` y `falta` miran solo al proveedor actual de la fase.
--            `cambiar_quien_fase` y `dejar_fase_pendiente_de_registrar` → igual que antes, salvo el rechazo nuevo.
--   ASUME:   un comprobante de servicio documenta una fase (`comprobantes_produccion_items.fase_id`, ADR-0614) y lo emite el proveedor que la hizo.
--   FALLA:   `servicio_con_papel_anulable` al cambiar de servicio (o pasarlo al Taller o a «pendiente de registrar») con un papel anulable del servicio actual.
--            Cambiar solo la tarifa, el fijo o la fecha del MISMO servicio no se frena.
--   NO HACE: no anula ni mueve papeles ni pagos, no muestra el saldo a favor de A (N.º 13) ni toca las órdenes anuladas (N.º 11).
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable: tres reemplazos anclados (abortan si la función cambió desde que se escribió esto) y una función nueva.
-- Sin `alter table`, sin políticas y sin `drop trigger`: ADR-0195 no aplica. La web no cambia: el rechazo llega como `P0001` y la hoja de
-- «Cambiar quién» muestra el mensaje de la base tal cual (`traducirError`). Se puede pegar antes o después de publicar la web.
--
-- VERIFICACIÓN (solo lectura):
--   select position('c.proveedor_id = pf.proveedor_id' in pg_get_functiondef('retail.fn_servicios_por_pagar()'::regprocedure)) > 0,
--          position('fn_servicio_exigir_sin_papel_anulable' in pg_get_functiondef('retail.cambiar_quien_fase(uuid,text,uuid,numeric,numeric,integer,date)'::regprocedure)) > 0,
--          position('fn_servicio_exigir_sin_papel_anulable' in pg_get_functiondef('retail.dejar_fase_pendiente_de_registrar(uuid,date,numeric,numeric,integer,boolean)'::regprocedure)) > 0;  → t | t | t
-- CÓMO SE DESHACE: los tres reemplazos al revés (quitar la condición y los dos bloques `if … perform retail.fn_servicio_exigir_sin_papel_anulable`)
-- y `drop function retail.fn_servicio_exigir_sin_papel_anulable(uuid, uuid)`.
-- ============================================================================

set lock_timeout = '3s';

-- El papel del servicio de antes que todavía se puede anular: vigente, sin pagos, sin insumos recibidos ni líneas cerradas, y sin orden de insumos
-- (las mismas condiciones con que `anular_comprobante_produccion` sí lo anula). Si existe, no se cambia de servicio y se dice cuál es.
create or replace function retail.fn_servicio_exigir_sin_papel_anulable(p_fase_id uuid, p_proveedor_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_c record;
begin
  for v_c in
    select c.serie || '-' || c.numero as papel, pv.nombre as proveedor, retail.fn_fase_nombre(f.clave) as fase
      from retail.comprobantes_produccion c
      join retail.comprobantes_produccion_items i on i.comprobante_id = c.id and i.fase_id = p_fase_id
      join retail.produccion_fases f on f.id = p_fase_id
      left join retail.proveedores_produccion pv on pv.id = c.proveedor_id
     where c.estado = 'vigente'
       and c.proveedor_id = p_proveedor_id
       and c.orden_insumo_id is null
       and not exists (select 1 from retail.comprobantes_produccion_pagos g where g.comprobante_id = c.id)
       and not exists (select 1 from retail.insumo_lotes l join retail.comprobantes_produccion_items x on x.id = l.comprobante_item_id where x.comprobante_id = c.id)
       and not exists (select 1 from retail.comprobantes_produccion_cierres k join retail.comprobantes_produccion_items x on x.id = k.item_id where x.comprobante_id = c.id)
     order by c.created_at
  loop
    raise exception '% tiene un papel de % sin pagar (%). Anúlalo en Facturas de insumos (lo hace un líder) y vuelve a intentar.',
      v_c.fase, coalesce(v_c.proveedor, 'el servicio'), v_c.papel
      using hint = 'servicio_con_papel_anulable';
  end loop;
end;
$$;

revoke all on function retail.fn_servicio_exigir_sin_papel_anulable(uuid, uuid) from public, anon, authenticated;

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- (a) Lo documentado de la fase: solo los papeles del proveedor que hoy la hace.
select pg_temp.reemplazar_anclado(
  'retail.fn_servicios_por_pagar()',
  $v$where i.fase_id = pf.id and c.estado = 'vigente'$v$,
  $n$where i.fase_id = pf.id and c.estado = 'vigente' and c.proveedor_id = pf.proveedor_id$n$
);

-- (b) Cambiar de servicio, o pasar la fase al Taller o a «pendiente de registrar», con un papel anulable del servicio de antes.
select pg_temp.reemplazar_anclado(
  'retail.cambiar_quien_fase(uuid,text,uuid,numeric,numeric,integer,date)',
  $v$    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;$v$,
  $n$    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  -- Auditoría 2026-11-28 (N.º 3): el papel a crédito del servicio de antes se anula primero; si no, cobraría por un trabajo anulado.
  if v_f.proveedor_id is not null and (p_quien is distinct from 'servicio' or p_proveedor_id is distinct from v_f.proveedor_id) then
    perform retail.fn_servicio_exigir_sin_papel_anulable(p_fase_id, v_f.proveedor_id);
  end if;$n$
);

select pg_temp.reemplazar_anclado(
  'retail.dejar_fase_pendiente_de_registrar(uuid,date,numeric,numeric,integer,boolean)',
  $v$    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;$v$,
  $n$    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  -- Auditoría 2026-11-28 (N.º 3): igual que `cambiar_quien_fase`, el papel a crédito del servicio de antes se anula primero.
  if not v_ya_pendiente and v_f.proveedor_id is not null then
    perform retail.fn_servicio_exigir_sin_papel_anulable(p_fase_id, v_f.proveedor_id);
  end if;$n$
);

reset lock_timeout;
