-- ============================================================================
-- 20260923180400_compras_mi_parte.sql — CAYLA V2 · ADR-0179 (F3-b: la parte de una tienda que NO gestiona la factura)
--
-- EL PROBLEMA PRIMERO. Arequipa registra una factura que trae mercadería para Arequipa y Trujillo. Por la regla de lectura
-- (20260923180200) Trujillo no ve esa factura: si la viera, vería el total, el saldo y los pagos de Arequipa. Pero Felipe
-- (2026-09-23): «cada una registra el pago y recibe lo que le corresponde». Trujillo tiene que VER su parte para pagarla, y
-- enterarse de que le llegó.
--
-- POR QUÉ NO SE ABRE LA TABLA. Una política de fila no puede esconder COLUMNAS: abrirle a Trujillo la fila de `compras`
-- (aunque solo fuera por las líneas que van a Trujillo) le daría `total`, `pagado` y `saldo` de la factura entera por la API,
-- aunque la pantalla no los pinte. Así que las tablas siguen cerradas y la parte sale de dos funciones que solo devuelven lo de
-- las tiendas de quien consulta:
--   · `fn_mis_partes_de_compras()`: una fila por (factura ajena, tienda mía con parte): proveedor, documento, fechas, quién la
--     gestiona, MIS unidades, MI total, lo que pagó MI tienda, MI saldo (`fn_saldo_de_tienda`) y si es «parte nueva» (registrada
--     hace 7 días o menos y sin ningún pago de mi tienda: el aviso a la tienda que no la registró).
--   · `fn_mi_parte_de_compra(compra)`: el detalle de una: cabecera sin montos de la factura, mis partes, MIS líneas (solo mis
--     unidades) y los pagos de MIS tiendas. Falla si quien consulta no tiene parte.
-- Pagar esa parte ya se puede (20260923180300: `p_ubicacion_id` con la tienda). Recibirla, como siempre, por Recibir.
--
-- PARA PEGAR EN PRODUCCIÓN: después de 20260923180000 … 180300. Trae `set search_path`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_saldo_de_tienda(uuid,uuid)') is null or to_regclass('retail.compra_parte_por_tienda') is null then
    raise exception 'Faltan 20260923180100 y 20260923180300 (parte por tienda y pagar por tienda)';
  end if;
end $$;

-- ==================== 1. la lista: mis partes en facturas que gestiona otra tienda ====================
create or replace function retail.fn_mis_partes_de_compras()
returns table (
  compra_id uuid,
  documento text,
  tipo text,
  proveedor_id uuid,
  proveedor_nombre text,
  fecha_emision date,
  fecha_vencimiento date,
  estado text,
  gestora_id uuid,
  gestora_nombre text,
  ubicacion_id uuid,
  ubicacion_nombre text,
  unidades integer,
  total numeric,
  pagado numeric,
  saldo numeric,
  registrada_en timestamptz,
  parte_nueva boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with mias as (select unnest(retail.fn_compras_ubicaciones()) as id)
  select c.id,
         c.documento,
         c.tipo,
         c.proveedor_id,
         pr.nombre,
         c.fecha_emision,
         c.fecha_vencimiento,
         c.estado,
         c.ubicacion_gestion_id,
         g.nombre,
         pt.ubicacion_id,
         u.nombre,
         pt.unidades,
         pt.total,
         coalesce(pg.pagado, 0)::numeric(12, 2),
         retail.fn_saldo_de_tienda(c.id, pt.ubicacion_id),
         c.created_at,
         (c.estado = 'vigente' and coalesce(pg.pagado, 0) = 0 and c.created_at >= now() - interval '7 days')
    from retail.compra_parte_por_tienda pt
    join mias m on m.id = pt.ubicacion_id
    join retail.compras c on c.id = pt.compra_id
    join retail.proveedores pr on pr.id = c.proveedor_id
    join retail.ubicaciones u on u.id = pt.ubicacion_id
    left join retail.ubicaciones g on g.id = c.ubicacion_gestion_id
    left join lateral (
      select sum(x.monto) as pagado from retail.compra_pagos x where x.compra_id = c.id and x.ubicacion_id = pt.ubicacion_id
    ) pg on true
   where not retail.fn_es_lider()
     -- Solo las AJENAS: las que gestiona una tienda mía ya las veo enteras.
     and (c.ubicacion_gestion_id is null or not (c.ubicacion_gestion_id = any(retail.fn_compras_ubicaciones())))
   order by c.fecha_emision desc, c.created_at desc, c.id;
$$;

comment on function retail.fn_mis_partes_de_compras() is
  'ADR-0179 (F3-b). Mis partes en facturas que gestiona OTRA tienda: una fila por factura y tienda mía con parte, con MI total, lo que pagó MI tienda y MI saldo; nunca el total ni el saldo de la factura. parte_nueva = vigente, sin pagos de mi tienda y registrada hace 7 días o menos. Vacía para el líder (ve todo entero).';

-- ==================== 2. el detalle de una parte ====================
create or replace function retail.fn_mi_parte_de_compra(p_compra_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_mias uuid[] := retail.fn_compras_ubicaciones();
  v jsonb;
begin
  if not exists (select 1 from retail.compra_parte_por_tienda pt where pt.compra_id = p_compra_id and pt.ubicacion_id = any(v_mias)) then
    raise exception 'Ninguna de tus tiendas tiene parte en ese comprobante' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'compra', (
      select jsonb_build_object(
        'id', c.id, 'documento', c.documento, 'tipo', c.tipo, 'serie', c.serie, 'numero', c.numero,
        'fecha_emision', c.fecha_emision, 'fecha_vencimiento', c.fecha_vencimiento, 'condicion', c.condicion, 'estado', c.estado,
        'proveedor_id', c.proveedor_id, 'proveedor_nombre', pr.nombre,
        'gestora_id', c.ubicacion_gestion_id, 'gestora_nombre', g.nombre, 'registrada_en', c.created_at)
      from retail.compras c
      join retail.proveedores pr on pr.id = c.proveedor_id
      left join retail.ubicaciones g on g.id = c.ubicacion_gestion_id
      where c.id = p_compra_id),
    'partes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ubicacion_id', pt.ubicacion_id, 'ubicacion_nombre', u.nombre, 'unidades', pt.unidades,
        'subtotal', pt.subtotal, 'igv', pt.igv, 'total', pt.total,
        'pagado', coalesce((select sum(x.monto) from retail.compra_pagos x where x.compra_id = p_compra_id and x.ubicacion_id = pt.ubicacion_id), 0),
        'saldo', retail.fn_saldo_de_tienda(p_compra_id, pt.ubicacion_id)) order by u.nombre)
      from retail.compra_parte_por_tienda pt
      join retail.ubicaciones u on u.id = pt.ubicacion_id
      where pt.compra_id = p_compra_id and pt.ubicacion_id = any(v_mias)), '[]'),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ubicacion_id', d.ubicacion_id, 'producto_id', i.producto_id, 'referencia', p.referencia,
        'variante_id', i.variante_id, 'sku', va.sku, 'talla', t.valor, 'color', co.nombre, 'descripcion', i.descripcion,
        'costo_unitario', i.costo_unitario, 'cantidad', d.cantidad,
        'subtotal', round(i.costo_unitario * d.cantidad, 2)) order by p.referencia, t.valor, co.nombre)
      from retail.compra_items i
      join retail.compra_item_destinos d on d.compra_item_id = i.id and d.ubicacion_id = any(v_mias)
      left join retail.productos p on p.id = i.producto_id
      left join retail.variantes va on va.id = i.variante_id
      left join retail.tallas t on t.id = va.talla_id
      left join retail.colores co on co.codigo = va.color_codigo
      where i.compra_id = p_compra_id), '[]'),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'fecha', x.fecha, 'monto', x.monto, 'metodo', x.metodo, 'referencia', x.referencia, 'ubicacion_id', x.ubicacion_id)
        order by x.fecha, x.created_at)
      from retail.compra_pagos x
      where x.compra_id = p_compra_id and x.ubicacion_id = any(v_mias)), '[]')
  ) into v;
  return v;
end;
$$;

comment on function retail.fn_mi_parte_de_compra(uuid) is
  'ADR-0179 (F3-b). El detalle de MI parte en una factura: cabecera sin montos de la factura, mis partes (total, pagado, saldo), mis líneas con solo mis unidades y los pagos de mis tiendas. Falla si ninguna de mis tiendas tiene parte.';

revoke all on function retail.fn_mis_partes_de_compras() from public, anon;
revoke all on function retail.fn_mi_parte_de_compra(uuid) from public, anon;
grant execute on function retail.fn_mis_partes_de_compras() to authenticated;
grant execute on function retail.fn_mi_parte_de_compra(uuid) to authenticated;
