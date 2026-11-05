-- ============================================================================
-- 20261105222000_pagar_servicio_de_la_orden.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 4)
-- Pagar a un servicio de afuera, con el papel que dio
--
-- EL PROBLEMA PRIMERO. Lo que se le debe a un servicio ya sale en Por pagar (actividad 3), pero pagarlo obligaba a ir a Facturas de insumos y escribir
-- la línea a mano como «Otro concepto», sin que la deuda supiera que ya se pagó. Y Felipe decidió que un servicio da «una mezcla de papeles»
-- (P-14: factura, boleta, recibo por honorarios o nada; P-17: sin factura se sigue, marcado) y que se le paga al recibir (P-15, ADR-0551 decisión 7).
--
-- LA DECISIÓN. `pagar_servicio_de_orden` arma un comprobante de una línea que apunta a la fase y llama a `registrar_comprobante_produccion`: la
-- misma puerta de siempre, así Por pagar, Finanzas, IGV y el flujo de caja lo ven sin aprender nada nuevo. Sin papel es `sin_comprobante`, con serie
-- `S/P` y un número que arma la base: no da IGV ni entra al registro de compras, y queda a la vista como no deducible.
--
-- CONTRATO (Liskov)
--   PROMETE: un comprobante de una línea con `fase_id`, al contado con su pago o a crédito con su vencimiento; la deuda de la fase baja por el monto (sin IGV).
--            Con el mismo token no se repite nada.
--   ASUME:   solo un Líder (lo exige `registrar_comprobante_produccion`), con el responsable del combo. El monto va sin IGV, como la tarifa.
--   FALLA:   `servicio_inexistente`, `servicio_sin_nombre`, `orden_cerrada` (anulada), `servicio_monto_invalido`, `servicio_monto_de_mas`.
--   NO HACE: no toca el costo de la prenda: ya salió de lo devengado. Si después se anula la factura, la deuda vuelve sola.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. `comprobantes_produccion` tiene 0 filas. Sin políticas ni `drop trigger`: ADR-0195 no aplica. Va DESPUÉS de
-- `20261105221000`. Pegar ANTES de publicar la web.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regproc('retail.pagar_servicio_de_orden') is not null,
--          position('fase_id' in pg_get_functiondef('retail.registrar_comprobante_produccion(uuid,text,text,text,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid)'::regprocedure)) > 0;  → t | t
-- CÓMO SE DESHACE: los reemplazos al revés y `drop function retail.pagar_servicio_de_orden(uuid,numeric,text,text,text,date,text,date,numeric,jsonb,text,uuid)`.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.comprobantes_produccion
  drop constraint if exists comprobantes_produccion_tipo_check,
  add constraint comprobantes_produccion_tipo_check check (tipo = any (array['factura'::text, 'boleta'::text, 'nota_venta'::text, 'sin_comprobante'::text, 'recibo_por_honorarios'::text]));

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

-- La puerta de siempre acepta los dos papeles de un servicio y guarda a qué fase va cada línea.
select pg_temp.reemplazar_anclado(
  'retail.registrar_comprobante_produccion(uuid,text,text,text,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid)',
  $v$if p_tipo not in ('factura', 'boleta', 'nota_venta') then$v$,
  $n$if p_tipo not in ('factura', 'boleta', 'nota_venta', 'recibo_por_honorarios', 'sin_comprobante') then$n$
);
select pg_temp.reemplazar_anclado(
  'retail.registrar_comprobante_produccion(uuid,text,text,text,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid)',
  $v$insert into retail.comprobantes_produccion_items (comprobante_id, insumo_id, descripcion, cantidad, costo_unitario)
    values (v_id, nullif(v_item ->> 'insumo_id', '')::uuid, nullif(btrim(coalesce(v_item ->> 'descripcion', '')), ''), (v_item ->> 'cantidad')::numeric, (v_item ->> 'costo_unitario')::numeric);$v$,
  $n$insert into retail.comprobantes_produccion_items (comprobante_id, insumo_id, descripcion, cantidad, costo_unitario, fase_id)
    values (v_id, nullif(v_item ->> 'insumo_id', '')::uuid, nullif(btrim(coalesce(v_item ->> 'descripcion', '')), ''), (v_item ->> 'cantidad')::numeric, (v_item ->> 'costo_unitario')::numeric, nullif(v_item ->> 'fase_id', '')::uuid);$n$
);

-- Impuestos: un recibo por honorarios del Taller se cuenta como el de Compras. «Sin comprobante» sigue fuera.
select pg_temp.reemplazar_anclado(
  'retail.fn_impuestos_compras(date,date)',
  $v$where p.estado = 'vigente' and p.tipo in ('factura', 'boleta')$v$,
  $n$where p.estado = 'vigente' and p.tipo in ('factura', 'boleta', 'recibo_por_honorarios')$n$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_impuestos_registro_compras(date)',
  $v$where p.estado = 'vigente' and p.tipo in ('factura', 'boleta')$v$,
  $n$where p.estado = 'vigente' and p.tipo in ('factura', 'boleta', 'recibo_por_honorarios')$n$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_impuestos_panel(date)',
  $v$from retail.compras k
       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes),$v$,
  $n$from (select c.total, c.estado, c.tipo, c.fecha_emision from retail.compras c
              union all
              select p.total, p.estado, p.tipo, p.fecha_emision from retail.comprobantes_produccion p) k
       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes),$n$
);

create or replace function retail.pagar_servicio_de_orden(
  p_fase_id uuid,
  p_monto numeric,
  p_tipo text,
  p_serie text default null,
  p_numero text default null,
  p_fecha_emision date default null,
  p_condicion text default 'contado',
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record;
  v_falta numeric;
  v_serie text := btrim(coalesce(p_serie, ''));
  v_numero text := btrim(coalesce(p_numero, ''));
  v_id uuid;
begin
  -- Un reintento con el mismo token devuelve lo ya hecho, antes de mirar cuánto falta: el pago anterior ya bajó la deuda.
  if p_token is not null then
    select c.id into v_id from retail.comprobantes_produccion c where c.token_cliente = p_token;
    if found then
      return v_id;
    end if;
  end if;

  perform 1 from retail.producciones o where o.id = (select f0.produccion_id from retail.produccion_fases f0 where f0.id = p_fase_id) for update;
  select f.id, f.clave, f.quien, f.proveedor_id, p.estado, p.numero, pr.referencia into v_f
    from retail.produccion_fases f
    join retail.producciones p on p.id = f.produccion_id
    join retail.productos pr on pr.id = p.producto_id
   where f.id = p_fase_id;
  if v_f.id is null or v_f.quien is distinct from 'servicio' then
    raise exception 'Ese servicio no existe' using hint = 'servicio_inexistente';
  end if;
  if v_f.estado = 'anulada' then
    raise exception 'La orden está anulada' using hint = 'orden_cerrada';
  end if;
  if v_f.proveedor_id is null then
    raise exception 'Primero registra quién hizo % en la orden.', lower(retail.fn_fase_nombre(v_f.clave)) using hint = 'servicio_sin_nombre';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'El monto tiene que ser mayor a cero y con hasta dos decimales.' using hint = 'servicio_monto_invalido';
  end if;

  v_falta := coalesce((select s.falta from retail.fn_servicios_por_pagar() s where s.fase_id = p_fase_id), 0);
  if p_monto > v_falta then
    raise exception 'A este servicio se le debe S/ % sin IGV: no se puede registrar S/ %.', v_falta, p_monto using hint = 'servicio_monto_de_mas';
  end if;

  if p_tipo = 'sin_comprobante' then
    v_serie := 'S/P';
    -- Un número que nadie escribe: la orden, el paso y cuántos pagos sin papel lleva ese paso.
    v_numero := retail.fn_produccion_numero_texto(v_f.numero) || '-' || v_f.clave || '-' || (
      (select count(*) from retail.comprobantes_produccion_items i join retail.comprobantes_produccion c on c.id = i.comprobante_id
        where i.fase_id = p_fase_id and c.tipo = 'sin_comprobante') + 1);
  end if;

  return retail.registrar_comprobante_produccion(
    p_proveedor_id => v_f.proveedor_id,
    p_serie => v_serie,
    p_numero => v_numero,
    p_condicion => p_condicion,
    p_items => jsonb_build_array(jsonb_build_object(
      'descripcion', retail.fn_fase_nombre(v_f.clave) || ' · ' || retail.fn_produccion_numero_texto(v_f.numero) || ' · ' || v_f.referencia,
      'cantidad', 1,
      'costo_unitario', p_monto,
      'fase_id', p_fase_id)),
    p_tipo => p_tipo,
    p_fecha_emision => p_fecha_emision,
    p_fecha_vencimiento => p_fecha_vencimiento,
    p_igv_porcentaje => p_igv_porcentaje,
    p_pago => p_pago,
    p_nota => p_nota,
    p_token => p_token
  );
end;
$$;

revoke all on function retail.pagar_servicio_de_orden(uuid, numeric, text, text, text, date, text, date, numeric, jsonb, text, uuid) from public, anon;
grant execute on function retail.pagar_servicio_de_orden(uuid, numeric, text, text, text, date, text, date, numeric, jsonb, text, uuid) to authenticated;

reset lock_timeout;
