-- ============================================================================
-- 20261105225000_regularizar_lotes_y_papeles.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividades 6 y 7)
-- Lo que ya entró se puede regularizar: el proveedor de un lote, el papel que llegó después y lo que de verdad queda
--
-- EL PROBLEMA PRIMERO. Tres cosas se anotaron bien a medias y no tenían arreglo desde una pantalla:
--   1. Los lotes de compra de antes no dicen a quién se le compró. Nada los deja completar: si alguien revisa un costo raro, no sabe de dónde salió la tela.
--   2. Una compra «sin papel» queda como nota de venta provisional S/P, con la promesa de reemplazarla cuando llegue el papel real. Hoy la única salida es anular y
--      registrar de nuevo, y se puede anular solo si nadie la pagó ni la recibió, y por «Llegó una compra» siempre se recibe.
--   3. Si un conteo dice que hay menos tela que el sistema en un lote ya usado, no se puede decir: «De este lote ya salió material», responde la hoja, y Felipe decidió que
--      en ese caso «solo se ajusta lo que queda» (ADR-0570, rondas 4, 5 y 8).
--
-- LA DECISIÓN.
--   1. `asignar_proveedor_a_lote`: escribe el nombre, sin crear deuda. Si todavía se le debe, eso es una factura.
--   2. `reemplazar_papel_provisional`: el comprobante cambia de tipo, serie, número y total, y sus lotes cambian de documento. Las líneas y los pagos no se tocan.
--   3. `ajustar_lote_usado`: lo que falta sale como `merma`, que el lote y el libro ya saben contar, sin tocar lo que entró ni lo recibido de la factura. Solo baja: si hay más,
--      no es un ajuste de este lote sino otro lote («Saldo inicial»), con su propio costo.
--
-- CONTRATO (Liskov)
--   PROMETE: cada una deja su fila en `insumo_lote_cambios` o en Actividad, y un error no deja nada escrito.
--   ASUME:   solo un líder, con el responsable del combo.
--   FALLA:   `lote_no_es_compra`, `lote_ya_tiene_proveedor`, `proveedor_inexistente`; `papel_no_es_provisional`, `papel_tipo_invalido`, `papel_sin_numero`, `papel_total_invalido`,
--            `papel_fecha_futura`, `papel_repetido`, `papel_menor_a_lo_pagado`; `lote_cambio_mientras_tanto`, `ajuste_invalido`, `ajuste_sin_cambio`, `lote_sin_usar` (ese se corrige con el lápiz).
--   NO HACE: no toca el costo de un lote ni el de una prenda: la merma ya sale del lote a su costo.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. Un CHECK y tres funciones: ADR-0195 no aplica. Pegar ANTES de publicar la web.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regproc('retail.asignar_proveedor_a_lote') is not null, to_regproc('retail.reemplazar_papel_provisional') is not null, to_regproc('retail.ajustar_lote_usado') is not null;  → t | t | t
-- CÓMO SE DESHACE: `drop function` de las tres. El CHECK se deja: las filas que ya usaron esas acciones lo necesitan.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.insumo_lote_cambios
  drop constraint if exists insumo_lote_cambios_accion_check,
  add constraint insumo_lote_cambios_accion_check check (accion = any (array['corregir'::text, 'eliminar'::text, 'restaurar'::text, 'proveedor'::text, 'ajustar'::text]));

create or replace function retail.asignar_proveedor_a_lote(p_lote_id uuid, p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  l retail.insumo_lotes;
  v_actor uuid;
  v_nombre text;
begin
  l := retail.fn_ingreso_insumo_abrir(p_lote_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if l.origen is distinct from 'compra' then
    raise exception 'Solo una compra tiene a quién se le compró.' using hint = 'lote_no_es_compra';
  end if;
  if l.proveedor_id is not null then
    raise exception 'Este lote ya dice a quién se le compró.' using hint = 'lote_ya_tiene_proveedor';
  end if;
  v_nombre := (select p.nombre from retail.proveedores_produccion p where p.id = p_proveedor_id);
  if v_nombre is null then
    raise exception 'Ese proveedor no existe en el directorio de Producción.' using hint = 'proveedor_inexistente';
  end if;
  update retail.insumo_lotes set proveedor_id = p_proveedor_id where id = l.id;
  insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (l.id, l.insumo_id, l.ubicacion_id, 'proveedor', 'Se completó a quién se le compró', jsonb_build_object('proveedor_id', null), jsonb_build_object('proveedor_id', p_proveedor_id), v_actor);
  perform retail.fn_ingreso_insumo_anotar('insumo_lote_proveedor', 'anotó que un lote se le compró a ' || v_nombre, v_actor, l.ubicacion_id, l.insumo_id,
    jsonb_build_object('lote_id', l.id, 'proveedor_id', p_proveedor_id));
  return jsonb_build_object('lote_id', l.id);
end;
$$;

create or replace function retail.ajustar_lote_usado(p_lote_id uuid, p_queda_que_vio numeric, p_queda numeric, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  l retail.insumo_lotes;
  v_actor uuid;
  v_saldo numeric;
  v_falta numeric;
  v_motivo text;
begin
  l := retail.fn_ingreso_insumo_abrir(p_lote_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if l.anulado_at is not null then
    raise exception 'Este ingreso ya se eliminó.' using hint = 'ingreso_eliminado';
  end if;
  -- El lápiz de un lote sin usar corrige lo que entró: este ajuste es solo para el que ya se usó.
  if retail.fn_ingreso_insumo_corregible(l.id) is null then
    raise exception 'De este lote no salió nada: corrígelo con el lápiz.' using hint = 'lote_sin_usar';
  end if;
  v_saldo := l.cantidad_ingresada
    - coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo', 'merma')), 0)
    + coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo = 'devolucion'), 0);
  if p_queda_que_vio is null or p_queda_que_vio <> v_saldo then
    raise exception 'Este lote cambió mientras lo revisabas. Actualiza la pantalla y vuelve a intentar.' using hint = 'lote_cambio_mientras_tanto';
  end if;
  if p_queda is null or p_queda < 0 or p_queda <> round(p_queda, 3) then
    raise exception 'Lo que queda: cero o más, con hasta tres decimales.' using hint = 'ajuste_invalido';
  end if;
  if p_queda > v_saldo then
    raise exception 'Queda más de lo que dice el sistema: eso no es un ajuste de este lote, anótalo como «Saldo inicial».' using hint = 'ajuste_invalido';
  end if;
  if p_queda = v_saldo then
    raise exception 'Es lo mismo que ya dice el sistema.' using hint = 'ajuste_sin_cambio';
  end if;
  v_motivo := retail.fn_ingreso_insumo_motivo(p_motivo);
  v_falta := v_saldo - p_queda;
  insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota)
  values (l.insumo_id, l.id, l.ubicacion_id, 'merma', v_falta, l.costo_unitario, v_actor, 'Se ajustó lo que queda: ' || v_motivo);
  insert into retail.insumo_lote_cambios (insumo_lote_id, insumo_id, ubicacion_id, accion, motivo, antes, despues, hecho_por)
  values (l.id, l.insumo_id, l.ubicacion_id, 'ajustar', v_motivo, jsonb_build_object('queda', v_saldo), jsonb_build_object('queda', p_queda), v_actor);
  perform retail.fn_ingreso_insumo_anotar('insumo_lote_ajustado', 'ajustó lo que queda de un lote: ' || trim_scale(v_saldo) || ' → ' || trim_scale(p_queda), v_actor, l.ubicacion_id, l.insumo_id,
    jsonb_build_object('lote_id', l.id, 'motivo', v_motivo));
  return jsonb_build_object('lote_id', l.id, 'queda', p_queda);
end;
$$;

create or replace function retail.reemplazar_papel_provisional(p_comprobante_id uuid, p_tipo text, p_serie text, p_numero text, p_fecha_emision date, p_total numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c retail.comprobantes_produccion;
  v_actor uuid;
  v_serie text := btrim(coalesce(p_serie, ''));
  v_numero text := btrim(coalesce(p_numero, ''));
  v_total numeric;
  v_pagado numeric;
  v_documento text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede cambiar un comprobante de Producción.' using errcode = '42501';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién guarda esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  select * into c from retail.comprobantes_produccion x where x.id = p_comprobante_id for update;
  if not found or c.serie <> 'S/P' or c.estado <> 'vigente' then
    raise exception 'Solo se reemplaza un papel provisional vigente.' using hint = 'papel_no_es_provisional';
  end if;
  if p_tipo not in ('factura', 'boleta', 'nota_venta', 'recibo_por_honorarios') then
    raise exception 'Elige si es factura, boleta, nota de venta o recibo por honorarios.' using hint = 'papel_tipo_invalido';
  end if;
  if v_serie = '' or v_numero = '' or v_serie = 'S/P' then
    raise exception 'El papel necesita serie y número.' using hint = 'papel_sin_numero';
  end if;
  if p_fecha_emision is null or p_fecha_emision > retail.fn_hoy_lima() then
    raise exception 'La fecha del papel no puede ser futura.' using hint = 'papel_fecha_futura';
  end if;
  -- Las líneas no se tocan. En una factura, el IGV es lo que el papel suma sobre ellas, hasta el 18 %; sin IGV, el total es la suma de las líneas.
  v_total := case when p_tipo = 'factura' then coalesce(p_total, round(c.subtotal * 1.18, 2)) else c.subtotal end;
  if p_tipo <> 'factura' and p_total is not null and p_total <> c.subtotal then
    raise exception 'Sin IGV, el total tiene que ser S/ %.', c.subtotal using hint = 'papel_total_invalido';
  end if;
  if v_total < c.subtotal or v_total > round(c.subtotal * 1.18, 2) + 0.01 then
    raise exception 'El total de la factura va de S/ % a S/ %.', c.subtotal, round(c.subtotal * 1.18, 2) using hint = 'papel_total_invalido';
  end if;
  v_pagado := coalesce((select sum(g.monto) from retail.comprobantes_produccion_pagos g where g.comprobante_id = c.id), 0);
  if v_total < v_pagado then
    raise exception 'Ya se pagó S/ %, más que este total.', v_pagado using hint = 'papel_menor_a_lo_pagado';
  end if;
  begin
    update retail.comprobantes_produccion
       set tipo = p_tipo, serie = v_serie, numero = v_numero, fecha_emision = p_fecha_emision, igv = v_total - subtotal, total = v_total,
           nota = concat_ws(' · ', nullif(nota, ''), 'Reemplazó al papel provisional S/P-' || c.numero)
     where id = c.id;
  exception when unique_violation then
    raise exception 'El comprobante %-% de este proveedor ya está registrado.', v_serie, v_numero using hint = 'papel_repetido';
  end;
  v_documento := v_serie || '-' || v_numero;
  update retail.insumo_lotes l set documento = v_documento
   where l.comprobante_item_id in (select i.id from retail.comprobantes_produccion_items i where i.comprobante_id = c.id);
  begin
    perform retail.fn_actividad_anotar('produccion', 'comprobante_papel_reemplazado', 'reemplazó el papel provisional S/P-' || c.numero || ' por ' || v_documento,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'comprobantes_produccion', c.id::text, now(), jsonb_build_object('comprobante_id', c.id, 'tipo', p_tipo, 'total', v_total), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el papel reemplazado (%)', sqlerrm;
  end;
  return jsonb_build_object('comprobante_id', c.id, 'documento', v_documento, 'total', v_total, 'saldo', v_total - v_pagado);
end;
$$;

revoke all on function retail.asignar_proveedor_a_lote(uuid, uuid) from public, anon;
revoke all on function retail.ajustar_lote_usado(uuid, numeric, numeric, text) from public, anon;
revoke all on function retail.reemplazar_papel_provisional(uuid, text, text, text, date, numeric) from public, anon;
grant execute on function retail.asignar_proveedor_a_lote(uuid, uuid) to authenticated;
grant execute on function retail.ajustar_lote_usado(uuid, numeric, numeric, text) to authenticated;
grant execute on function retail.reemplazar_papel_provisional(uuid, text, text, text, date, numeric) to authenticated;

reset lock_timeout;
