-- Proveedores ▸ las tallas que se llevan y cómo le va en cada sede (ADR-0502, actualización 2026-10-26 (e)).
--
-- POR QUÉ. La ficha dice cuánto se le compró a un proveedor y cuánto se vendió, pero no QUÉ tallas se llevan (para pedirle mejor repartido,
-- no solo menos) ni EN QUÉ SEDE se vende (lo que en Trujillo tarda una temporada, en Lima puede agotarse en un mes). Las dos cosas ya están en
-- la base: la talla vive en la variante y cada venta, devolución y traslado deja su sede en `movimientos`.
--
-- QUÉ HACE. `fn_proveedor_tallas_sedes(p_proveedor_id)` devuelve una fila por (prenda, talla, sede) con lo vendido neto en esa sede, lo que hay
-- hoy en ella y el día en que le llegó por primera vez. Las prendas son las mismas que cuenta «Lo que le compré» (`fn_proveedor_prendas_base`):
-- así la ficha no se contradice. El vendido neto es la misma cuenta que esa función (salidas venta o cambio menos entradas cambio, devolución o
-- anulación), pero por la sede del movimiento. Las cuentas (la curva, el ritmo por sede y el traslado sugerido) las hace la web con reglas puras
-- y probadas: `apps/web/lib/proveedor-tallas-sedes-reglas.ts`.
--
-- Solo lectura; misma llave que el resto de la ficha (`fn_ve_plata_de_proveedores()`, el módulo Proveedores). No mueve nada: el traslado que
-- sugiere la ficha lo hace una persona en Traslados.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable. ORDEN con la web: la base ANTES que la web; con la
-- web nueva y la base vieja, la ficha se pinta sin estas dos secciones (no se rompe nada).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedor_tallas_sedes(p_proveedor_id uuid)
returns table (
  producto_id uuid,
  referencia text,
  categoria text,
  talla text,
  ubicacion_id uuid,
  sede text,
  sede_tipo text,
  vendidas integer,
  stock integer,
  primera_llegada date
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'Las tallas y las sedes de un proveedor necesitan Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  return query
    with prendas as (
      select distinct b.producto_id as pid from retail.fn_proveedor_prendas_base(p_proveedor_id) b
    ),
    vars as (
      select v.id as vid, v.producto_id as pid, coalesce(t.valor, 'Única') as talla
      from retail.variantes v
      join prendas p on p.pid = v.producto_id
      left join retail.tallas t on t.id = v.talla_id
    ),
    mov as (
      select m.variante_id as vid, m.ubicacion_id as uid,
             sum(case when m.tipo = 'salida' and m.motivo in ('venta', 'cambio') then m.cantidad
                      when m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta') then -m.cantidad
                      else 0 end)::integer as vendidas,
             -- La primera vez que esa prenda llegó a la sede (compra, carga o traslado): desde ahí se cuenta su ritmo EN esa sede.
             min(m.created_at::date) filter (where m.tipo = 'entrada' and m.motivo not in ('cambio', 'devolucion', 'anulacion_venta')) as llegada
      from retail.movimientos m
      join vars on vars.vid = m.variante_id
      where m.ubicacion_id is not null
      group by m.variante_id, m.ubicacion_id
    ),
    st as (
      select s.variante_id as vid, s.ubicacion_id as uid, sum(s.cantidad)::integer as uds
      from retail.stock s
      join vars on vars.vid = s.variante_id
      group by s.variante_id, s.ubicacion_id
    ),
    celdas as (
      select coalesce(mov.vid, st.vid) as vid, coalesce(mov.uid, st.uid) as uid,
             coalesce(mov.vendidas, 0) as vendidas, coalesce(st.uds, 0) as stock, mov.llegada
      from mov full join st on st.vid = mov.vid and st.uid = mov.uid
    )
    select pr.id, pr.referencia, ca.nombre, vars.talla, u.id, u.nombre, u.tipo,
           greatest(sum(c.vendidas), 0)::integer, sum(c.stock)::integer, min(c.llegada)
    from celdas c
    join vars on vars.vid = c.vid
    join retail.productos pr on pr.id = vars.pid
    left join retail.categorias ca on ca.id = pr.categoria_id
    join retail.ubicaciones u on u.id = c.uid
    group by pr.id, pr.referencia, ca.nombre, vars.talla, u.id, u.nombre, u.tipo
    having sum(c.vendidas) <> 0 or sum(c.stock) <> 0
    order by pr.referencia, u.nombre, vars.talla;
end;
$function$;

revoke all on function retail.fn_proveedor_tallas_sedes(uuid) from public, anon;
grant execute on function retail.fn_proveedor_tallas_sedes(uuid) to authenticated;
comment on function retail.fn_proveedor_tallas_sedes(uuid) is
  'Ficha de proveedor (2026-10-26 e): por (prenda, talla, sede), lo vendido neto en esa sede, lo que hay hoy y el día en que llegó por primera vez. Mismas prendas que fn_proveedor_prendas. Solo lectura; llave: fn_ve_plata_de_proveedores().';

select 'QUEDÓ BIEN' as resultado
where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_proveedor_tallas_sedes');
