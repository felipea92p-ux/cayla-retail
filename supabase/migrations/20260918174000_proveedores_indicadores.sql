-- ============================================================================
-- Proveedores: indicadores para decidir a quién se le compra y a quién se le debe
-- (ADR-0106, maquetas 08 y 09)
--
-- EL PROBLEMA. La lista de proveedores decía cuánto se facturó «desde siempre» y, a los seis
-- meses de datos, importa más lo reciente. No decía qué proveedores concentran la deuda ni
-- cuáles llevan meses sin comprar (candidatos a desactivar). Y la ficha mostraba cifras sueltas
-- sin la que más pesa al negociar: cuánto tardan en entregar, cuánto pagamos en realidad frente
-- al plazo pactado, y cómo cambia lo que cobran por la misma prenda.
--
-- LO QUE SE AGREGA (solo lectura; nada de esto cambia datos):
--   · fn_proveedores(): 4 columnas AL FINAL (facturado_12m, saldo_vencido, dias_desde_ultima_compra,
--     entregas_por_recibir). Las 19 anteriores no cambian de nombre ni de tipo: la app actual las
--     lee por nombre.
--   · fn_proveedores_resumen(): las cuatro cifras de la cabecera de la lista.
--   · fn_proveedor_metricas_compras(): las 8 columnas de siempre + 7 nuevas (12 meses, monto vencido,
--     % entregado completo, días de entrega y de pago real CON su muestra).
--   · fn_proveedor_costo_evolucion(): qué cobra ESTE proveedor por la prenda que más se le compra,
--     compra a compra (de `compra_items`, no de `costo_historial`: ése mezcla proveedores).
--   · fn_proveedor_devoluciones(): unidades devueltas al proveedor (ADR-0094).
--
-- HONESTIDAD CON POCOS DATOS. Un promedio de una sola entrega no es una tendencia: cada promedio
-- sale con su muestra, y `dias_pago_real_promedio` es NULL con menos de 2 comprobantes pagados por
-- completo — la pantalla dice «se calcula con 2 o más» en lugar de mostrar un número engañoso.
--
-- «Hoy» es fn_hoy_lima() (20260918160000), nunca current_date. Lo financiero es solo de líder
-- (NULL si no lo es), igual que hoy; `saldo` ya descuenta notas de crédito (D2) porque sale del
-- snapshot de `compras`.
--
-- Trampa conocida (ADR-0094): en plpgsql con RETURNS TABLE los nombres de salida chocan con
-- columnas de tablas. Todo va calificado con alias.
-- ============================================================================
set search_path = retail, public, extensions;

-- ==================== 1. fn_proveedores: 4 columnas al final ====================
drop function retail.fn_proveedores();
create function retail.fn_proveedores()
returns table(
  id uuid, nombre text, ruc text, contacto text, telefono text, banco text, cuenta_bancaria text, activo boolean,
  facturas bigint, total_facturado numeric, saldo numeric, ultima_compra date, facturas_vencidas bigint,
  facturas_recibidas_completas bigint, facturas_con_recepcion_pendiente bigint, facturas_atrasadas bigint,
  rubro text, plazo_credito_dias integer, forma_pago_preferida text,
  facturado_12m numeric, saldo_vencido numeric, dias_desde_ultima_compra integer, entregas_por_recibir bigint
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada') end as facturas,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0) end as total_facturado,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) end as saldo,
         case when fn_es_lider() then max(c.fecha_emision) filter (where c.estado <> 'anulada') end as ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < fn_hoy_lima()) end as facturas_vencidas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida') end as facturas_recibidas_completas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')) end as facturas_con_recepcion_pendiente,
         case when fn_es_lider() then count(c.id) filter (
           where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
             and fn_hoy_lima() > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)
         ) end as facturas_atrasadas,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada' and c.fecha_emision > fn_hoy_lima() - 365), 0) end as facturado_12m,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < fn_hoy_lima()), 0) end as saldo_vencido,
         case when fn_es_lider() then (fn_hoy_lima() - max(c.fecha_emision) filter (where c.estado <> 'anulada'))::integer end as dias_desde_ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')) end as entregas_por_recibir
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$$;
revoke all on function retail.fn_proveedores() from public, anon;
grant execute on function retail.fn_proveedores() to authenticated;

-- ==================== 2. fn_proveedores_resumen: la cabecera de la lista ====================
-- Sale de la propia fn_proveedores() (mismo candado de sede, mismo «NULL si no es líder»): una sola
-- fuente de verdad para lo que cuenta cada proveedor. Concentración = qué parte de TODA la deuda
-- está en un proveedor: dónde negociar plazos.
create function retail.fn_proveedores_resumen()
returns table(
  activos integer, desactivados integer, deuda_total numeric, con_saldo integer, con_vencidas integer,
  top_proveedor_id uuid, top_proveedor_nombre text, top_pct numeric, top3_pct numeric, sin_compras_90d integer
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  with b as (select * from retail.fn_proveedores()),
  t as (select sum(b.saldo) as total from b),
  orden as (select b.id, b.nombre, b.saldo from b order by b.saldo desc nulls last, b.nombre limit 3)
  select
    (select count(*) from b where b.activo)::integer,
    (select count(*) from b where not b.activo)::integer,
    case when fn_es_lider() then (select t.total from t) end,
    case when fn_es_lider() then (select count(*) from b where b.saldo > 0)::integer end,
    case when fn_es_lider() then (select count(*) from b where b.facturas_vencidas > 0)::integer end,
    case when fn_es_lider() and (select t.total from t) > 0 then (select o.id from orden o order by o.saldo desc nulls last limit 1) end,
    case when fn_es_lider() and (select t.total from t) > 0 then (select o.nombre from orden o order by o.saldo desc nulls last limit 1) end,
    case when fn_es_lider() and (select t.total from t) > 0 then round(100 * (select max(b.saldo) from b) / (select t.total from t), 1) end,
    case when fn_es_lider() and (select t.total from t) > 0 then round(100 * (select sum(o.saldo) from orden o) / (select t.total from t), 1) end,
    case when fn_es_lider() then (select count(*) from b where b.activo and coalesce(b.dias_desde_ultima_compra, 100000) > 90)::integer end
  where retail.fn_tiene_acceso_retail();
$$;
revoke all on function retail.fn_proveedores_resumen() from public, anon;
grant execute on function retail.fn_proveedores_resumen() to authenticated;

-- ==================== 3. métricas de la ficha ====================
drop function retail.fn_proveedor_metricas_compras(uuid);
create function retail.fn_proveedor_metricas_compras(p_proveedor_id uuid)
returns table(
  facturas_vigentes bigint, total_facturado numeric, saldo numeric, ultima_compra date, facturas_vencidas bigint,
  facturas_recibidas_completas bigint, facturas_con_recepcion_pendiente bigint, facturas_atrasadas bigint,
  facturado_12m numeric, monto_vencido numeric, entregado_completo_pct numeric,
  dias_entrega_promedio numeric, dias_entrega_muestra integer,
  dias_pago_real_promedio numeric, dias_pago_muestra integer
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las métricas de un proveedor.';
  end if;
  return query
    with cs as (
      select c2.* from retail.compras c2
      where c2.proveedor_id = p_proveedor_id and fn_puede_operar_ubicacion(c2.ubicacion_destino_id)
    ),
    -- Días entre la emisión y la llegada de cada guía (misma definición que resumen_recepciones()).
    ent as (
      select c3.id as compra_id,
             greatest(0, (l.fecha_recepcion at time zone 'America/Lima')::date - c3.fecha_emision) as dias
      from cs c3
      join retail.compra_items ci on ci.compra_id = c3.id
      join retail.movimientos m on m.compra_item_id = ci.id
      join retail.lotes l on l.id = m.lote_id
      where c3.estado <> 'anulada'
      group by c3.id, c3.fecha_emision, l.id, l.fecha_recepcion
    ),
    -- Días entre la emisión y el ÚLTIMO pago, de lo pagado por completo a crédito: el plazo real.
    pago as (
      select c4.id as compra_id, (max(pg.fecha) - c4.fecha_emision) as dias
      from cs c4
      join retail.compra_pagos pg on pg.compra_id = c4.id
      where c4.estado = 'vigente' and c4.condicion = 'credito' and c4.estado_pago = 'pagada'
      group by c4.id, c4.fecha_emision
    )
    select
      count(*) filter (where cs.estado <> 'anulada'),
      coalesce(sum(cs.total) filter (where cs.estado <> 'anulada'), 0),
      coalesce(sum(cs.saldo) filter (where cs.estado <> 'anulada'), 0),
      max(cs.fecha_emision) filter (where cs.estado <> 'anulada'),
      count(*) filter (where cs.estado = 'vigente' and cs.saldo > 0 and cs.fecha_vencimiento < fn_hoy_lima()),
      count(*) filter (where cs.estado <> 'anulada' and cs.estado_recepcion = 'recibida'),
      count(*) filter (where cs.estado <> 'anulada' and cs.estado_recepcion in ('parcial', 'sin_recibir')),
      count(*) filter (
        where cs.estado = 'vigente' and cs.estado_recepcion in ('sin_recibir', 'parcial')
          and fn_hoy_lima() > coalesce(cs.fecha_estimada_llegada, cs.fecha_emision + 7)
      ),
      coalesce(sum(cs.total) filter (where cs.estado <> 'anulada' and cs.fecha_emision > fn_hoy_lima() - 365), 0),
      coalesce(sum(cs.saldo) filter (where cs.estado = 'vigente' and cs.saldo > 0 and cs.fecha_vencimiento < fn_hoy_lima()), 0),
      round(100.0 * count(*) filter (where cs.estado <> 'anulada' and cs.estado_recepcion = 'recibida')
            / nullif(count(*) filter (where cs.estado <> 'anulada'), 0)),
      (select round(avg(e.dias), 1) from ent e),
      (select count(distinct e.compra_id)::integer from ent e),
      (select case when count(*) >= 2 then round(avg(pa.dias), 1) end from pago pa),
      (select count(*)::integer from pago pa)
    from cs;
end;
$$;
revoke all on function retail.fn_proveedor_metricas_compras(uuid) from public, anon;
grant execute on function retail.fn_proveedor_metricas_compras(uuid) to authenticated;

-- ==================== 4. evolución del costo ====================
-- La prenda (producto) que más veces se le compró a este proveedor, con lo que cobró en cada
-- comprobante (costo promedio ponderado por cantidad de las líneas de ese producto), de la más
-- antigua a la más reciente. Es el dato para pactar el precio del próximo pedido.
create function retail.fn_proveedor_costo_evolucion(p_proveedor_id uuid, p_limite integer default 6)
returns table(producto_id uuid, referencia text, compra_id uuid, documento text, fecha date, costo_unitario numeric)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la evolución del costo de un proveedor.';
  end if;
  return query
    with top as (
      select ci.producto_id as pid
      from retail.compra_items ci
      join retail.compras c on c.id = ci.compra_id
      where c.proveedor_id = p_proveedor_id and c.estado = 'vigente' and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
      group by ci.producto_id
      order by count(distinct ci.compra_id) desc, max(c.fecha_emision) desc
      limit 1
    ),
    serie as (
      select ci.producto_id as pid, pr.referencia as ref, c.id as cid, c.documento as doc, c.fecha_emision as f,
             round(sum(ci.cantidad * ci.costo_unitario) / nullif(sum(ci.cantidad), 0), 2) as costo
      from retail.compra_items ci
      join retail.compras c on c.id = ci.compra_id
      join retail.productos pr on pr.id = ci.producto_id
      where c.proveedor_id = p_proveedor_id and c.estado = 'vigente'
        and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
        and ci.producto_id = (select t.pid from top t)
      group by ci.producto_id, pr.referencia, c.id, c.documento, c.fecha_emision
      order by c.fecha_emision desc, c.created_at desc
      limit greatest(p_limite, 1)
    )
    select s.pid, s.ref, s.cid, s.doc, s.f, s.costo from serie s order by s.f asc;
end;
$$;
revoke all on function retail.fn_proveedor_costo_evolucion(uuid, integer) from public, anon;
grant execute on function retail.fn_proveedor_costo_evolucion(uuid, integer) to authenticated;

-- ==================== 5. devoluciones al proveedor ====================
create function retail.fn_proveedor_devoluciones(p_proveedor_id uuid)
returns table(unidades bigint, ultima date)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver las devoluciones a un proveedor.';
  end if;
  return query
    select coalesce(sum(pd.cantidad), 0)::bigint,
           max((pd.created_at at time zone 'America/Lima')::date)
    from retail.prendas_danadas pd
    where pd.proveedor_id = p_proveedor_id and pd.estado = 'devuelta_proveedor';
end;
$$;
revoke all on function retail.fn_proveedor_devoluciones(uuid) from public, anon;
grant execute on function retail.fn_proveedor_devoluciones(uuid) to authenticated;
