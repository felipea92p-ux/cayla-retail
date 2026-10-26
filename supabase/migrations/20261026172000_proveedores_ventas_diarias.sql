-- Proveedores ▸ las ventas de cada proveedor, día por día (ranking de la lista, dirección «C» elegida por Felipe el 2026-10-26; ADR-0521).
--
-- POR QUÉ. El ranking de Proveedores dice cuánto se le compró a cada uno y cuánto se vendió en total, pero no si eso va subiendo o bajando: un
-- proveedor que vendió 19 prendas puede haberlas vendido todas la primera semana o venderlas ahora a buen ritmo. Cada fila del ranking lleva una
-- línea chica con lo vendido por día y «N esta semana ↑/↓» contra la anterior.
--
-- QUÉ HACE. `fn_proveedores_ventas_diarias(p_dias)` devuelve una fila por (proveedor, día) con lo vendido NETO ese día en los últimos `p_dias`
-- días (7 a 90; por defecto 28), con el día de Lima. Usa LA MISMA cuenta que «Lo que le compré» (`fn_proveedor_prendas_base`): las prendas de
-- cada proveedor son las de esa función, y lo vendido neto es salidas venta o cambio menos entradas cambio, devolución o anulación. Así la suma
-- de la línea no contradice las vendidas del ranking. El Taller (CAYLA SAC) va aparte, como en todo Proveedores. Los días sin ventas no vienen:
-- la web los rellena con cero.
--
-- Solo lectura; misma llave que el resto del ranking (`fn_ve_plata_de_proveedores()`, el módulo Proveedores). No escribe nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable. ORDEN con la web: da igual; con la web nueva y la
-- base vieja, el ranking se pinta sin la línea (no se rompe nada).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedores_ventas_diarias(p_dias integer default 28)
returns table (
  proveedor_id uuid,
  dia date,
  vendidas integer
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 28), 7), 90);
  v_desde date := (timezone('America/Lima', now()))::date - (v_dias - 1);
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'Las ventas de los proveedores necesitan Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    with pares as (
      select distinct b.proveedor_id as prov, b.producto_id as pid
      from retail.fn_proveedor_prendas_base(null) b
      where not retail.fn_proveedor_es_taller(b.proveedor_id)
    ),
    neto as (
      select v.producto_id as pid, (timezone('America/Lima', m.created_at))::date as d,
             sum(case when m.tipo = 'salida' and m.motivo in ('venta', 'cambio') then m.cantidad
                      when m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta') then -m.cantidad
                      else 0 end)::integer as uds
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
      where m.created_at >= (v_desde::timestamp at time zone 'America/Lima')
        and ((m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta')))
      group by 1, 2
    )
    select pa.prov, n.d, sum(n.uds)::integer
    from pares pa
    join neto n on n.pid = pa.pid
    group by pa.prov, n.d
    having sum(n.uds) <> 0
    order by pa.prov, n.d;
end;
$function$;

revoke all on function retail.fn_proveedores_ventas_diarias(integer) from public, anon;
grant execute on function retail.fn_proveedores_ventas_diarias(integer) to authenticated;
comment on function retail.fn_proveedores_ventas_diarias(integer) is
  'Ranking de Proveedores (2026-10-26, ADR-0521): lo vendido neto por proveedor y día de Lima en los últimos p_dias (7 a 90), con las prendas de fn_proveedor_prendas_base; sin el Taller. Solo lectura; llave: fn_ve_plata_de_proveedores().';
