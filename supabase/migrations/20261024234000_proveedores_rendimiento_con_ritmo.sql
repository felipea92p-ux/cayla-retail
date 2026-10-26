-- Proveedores ▸ el ranking usa el MISMO ritmo que el aviso de «frenar» (ADR-0502, actualización 2026-10-24 (d)).
--
-- POR QUÉ. El veredicto de una palabra del ranking le ponía «Pocas ventas» a Lasak Store (6 vendidas de 183) mientras el aviso de la lista le
-- decía que frenara (vender lo que le queda tardaría unas 99 semanas): dos reglas distintas para lo mismo. El veredicto necesita lo que mide el
-- ritmo —desde cuándo llegó la mercadería y cuántas unidades siguen en estantes—, y `fn_proveedores_rendimiento` no lo devolvía.
--
-- QUÉ CAMBIA. `fn_proveedores_rendimiento` suma dos columnas al final: `primera_entrada` (la primera entrada de lo que se le compró) y
-- `unidades_en_estantes` (lo que queda, sin pasar de lo comprado). Todo lo demás queda igual. Solo lectura; misma llave.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable. ORDEN con la web: la base ANTES que la web; con la
-- web nueva y la base vieja, el veredicto no puede medir el ritmo y cae a lo de siempre (no se rompe nada).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

drop function if exists retail.fn_proveedores_rendimiento();

create or replace function retail.fn_proveedores_rendimiento()
returns table (
  proveedor_id uuid,
  nombre text,
  es_taller boolean,
  prendas integer,
  unidades_compradas integer,
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
  unidades_vendidas integer,
  ingreso_vendido numeric,
  costo_vendido numeric,
  plata_en_stock numeric,
  prendas_sin_venta integer,
  plata_sin_venta numeric,
  primera_entrada date,
  unidades_en_estantes integer
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'El rendimiento de los proveedores necesita Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    select pv.id, pv.nombre, retail.fn_proveedor_es_taller(pv.id),
           count(*)::integer,
           sum(b.unidades_compradas)::integer,
           sum(b.unidades_compras)::integer,
           sum(b.unidades_sin_factura)::integer,
           sum(b.unidades_carga)::integer,
           sum(b.unidades_estimadas)::integer,
           round(sum(b.gasto), 2),
           round(sum(b.gasto_compras), 2),
           round(sum(b.gasto_carga), 2),
           sum(b.unidades_vendidas)::integer,
           round(sum(b.ingreso_vendido), 2),
           round(sum(b.costo_vendido), 2),
           round(sum(least(b.stock_actual, b.unidades_compradas) * (b.gasto / nullif(b.unidades_compradas, 0))), 2),
           (count(*) filter (where b.unidades_vendidas = 0))::integer,
           round(coalesce(sum(least(b.stock_actual, b.unidades_compras) * (b.gasto_compras / nullif(b.unidades_compras, 0))) filter (where b.unidades_vendidas = 0), 0), 2),
           min(b.primera_entrada),
           sum(least(b.stock_actual, b.unidades_compradas))::integer
    from retail.fn_proveedor_prendas_base(null) b
    join retail.proveedores pv on pv.id = b.proveedor_id
    group by pv.id, pv.nombre
    order by sum(b.gasto) desc nulls last, pv.nombre;
end;
$function$;

revoke all on function retail.fn_proveedores_rendimiento() from public, anon;
grant execute on function retail.fn_proveedores_rendimiento() to authenticated;
comment on function retail.fn_proveedores_rendimiento() is
  'Lista de proveedores (2026-10-24 d): por proveedor, gasto por origen (Compras / Carga inicial), vendido neto, plata en estantes, plata sin vender (solo origen Compras), la primera entrada y las unidades en estantes (para el ritmo). La misma cuenta que fn_proveedor_prendas. Solo lectura; llave: fn_ve_plata_de_proveedores().';
