-- ============================================================================
-- ADR-0111 (corrección 2026-09-18) — lecturas del saldo a favor de los proveedores.
--
--   · `fn_proveedores()`           +saldo_favor: una columna en la lista de Proveedores.
--   · `fn_proveedores_resumen()`   +saldo_favor_total, +con_saldo_favor: la banda de arriba.
--   · `fn_proveedor_creditos(uuid)` el historial del saldo a favor de UN proveedor (la ficha):
--                                   cada nota que dejó saldo, cada vez que se usó y cada reembolso.
--
-- El saldo sale de `fn_saldo_favor_proveedor` (suma del libro `proveedor_creditos`), solo para
-- líder; un integrante lo ve vacío, como el resto de las cifras de dinero de Proveedores.
-- ============================================================================

set search_path = retail, public, extensions;

drop function retail.fn_proveedores_resumen();
drop function retail.fn_proveedores();

CREATE FUNCTION retail.fn_proveedores()
 RETURNS TABLE(id uuid, nombre text, ruc text, contacto text, telefono text, banco text, cuenta_bancaria text, activo boolean, facturas bigint, total_facturado numeric, saldo numeric, ultima_compra date, facturas_vencidas bigint, facturas_recibidas_completas bigint, facturas_con_recepcion_pendiente bigint, facturas_atrasadas bigint, rubro text, plazo_credito_dias integer, forma_pago_preferida text, facturado_12m numeric, saldo_vencido numeric, dias_desde_ultima_compra integer, entregas_por_recibir bigint, saldo_favor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
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
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')) end as entregas_por_recibir,
         case when fn_es_lider() then retail.fn_saldo_favor_proveedor(p.id) end as saldo_favor
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida
  order by p.activo desc, p.nombre;
$function$;

comment on function retail.fn_proveedores() is
  'Lista de proveedores con sus cifras de compras (solo líder ve el dinero) y su saldo a favor (ADR-0111).';

revoke all on function retail.fn_proveedores() from public, anon;
grant execute on function retail.fn_proveedores() to authenticated;

CREATE FUNCTION retail.fn_proveedores_resumen()
 RETURNS TABLE(activos integer, desactivados integer, deuda_total numeric, con_saldo integer, con_vencidas integer, top_proveedor_id uuid, top_proveedor_nombre text, top_pct numeric, top3_pct numeric, sin_compras_90d integer, saldo_favor_total numeric, con_saldo_favor integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
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
    case when fn_es_lider() then (select count(*) from b where b.activo and coalesce(b.dias_desde_ultima_compra, 100000) > 90)::integer end,
    case when fn_es_lider() then (select coalesce(sum(b.saldo_favor), 0) from b) end,
    case when fn_es_lider() then (select count(*) from b where b.saldo_favor > 0)::integer end
  where retail.fn_tiene_acceso_retail();
$function$;

revoke all on function retail.fn_proveedores_resumen() from public, anon;
grant execute on function retail.fn_proveedores_resumen() to authenticated;

-- ==================== el historial de UN proveedor ====================
create function retail.fn_proveedor_creditos(p_proveedor_id uuid, p_limite integer default 100)
returns table (
  id uuid,
  tipo text,
  monto numeric,
  fecha date,
  documento text,          -- comprobante de origen (nota) o de destino (aplicación)
  nota_serie_numero text,  -- la nota de crédito que originó el saldo
  metodo text,             -- reembolso: cómo devolvió el dinero
  referencia text,
  nota text,
  registrado_por uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select k.id, k.tipo, k.monto, k.fecha, c.documento, n.serie_numero, k.metodo, k.referencia, k.nota, k.usuario_id, k.created_at
  from retail.proveedor_creditos k
  left join retail.compras c on c.id = k.compra_id
  left join retail.compra_notas_credito n on n.id = k.nota_credito_id
  where k.proveedor_id = p_proveedor_id
    and retail.fn_puede_registrar_compras()
  order by k.created_at desc, k.id
  limit greatest(coalesce(p_limite, 100), 1);
$$;

comment on function retail.fn_proveedor_creditos(uuid, integer) is
  'Historial del saldo a favor de un proveedor (ADR-0111): notas que dejaron saldo, usos como medio de pago y reembolsos, del más reciente al más antiguo. Solo quien registra compras.';

revoke all on function retail.fn_proveedor_creditos(uuid, integer) from public, anon;
grant execute on function retail.fn_proveedor_creditos(uuid, integer) to authenticated;
