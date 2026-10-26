-- Proveedores ▸ las ventas y el stock de una prenda que trajeron VARIOS proveedores se reparten entre ellos (ADR-0521, actualización 2026-10-26 (c)).
--
-- POR QUÉ. `fn_proveedor_prendas_base` (20261024231000, en producción) cruzaba lo vendido, lo vendido neto y el stock con cada proveedor SOLO por
-- la prenda: una prenda que llegó por la carga inicial de su proveedor habitual y después por una compra a otro le sumaba sus ventas ENTERAS a los
-- dos. En la base local, una prenda que vendió 4 figuraba con 4 en tres proveedores («12 ya se vendieron»; eran 8). Inflaba lo vendido, las
-- semanas, el margen y la línea de ventas, y podía encender «Repón» con ventas de otro. Lo encontró el escéptico de Formidable (2026-10-26).
-- `fn_proveedores_ventas_diarias` (20261026172000) y `fn_proveedor_tallas_sedes` (20261026193000) heredaban el mismo cruce. Felipe pidió
-- arreglarlo en una sola migración, en las tres funciones.
--
-- LA REGLA, EN UN SOLO LUGAR: `fn_proveedor_reparto()`. Las tres funciones leen de ella; ninguna vuelve a contar ventas ni stock por su cuenta.
--   · LO QUE TRAJO CADA UNO, por variante (la talla y el color viven ahí): cada recepción de Compras con su hora (al proveedor de la factura o del
--     lote, como antes) y la carga inicial de su proveedor habitual «desde siempre» (con la misma estimación de antes).
--   · CADA VENTA, DEVOLUCIÓN O CAMBIO se reparte por lo que cada proveedor había traído de esa variante HASTA ESE MOMENTO, sobre lo que habían traído
--     todos: nadie hereda ventas de antes de que llegara su ropa. Una venta anterior a toda llegada registrada se reparte por lo que trajo cada uno.
--     Felipe la eligió el 2026-10-26 entre tres: A (por lo que entregó cada uno, sin fechas: B heredaba ventas de antes de llegar y le salía
--     «Repón» sin merecerlo), B (esta) y C (lo primero que llega es lo primero que se vende: B salía «Sin ventas» aunque su talla se vendiera).
--   · CADA PRENDA VENDIDA ES DE UN SOLO PROVEEDOR: las partes se acumulan en el tiempo y se redondean por el mayor resto sobre lo acumulado. Así la
--     suma entre proveedores es SIEMPRE lo vendido real (por día, por sede y en total) y ninguno se queda con todos los redondeos.
--   · EL STOCK de cada variante y sede se reparte por lo que a cada uno le queda (lo que trajo menos lo que se le vendió), con el mismo redondeo:
--     la suma es el stock real.
--   · LA PLATA de lo vendido (ingreso y costo de `venta_items`, ventas completadas, no de prueba) va con la misma parte que su venta.
-- `fn_proveedor_reparto()` no tiene permiso para nadie: solo la leen las funciones de abajo, que ya piden la llave `fn_ve_plata_de_proveedores()`.
--
-- QUÉ NO CAMBIA. Qué cuenta como «compré» (los dos orígenes, el costo de la carga, la «Prenda sin registrar» fuera), las firmas de las tres
-- funciones y la llave. Las prendas de un solo proveedor dan lo mismo que antes. Solo lectura: no escribe nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin políticas, re-pegable. Necesita ANTES 20261026193000 y 20261026172000
-- (las reemplaza; si no están, créalas pegándolas primero). ORDEN con la web: da igual: las firmas no cambian.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_proveedor_reparto()
returns table (
  clase text,          -- 'compra' (una recepción) · 'carga' (lo de la carga inicial) · 'venta' (prendas vendidas netas) · 'plata' · 'stock'
  proveedor_id uuid,
  variante_id uuid,
  producto_id uuid,
  ubicacion_id uuid,
  cuando timestamptz,
  uds numeric,         -- unidades: lo recibido, lo de la carga, lo vendido neto (entero) o el stock (entero)
  plata numeric,       -- lo que costó lo recibido o lo de la carga
  ingreso numeric,     -- lo cobrado por lo vendido (su parte)
  costo numeric,       -- el costo de lo vendido (su parte)
  de_factura boolean
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  with costo_inicial as (
    select distinct on (ch.variante_id) ch.variante_id as vid, ch.costo_anterior as costo
    from retail.costo_historial ch
    order by ch.variante_id, ch.created_at, ch.id
  ),
  recepciones as (
    select m.id as mid, m.variante_id as vid, v.producto_id as pid, m.ubicacion_id as uid, m.cantidad, m.created_at as cuando,
           (ci.id is not null) as de_factura,
           case when ci.id is not null then c.proveedor_id else l.proveedor_id end as prov,
           coalesce(ci.costo_unitario, ch.costo_unitario_nuevo, ci0.costo, v.costo) as costo
    from retail.movimientos m
    join retail.variantes v on v.id = m.variante_id
    left join retail.compra_items ci on ci.id = m.compra_item_id
    left join retail.compras c on c.id = ci.compra_id
    left join retail.lotes l on l.id = m.lote_id
    left join lateral (
      select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id order by h.created_at limit 1
    ) ch on true
    left join costo_inicial ci0 on ci0.vid = m.variante_id
    where m.tipo = 'entrada' and m.motivo = 'recepcion' and m.produccion_id is null
      and (ci.id is null or c.estado = 'vigente')
  ),
  recibido_v as (
    select r.vid, sum(r.cantidad)::integer as uds from recepciones r group by r.vid
  ),
  carga_ent as (
    select m.variante_id as vid, sum(m.cantidad)::integer as uds, min(m.created_at::date) as primera
    from retail.movimientos m
    where m.tipo = 'entrada' and m.motivo = 'carga_inicial' and m.produccion_id is null
    group by m.variante_id
  ),
  vendido_neto_v as (
    select m.variante_id as vid,
           sum(case when m.tipo = 'salida' and m.motivo in ('venta', 'cambio') then m.cantidad
                    when m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta') then -m.cantidad
                    else 0 end)::integer as uds
    from retail.movimientos m
    where (m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta'))
    group by m.variante_id
  ),
  stock_v as (
    select s.variante_id as vid, sum(s.cantidad)::integer as uds from retail.stock s group by s.variante_id
  ),
  carga_v as (
    select p.proveedor_id as prov, v.id as vid, v.producto_id as pid,
           greatest(coalesce(e.uds, 0), coalesce(vn.uds, 0) + coalesce(sv.uds, 0) - coalesce(rv.uds, 0), 0) as uds,
           coalesce(ci0.costo, v.costo) as costo, coalesce(e.primera, v.created_at::date) as primera
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id and p.proveedor_id is not null
      and p.id <> '11111111-1111-4111-8111-111111111111' -- la «Prenda sin registrar» (centinela, ADR-0179) no es una compra
    left join carga_ent e on e.vid = v.id
    left join vendido_neto_v vn on vn.vid = v.id
    left join stock_v sv on sv.vid = v.id
    left join recibido_v rv on rv.vid = v.id
    left join costo_inicial ci0 on ci0.vid = v.id
  ),
  -- LO QUE TRAJO CADA PROVEEDOR de cada variante, y cuándo: cada recepción con su hora; la carga inicial, «desde siempre».
  aportes as (
    select r.prov, r.vid, r.cuando, r.cantidad::numeric as uds from recepciones r where r.prov is not null
    union all
    select c.prov, c.vid, '-infinity'::timestamptz, c.uds::numeric from carga_v c where c.uds > 0
  ),
  total_prov as (
    select a.prov, a.vid, sum(a.uds) as uds from aportes a group by a.prov, a.vid
  ),
  total_v as (
    select t.vid, sum(t.uds) as uds from total_prov t group by t.vid
  ),
  -- LO QUE SE REPARTE: cada movimiento de venta (con su signo: una devolución resta) y cada línea de venta cobrada (su plata).
  eventos as (
    select 'mov'::text as tipo, m.id as eid, m.variante_id as vid, m.ubicacion_id as uid, m.created_at as cuando,
           (case when m.tipo = 'salida' then m.cantidad else -m.cantidad end)::integer as uds, 0::numeric as ingreso, 0::numeric as costo
    from retail.movimientos m
    where ((m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta')))
      and exists (select 1 from total_v tv where tv.vid = m.variante_id)
    union all
    select 'item', vi.id, vi.variante_id, null::uuid, ve.created_at, 0,
           vi.cantidad * (vi.precio_unitario - vi.descuento_unitario - coalesce(vi.descuento_club_unitario, 0)),
           vi.cantidad * vi.costo_unitario
    from retail.venta_items vi
    join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada' and not ve.es_prueba
    where exists (select 1 from total_v tv where tv.vid = vi.variante_id)
  ),
  -- ═══ LA REGLA DE REPARTO (aquí y en ningún otro lado) ═══
  -- Un río por (variante, proveedor): sus llegadas y cada evento de esa variante, en orden de tiempo (a la misma hora, la llegada primero). Lo que
  -- había llegado de cada uno hasta cada evento, sobre lo de todos, es su parte en ese evento.
  flujo as (
    select a.vid, a.prov, a.cuando, 0 as orden, null::text as tipo, null::uuid as eid, null::uuid as uid, a.uds as aporte,
           0 as uds, 0::numeric as ingreso, 0::numeric as costo
    from aportes a
    union all
    select e.vid, tp.prov, e.cuando, 1, e.tipo, e.eid, e.uid, 0, e.uds, e.ingreso, e.costo
    from eventos e
    join total_prov tp on tp.vid = e.vid
  ),
  acumulado as (
    select f.*, sum(f.aporte) over (partition by f.vid, f.prov order by f.cuando, f.orden, f.eid rows unbounded preceding) as llego
    from flujo f
  ),
  parte as (
    select ac.vid, ac.prov, ac.cuando, ac.tipo, ac.eid, ac.uid, ac.uds, ac.ingreso, ac.costo,
           round(case when sum(ac.llego) over (partition by ac.tipo, ac.eid) > 0
                      then ac.llego / sum(ac.llego) over (partition by ac.tipo, ac.eid)
                      else tp.uds / tv.uds end, 12) as parte
    from acumulado ac
    join total_prov tp on tp.vid = ac.vid and tp.prov = ac.prov
    join total_v tv on tv.vid = ac.vid
    where ac.orden = 1
  ),
  -- ═══ fin de la regla ═══
  -- CADA PRENDA VENDIDA ES DE UN SOLO PROVEEDOR: lo acumulado de cada uno se redondea por el mayor resto sobre lo acumulado real de la variante, y
  -- lo que le toca en cada evento es la diferencia con el anterior. La suma entre proveedores es lo vendido real en cada evento.
  mov_frac as (
    select p.vid, p.prov, p.cuando, p.eid, p.uid,
           sum(p.parte * p.uds) over (partition by p.vid, p.prov order by p.cuando, p.eid rows unbounded preceding) as acum_frac,
           sum(p.uds) over (partition by p.vid, p.prov order by p.cuando, p.eid rows unbounded preceding) as acum_real
    from parte p
    where p.tipo = 'mov'
  ),
  mov_entero as (
    select mf.*,
           floor(mf.acum_frac)
             + case when row_number() over (partition by mf.eid order by mf.acum_frac - floor(mf.acum_frac) desc, mf.prov)
                         <= mf.acum_real - sum(floor(mf.acum_frac)) over (partition by mf.eid)
                    then 1 else 0 end as acum_entero
    from mov_frac mf
  ),
  mov_rep as (
    select me.vid, me.prov, me.uid, me.cuando,
           me.acum_entero - coalesce(lag(me.acum_entero) over (partition by me.vid, me.prov order by me.cuando, me.eid), 0) as uds
    from mov_entero me
  ),
  -- EL STOCK de cada variante y sede, por lo que a cada uno le queda (lo que trajo menos lo que se le vendió); si a nadie le queda nada y hay stock
  -- (un ajuste), por lo que trajo cada uno. Mismo redondeo por el mayor resto sobre lo acumulado: la suma es el stock real.
  queda as (
    select tp.vid, tp.prov, tp.uds as trajo, greatest(tp.uds - coalesce(sum(mr.uds), 0), 0) as queda
    from total_prov tp
    left join mov_rep mr on mr.vid = tp.vid and mr.prov = tp.prov
    group by tp.vid, tp.prov, tp.uds
  ),
  stock_celda as (
    select s.variante_id as vid, s.ubicacion_id as uid, sum(s.cantidad)::integer as uds
    from retail.stock s
    where exists (select 1 from total_v tv where tv.vid = s.variante_id)
    group by s.variante_id, s.ubicacion_id
  ),
  stock_frac as (
    select sc.vid, sc.uid, sc.uds as real, q.prov,
           sc.uds * case when sum(q.queda) over (partition by sc.vid, sc.uid) > 0
                         then q.queda / sum(q.queda) over (partition by sc.vid, sc.uid)
                         else q.trajo / sum(q.trajo) over (partition by sc.vid, sc.uid) end as frac
    from stock_celda sc
    join queda q on q.vid = sc.vid
  ),
  -- Sede tras sede, lo acumulado: así el total de cada proveedor sale exacto (lo que le queda) y cada sede suma su stock real.
  stock_acum as (
    select sf.vid, sf.uid, sf.prov,
           sum(sf.frac) over (partition by sf.vid, sf.prov order by sf.uid rows unbounded preceding) as acum_frac,
           sum(sf.real) over (partition by sf.vid, sf.prov order by sf.uid rows unbounded preceding) as acum_real
    from stock_frac sf
  ),
  stock_entero as (
    select sa.*,
           floor(sa.acum_frac)
             + case when row_number() over (partition by sa.vid, sa.uid order by sa.acum_frac - floor(sa.acum_frac) desc, sa.prov)
                         <= sa.acum_real - sum(floor(sa.acum_frac)) over (partition by sa.vid, sa.uid)
                    then 1 else 0 end as acum_entero
    from stock_acum sa
  ),
  stock_rep as (
    select se.vid, se.uid, se.prov,
           se.acum_entero - coalesce(lag(se.acum_entero) over (partition by se.vid, se.prov order by se.uid), 0) as uds
    from stock_entero se
  )
  select 'compra'::text, r.prov, r.vid, r.pid, r.uid, r.cuando, r.cantidad::numeric, r.cantidad * r.costo, 0::numeric, 0::numeric, r.de_factura
  from recepciones r where r.prov is not null
  union all
  select 'carga', c.prov, c.vid, c.pid, null::uuid, c.primera::timestamptz, c.uds::numeric, c.uds * c.costo, 0, 0, false
  from carga_v c where c.uds > 0
  union all
  select 'venta', mr.prov, mr.vid, v.producto_id, mr.uid, mr.cuando, mr.uds, 0, 0, 0, false
  from mov_rep mr join retail.variantes v on v.id = mr.vid
  where mr.uds <> 0
  union all
  select 'plata', p.prov, p.vid, v.producto_id, null::uuid, p.cuando, 0, 0, p.parte * p.ingreso, p.parte * p.costo, false
  from parte p join retail.variantes v on v.id = p.vid
  where p.tipo = 'item' and p.parte > 0
  union all
  select 'stock', sr.prov, sr.vid, v.producto_id, sr.uid, null::timestamptz, sr.uds, 0, 0, 0, false
  from stock_rep sr join retail.variantes v on v.id = sr.vid
  where sr.uds <> 0;
$function$;
revoke all on function retail.fn_proveedor_reparto() from public, anon, authenticated;
comment on function retail.fn_proveedor_reparto() is
  'Proveedores (2026-10-26, ADR-0521 act. c): la regla ÚNICA de reparto entre proveedores de una misma variante. Lo recibido y la carga de cada uno, y lo vendido (entero, por movimiento), la plata vendida y el stock (entero, por sede) repartidos por lo que cada uno había traído hasta cada venta. La leen fn_proveedor_prendas_base, fn_proveedores_ventas_diarias y fn_proveedor_tallas_sedes. Sin permiso para nadie.';

-- «Lo que le compré» por (proveedor, prenda): la misma firma y las mismas columnas de 20261024231000; ahora lo vendido, la plata vendida y el stock
-- son los de SU parte.
create or replace function retail.fn_proveedor_prendas_base(p_proveedor_id uuid default null)
returns table (
  proveedor_id uuid,
  producto_id uuid,
  unidades_compradas integer,
  unidades_compras integer,
  unidades_sin_factura integer,
  unidades_carga integer,
  unidades_estimadas integer,
  gasto numeric,
  gasto_compras numeric,
  gasto_carga numeric,
  primera_entrada date,
  con_factura boolean,
  unidades_vendidas integer,
  ingreso_vendido numeric,
  costo_vendido numeric,
  ultima_venta date,
  stock_actual integer
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  with r as (
    select * from retail.fn_proveedor_reparto() x where p_proveedor_id is null or x.proveedor_id = p_proveedor_id
  ),
  compras as (
    select r.proveedor_id as prov, r.producto_id as pid, sum(r.uds)::integer as uds,
           (sum(r.uds) filter (where not r.de_factura))::integer as sin_factura,
           sum(r.plata) as plata, min(r.cuando::date) as primera, bool_or(r.de_factura) as con_factura
    from r where r.clase = 'compra' group by r.proveedor_id, r.producto_id
  ),
  carga as (
    select r.proveedor_id as prov, r.producto_id as pid, sum(r.uds)::integer as uds, sum(r.plata) as plata, min(r.cuando::date) as primera
    from r where r.clase = 'carga' group by r.proveedor_id, r.producto_id
  ),
  pares as (
    select co.prov, co.pid from compras co union select ca.prov, ca.pid from carga ca
  ),
  vendidas as (
    select r.proveedor_id as prov, r.producto_id as pid, sum(r.ingreso) as ingreso, sum(r.costo) as costo, max(r.cuando)::date as ultima
    from r where r.clase = 'plata' group by r.proveedor_id, r.producto_id
  ),
  vendidas_netas as (
    select r.proveedor_id as prov, r.producto_id as pid, sum(r.uds)::integer as uds
    from r where r.clase = 'venta' group by r.proveedor_id, r.producto_id
  ),
  en_stock as (
    select r.proveedor_id as prov, r.producto_id as pid, sum(r.uds)::integer as uds
    from r where r.clase = 'stock' group by r.proveedor_id, r.producto_id
  )
  select pa.prov, pa.pid,
         coalesce(co.uds, 0) + coalesce(ca.uds, 0),
         coalesce(co.uds, 0), coalesce(co.sin_factura, 0), coalesce(ca.uds, 0), coalesce(ca.uds, 0),
         coalesce(co.plata, 0) + coalesce(ca.plata, 0), coalesce(co.plata, 0), coalesce(ca.plata, 0),
         least(co.primera, ca.primera), coalesce(co.con_factura, false),
         greatest(coalesce(vnn.uds, 0), 0), coalesce(ve.ingreso, 0), coalesce(ve.costo, 0), ve.ultima, coalesce(st.uds, 0)
  from pares pa
  left join compras co on co.prov = pa.prov and co.pid = pa.pid
  left join carga ca on ca.prov = pa.prov and ca.pid = pa.pid
  left join vendidas ve on ve.prov = pa.prov and ve.pid = pa.pid
  left join vendidas_netas vnn on vnn.prov = pa.prov and vnn.pid = pa.pid
  left join en_stock st on st.prov = pa.prov and st.pid = pa.pid;
$function$;
revoke all on function retail.fn_proveedor_prendas_base(uuid) from public, anon, authenticated;

-- Las ventas por día de cada proveedor (20261026172000): lo vendido neto de SU parte, por día de Lima.
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
    select r.proveedor_id, (timezone('America/Lima', r.cuando))::date, sum(r.uds)::integer
    from retail.fn_proveedor_reparto() r
    where r.clase = 'venta'
      and r.cuando >= (v_desde::timestamp at time zone 'America/Lima')
      and not retail.fn_proveedor_es_taller(r.proveedor_id)
    group by r.proveedor_id, (timezone('America/Lima', r.cuando))::date
    having sum(r.uds) <> 0
    order by 1, 2;
end;
$function$;
revoke all on function retail.fn_proveedores_ventas_diarias(integer) from public, anon;
grant execute on function retail.fn_proveedores_ventas_diarias(integer) to authenticated;

-- Las tallas y las sedes de un proveedor (20261026193000): lo vendido neto y el stock de SU parte, por (prenda, talla, sede). La llegada a una
-- sede no puede ser antes de que él trajera esa variante: si otro proveedor la trajo antes, su ritmo en la sede no cuenta desde entonces.
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
    with r as (
      select * from retail.fn_proveedor_reparto() x where x.proveedor_id = p_proveedor_id
    ),
    suyas as (
      select r.variante_id as vid, min(r.cuando)::date as primera
      from r where r.clase in ('compra', 'carga') group by r.variante_id
    ),
    vars as (
      select v.id as vid, v.producto_id as pid, coalesce(t.valor, 'Única') as talla, su.primera
      from retail.variantes v
      join suyas su on su.vid = v.id
      left join retail.tallas t on t.id = v.talla_id
    ),
    llegada as (
      -- La primera vez que esa variante llegó a la sede (compra, carga o traslado).
      select m.variante_id as vid, m.ubicacion_id as uid, min(m.created_at::date) as dia
      from retail.movimientos m
      join vars on vars.vid = m.variante_id
      where m.ubicacion_id is not null and m.tipo = 'entrada' and m.motivo not in ('cambio', 'devolucion', 'anulacion_venta')
      group by m.variante_id, m.ubicacion_id
    ),
    vend as (
      select r.variante_id as vid, r.ubicacion_id as uid, sum(r.uds)::integer as uds
      from r where r.clase = 'venta' and r.ubicacion_id is not null group by r.variante_id, r.ubicacion_id
    ),
    st as (
      select r.variante_id as vid, r.ubicacion_id as uid, sum(r.uds)::integer as uds
      from r where r.clase = 'stock' group by r.variante_id, r.ubicacion_id
    ),
    celdas as (
      select coalesce(vend.vid, st.vid) as vid, coalesce(vend.uid, st.uid) as uid,
             coalesce(vend.uds, 0) as vendidas, coalesce(st.uds, 0) as stock
      from vend full join st on st.vid = vend.vid and st.uid = vend.uid
    )
    select pr.id, pr.referencia, ca.nombre, vars.talla, u.id, u.nombre, u.tipo,
           greatest(sum(c.vendidas), 0)::integer, sum(c.stock)::integer, min(greatest(ll.dia, vars.primera))
    from celdas c
    join vars on vars.vid = c.vid
    join retail.productos pr on pr.id = vars.pid
    left join retail.categorias ca on ca.id = pr.categoria_id
    join retail.ubicaciones u on u.id = c.uid
    left join llegada ll on ll.vid = c.vid and ll.uid = c.uid
    group by pr.id, pr.referencia, ca.nombre, vars.talla, u.id, u.nombre, u.tipo
    having sum(c.vendidas) <> 0 or sum(c.stock) <> 0
    order by pr.referencia, u.nombre, vars.talla;
end;
$function$;
revoke all on function retail.fn_proveedor_tallas_sedes(uuid) from public, anon;
grant execute on function retail.fn_proveedor_tallas_sedes(uuid) to authenticated;

select 'QUEDÓ BIEN' as resultado
where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_proveedor_reparto');
