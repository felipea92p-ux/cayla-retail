-- 20261107202000 — Rendimiento (ADR-0622, parte 4): el reparto por proveedor va directo cuando la prenda tiene un solo proveedor
--
-- POR QUÉ. Con un año de ventas (6 tiendas, 24.000 variantes, 263.000 líneas, 407.000 movimientos) Compras ▸ Proveedores no cargaba:
-- `fn_proveedores_prendas`, `fn_proveedores_rendimiento`, `fn_proveedores_ventas_diarias` y `fn_proveedor_prendas` pasaban de 8 s (el corte de
-- producción). La causa era `fn_proveedor_reparto()`: pasaba los 525.000 eventos de venta por cinco ventanas (lo acumulado de cada proveedor, su
-- parte, el redondeo por el mayor resto) aunque casi toda variante la trajo UN solo proveedor, y con uno solo la parte es 1 y el redondeo no
-- mueve nada. Además, cada función volvía a calcular el reparto de TODA la base, también la que pide un solo proveedor.
--
-- QUÉ CAMBIA (solo cómo se calcula; las filas que salen son las mismas, comprobado con md5 contra la versión de 20261026194000):
--   · La regla vive en `fn_proveedor_reparto_de(p_proveedor_id, p_ventas_desde)`. `fn_proveedor_reparto()` la llama con (null, null): misma
--     firma y mismas filas que antes.
--   · Las ventanas de la regla corren SOLO para las variantes que trajeron dos o más proveedores. Las de uno solo van directo: cada venta, su
--     plata y su stock son enteros de ese proveedor (la parte se escribe 1,000000000000, como la daría la regla, para que la plata salga con
--     los mismos decimales).
--   · Con un proveedor pedido, solo se calculan las variantes donde ese proveedor pudo traer algo (las de sus productos y las que recibió por
--     Compras): el reparto de una variante no depende de las otras.
--   · Con `p_ventas_desde`, solo salen las ventas desde ese momento (lo que piden las ventas por día): no se leen las líneas de venta ni se
--     arma el stock ni la plata. Las ventas de una variante de varios proveedores se siguen repartiendo con TODA su historia.
--   · Cada tabla grande se lee una vez (las entradas de compra y carga juntas; el stock por celda una vez), y `fn_proveedor_prendas_base` suma
--     todo en una pasada en vez de cinco.
--   · Las ventas por día preguntan `fn_proveedor_es_taller` una vez por proveedor, no una por venta.
--
-- QUÉ NO CAMBIA. La regla (ADR-0521 act. c), las firmas de las funciones públicas, la llave `fn_ve_plata_de_proveedores()` y que el reparto no
-- lo ejecuta nadie desde afuera (ni anon ni authenticated). Solo lectura: no escribe nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): una sola parte, sin tablas, sin políticas y sin `drop`; re-pegable. Necesita antes
-- 20261026194000 (la regla) y 20261029041000. ORDEN con la web: da igual, las firmas públicas no cambian.

set search_path = retail, public, extensions;
-- ============================== CANDADO (corre primero) ==============================
-- Cada función de abajo se reescribe ENTERA desde su cuerpo de main (medido en la copia `cayla_carga`). Si en la base el cuerpo
-- vivo es otro (alguien la parchó en vivo o una migración de otra rama la tocó después), pegar esto pisaría ese cambio: el
-- candado aborta todo (el SQL Editor corre todo en una transacción) y dice cuál. Acepta el cuerpo de main y el de este archivo,
-- así que se puede pegar dos veces. Si salta: reescribir esa función desde su `pg_get_functiondef` real antes de pegar.
do $candado$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_proveedor_prendas_base(uuid)', '00839689f7def4e6b769af02285a9a77', '351304d52694a2184479b457d2d4ce23'),
    ('retail.fn_proveedor_reparto()', 'ffd1e6e207909351a161c5e0937cc36c', '00c90f299a38e2644d8a075edc829897'),
    ('retail.fn_proveedor_tallas_sedes(uuid)', '3cbde707716e85ecd0998c5393961bea', 'ce194b16a0aff6d20d4d746311facb72'),
    ('retail.fn_proveedores_ventas_diarias(integer)', '14c863cf9310d0422f0608211213fe97', '83ed0cd586567fdfc6ec994aca2bcca3')
  ) as t(firma, md5_main, md5_nuevo) loop
    select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      raise exception 'Falta %: esta migración no la crea, solo la reescribe.', r.firma;
    end if;
    if v_md5 not in (r.md5_main, r.md5_nuevo) then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma, v_md5;
    end if;
  end loop;
end
$candado$;

set lock_timeout = '3s';

create or replace function retail.fn_proveedor_reparto_de(p_proveedor_id uuid, p_ventas_desde timestamptz)
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
  with
  -- CON UN PROVEEDOR PEDIDO, solo se reparten las variantes donde ese proveedor PUEDE haber traído algo: las de sus productos (la carga inicial
  -- va al proveedor del producto) y las que recibió por Compras (por la factura o por el lote). Es un superconjunto a propósito: el reparto de
  -- una variante no mira ninguna otra, así que lo que sobra no le cambia nada y al final se queda solo lo suyo.
  candidatas as (
    select v.id as vid
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    where p_proveedor_id is not null and p.proveedor_id = p_proveedor_id
    union
    select m.variante_id
    from retail.movimientos m
    left join retail.compra_items ci on ci.id = m.compra_item_id
    left join retail.compras c on c.id = ci.compra_id
    left join retail.lotes l on l.id = m.lote_id
    where p_proveedor_id is not null and m.tipo = 'entrada' and m.motivo = 'recepcion'
      and (c.proveedor_id = p_proveedor_id or l.proveedor_id = p_proveedor_id)
  ),
  costo_inicial as (
    select distinct on (ch.variante_id) ch.variante_id as vid, ch.costo_anterior as costo
    from retail.costo_historial ch
    where p_proveedor_id is null or ch.variante_id in (select cd.vid from candidatas cd)
    order by ch.variante_id, ch.created_at, ch.id
  ),
  -- Las entradas que cuentan como «compré» (recepción de Compras y carga inicial), en UNA lectura de movimientos.
  entradas as (
    select m.id, m.variante_id, m.ubicacion_id, m.motivo, m.cantidad, m.created_at, m.compra_item_id, m.lote_id
    from retail.movimientos m
    where m.tipo = 'entrada' and m.motivo in ('recepcion', 'carga_inicial') and m.produccion_id is null
      and (p_proveedor_id is null or m.variante_id in (select cd.vid from candidatas cd))
  ),
  recepciones as (
    select m.id as mid, m.variante_id as vid, v.producto_id as pid, m.ubicacion_id as uid, m.cantidad, m.created_at as cuando,
           (ci.id is not null) as de_factura,
           case when ci.id is not null then c.proveedor_id else l.proveedor_id end as prov,
           coalesce(ci.costo_unitario, ch.costo_unitario_nuevo, ci0.costo, v.costo) as costo
    from entradas m
    join retail.variantes v on v.id = m.variante_id
    left join retail.compra_items ci on ci.id = m.compra_item_id
    left join retail.compras c on c.id = ci.compra_id
    left join retail.lotes l on l.id = m.lote_id
    left join lateral (
      select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id order by h.created_at limit 1
    ) ch on true
    left join costo_inicial ci0 on ci0.vid = m.variante_id
    where m.motivo = 'recepcion'
      and (ci.id is null or c.estado = 'vigente')
  ),
  recibido_v as (
    select r.vid, sum(r.cantidad)::integer as uds from recepciones r group by r.vid
  ),
  carga_ent as (
    select m.variante_id as vid, sum(m.cantidad)::integer as uds, min(m.created_at::date) as primera
    from entradas m
    where m.motivo = 'carga_inicial'
    group by m.variante_id
  ),
  -- Cada movimiento de venta (con su signo: una devolución resta), leído UNA vez: de aquí sale lo vendido neto de cada variante (para estimar
  -- la carga inicial) y los eventos que se reparten.
  mov_venta as (
    select m.id as eid, m.variante_id as vid, m.ubicacion_id as uid, m.created_at as cuando,
           (case when m.tipo = 'salida' then m.cantidad else -m.cantidad end)::integer as uds
    from retail.movimientos m
    where ((m.tipo = 'salida' and m.motivo in ('venta', 'cambio')) or (m.tipo = 'entrada' and m.motivo in ('cambio', 'devolucion', 'anulacion_venta')))
      and (p_proveedor_id is null or m.variante_id in (select cd.vid from candidatas cd))
  ),
  vendido_neto_v as (
    select mv.vid, sum(mv.uds)::integer as uds from mov_venta mv group by mv.vid
  ),
  -- El stock, leído UNA vez por celda (variante y sede); el de la variante es su suma.
  stock_celda_todas as (
    select s.variante_id as vid, s.ubicacion_id as uid, sum(s.cantidad)::integer as uds
    from retail.stock s
    where p_proveedor_id is null or s.variante_id in (select cd.vid from candidatas cd)
    group by s.variante_id, s.ubicacion_id
  ),
  stock_v as (
    select sc.vid, sum(sc.uds)::integer as uds from stock_celda_todas sc group by sc.vid
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
    where p_proveedor_id is null or v.id in (select cd.vid from candidatas cd)
  ),
  -- LO QUE TRAJO CADA PROVEEDOR de cada variante, y cuándo: cada recepción con su hora; la carga inicial, «desde siempre».
  aportes as (
    select r.prov, r.vid, r.pid, r.cuando, r.cantidad::numeric as uds from recepciones r where r.prov is not null
    union all
    select c.prov, c.vid, c.pid, '-infinity'::timestamptz, c.uds::numeric from carga_v c where c.uds > 0
  ),
  total_prov as (
    select a.prov, a.vid, a.pid, sum(a.uds) as uds from aportes a group by a.prov, a.vid, a.pid
  ),
  -- Por variante: lo que trajeron todos, cuántos proveedores fueron (n) y, si fue uno, cuál (uno_solo).
  total_v as (
    select t.vid, t.pid, sum(t.uds) as uds, count(*) as n, (array_agg(t.prov))[1] as uno_solo
    from total_prov t
    group by t.vid, t.pid
  ),
  -- Cada línea de venta cobrada (su plata): ventas completadas y no de prueba. Se lee aparte (MATERIALIZED) para que se cruce con las ventas de
  -- una vez y no línea por línea. Las ventas por día (p_ventas_desde) no la necesitan: no se lee.
  item_venta as materialized (
    select vi.id as eid, vi.variante_id as vid, ve.created_at as cuando,
           vi.cantidad * (vi.precio_unitario - vi.descuento_unitario - coalesce(vi.descuento_club_unitario, 0)) as ingreso,
           vi.cantidad * vi.costo_unitario as costo
    from retail.venta_items vi
    join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada' and not ve.es_prueba
    where p_ventas_desde is null
      and (p_proveedor_id is null or vi.variante_id in (select cd.vid from candidatas cd))
  ),
  -- LO QUE SE REPARTE entre VARIOS proveedores: cada movimiento de venta y cada línea cobrada de una variante que trajeron dos o más. Lo de las
  -- variantes de un solo proveedor no pasa por la regla: va directo a la salida («UN SOLO PROVEEDOR», abajo).
  eventos as (
    select 'mov'::text as tipo, mv.eid, mv.vid, mv.uid, mv.cuando, mv.uds, 0::numeric as ingreso, 0::numeric as costo
    from mov_venta mv
    join total_v tv on tv.vid = mv.vid and tv.n > 1
    union all
    select 'item', iv.eid, iv.vid, null::uuid, iv.cuando, 0, iv.ingreso, iv.costo
    from item_venta iv
    join total_v tv on tv.vid = iv.vid and tv.n > 1
  ),
  -- ═══ LA REGLA DE REPARTO (aquí y en ningún otro lado) ═══
  -- Un río por (variante, proveedor): sus llegadas y cada evento de esa variante, en orden de tiempo (a la misma hora, la llegada primero). Lo que
  -- había llegado de cada uno hasta cada evento, sobre lo de todos, es su parte en ese evento. Con UN solo proveedor la parte es siempre 1
  -- (llegó solo lo suyo, o, antes de toda llegada, lo suyo sobre lo suyo): por eso aquí entran solo las variantes de dos o más.
  flujo as (
    select a.vid, a.prov, a.cuando, 0 as orden, null::text as tipo, null::uuid as eid, null::uuid as uid, a.uds as aporte,
           0 as uds, 0::numeric as ingreso, 0::numeric as costo
    from aportes a
    join total_v tv on tv.vid = a.vid and tv.n > 1
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
    join total_v tv on tv.vid = tp.vid and tv.n > 1
    left join mov_rep mr on mr.vid = tp.vid and mr.prov = tp.prov
    group by tp.vid, tp.prov, tp.uds
  ),
  stock_celda as (
    select sc.vid, sc.uid, sc.uds, tv.n, tv.uno_solo, tv.pid
    from stock_celda_todas sc
    join total_v tv on tv.vid = sc.vid
  ),
  stock_frac as (
    select sc.vid, sc.uid, sc.uds as real, q.prov,
           sc.uds * case when sum(q.queda) over (partition by sc.vid, sc.uid) > 0
                         then q.queda / sum(q.queda) over (partition by sc.vid, sc.uid)
                         else q.trajo / sum(q.trajo) over (partition by sc.vid, sc.uid) end as frac
    from stock_celda sc
    join queda q on q.vid = sc.vid
    where sc.n > 1
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
  ),
  -- Con p_ventas_desde, solo las ventas desde ese momento: lo demás ni se arma.
  todo as (
    select 'compra'::text as clase, r.prov, r.vid, r.pid, r.uid, r.cuando, r.cantidad::numeric as uds, r.cantidad * r.costo as plata,
           0::numeric as ingreso, 0::numeric as costo, r.de_factura
    from recepciones r
    where p_ventas_desde is null and r.prov is not null
    union all
    select 'carga', c.prov, c.vid, c.pid, null::uuid, c.primera::timestamptz, c.uds::numeric, c.uds * c.costo, 0, 0, false
    from carga_v c
    where p_ventas_desde is null and c.uds > 0
    -- VARIOS PROVEEDORES: lo que salió de la regla.
    union all
    select 'venta', mr.prov, mr.vid, v.producto_id, mr.uid, mr.cuando, mr.uds, 0, 0, 0, false
    from mov_rep mr
    join retail.variantes v on v.id = mr.vid
    where mr.uds <> 0 and (p_ventas_desde is null or mr.cuando >= p_ventas_desde)
    union all
    select 'plata', p.prov, p.vid, v.producto_id, null::uuid, p.cuando, 0, 0, p.parte * p.ingreso, p.parte * p.costo, false
    from parte p
    join retail.variantes v on v.id = p.vid
    where p_ventas_desde is null and p.tipo = 'item' and p.parte > 0
    union all
    select 'stock', sr.prov, sr.vid, v.producto_id, sr.uid, null::timestamptz, sr.uds, 0, 0, 0, false
    from stock_rep sr
    join retail.variantes v on v.id = sr.vid
    where p_ventas_desde is null and sr.uds <> 0
    -- UN SOLO PROVEEDOR: cada venta, su plata y su stock son enteros suyos. La parte se escribe como la daría la regla (1 con 12 decimales)
    -- para que la plata salga con los mismos decimales de siempre.
    union all
    select 'venta', tv.uno_solo, mv.vid, tv.pid, mv.uid, mv.cuando, mv.uds::numeric, 0, 0, 0, false
    from mov_venta mv
    join total_v tv on tv.vid = mv.vid and tv.n = 1
    where mv.uds <> 0 and (p_ventas_desde is null or mv.cuando >= p_ventas_desde)
    union all
    select 'plata', tv.uno_solo, iv.vid, tv.pid, null::uuid, iv.cuando, 0, 0, 1.000000000000 * iv.ingreso, 1.000000000000 * iv.costo, false
    from item_venta iv
    join total_v tv on tv.vid = iv.vid and tv.n = 1
    where p_ventas_desde is null
    union all
    select 'stock', sc.uno_solo, sc.vid, sc.pid, sc.uid, null::timestamptz, sc.uds::numeric, 0, 0, 0, false
    from stock_celda sc
    where p_ventas_desde is null and sc.n = 1 and sc.uds <> 0
  )
  select t.clase, t.prov, t.vid, t.pid, t.uid, t.cuando, t.uds, t.plata, t.ingreso, t.costo, t.de_factura
  from todo t
  where p_proveedor_id is null or t.prov = p_proveedor_id;
$function$;

-- Como `fn_proveedor_reparto()`: nadie la ejecuta desde afuera; solo la leen las funciones de abajo, que ya piden la llave.
revoke all on function retail.fn_proveedor_reparto_de(uuid, timestamptz) from public, anon, authenticated;

create or replace function retail.fn_proveedor_reparto()
returns table (
  clase text,
  proveedor_id uuid,
  variante_id uuid,
  producto_id uuid,
  ubicacion_id uuid,
  cuando timestamptz,
  uds numeric,
  plata numeric,
  ingreso numeric,
  costo numeric,
  de_factura boolean
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  -- Todo el reparto, de todos los proveedores (la regla vive en fn_proveedor_reparto_de).
  select * from retail.fn_proveedor_reparto_de(null, null);
$function$;

revoke all on function retail.fn_proveedor_reparto() from public, anon, authenticated;

create or replace function retail.fn_proveedor_prendas_base(p_proveedor_id uuid default null)
returns table (
  proveedor_id uuid, producto_id uuid, unidades_compradas integer, unidades_compras integer, unidades_sin_factura integer, unidades_carga integer,
  unidades_estimadas integer, gasto numeric, gasto_compras numeric, gasto_carga numeric, primera_entrada date, con_factura boolean,
  unidades_vendidas integer, ingreso_vendido numeric, costo_vendido numeric, ultima_venta date, stock_actual integer
)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
  -- Con un proveedor, el reparto se calcula solo para sus variantes. Todo se suma en UNA pasada por (proveedor, prenda); una pareja sin compra
  -- ni carga no es «le compré» y no sale.
  with s as (
    select r.proveedor_id as prov, r.producto_id as pid,
           (sum(r.uds) filter (where r.clase = 'compra'))::integer as co_uds,
           (sum(r.uds) filter (where r.clase = 'compra' and not r.de_factura))::integer as co_sin_factura,
           sum(r.plata) filter (where r.clase = 'compra') as co_plata,
           min(r.cuando::date) filter (where r.clase = 'compra') as co_primera,
           bool_or(r.de_factura) filter (where r.clase = 'compra') as co_con_factura,
           (sum(r.uds) filter (where r.clase = 'carga'))::integer as ca_uds,
           sum(r.plata) filter (where r.clase = 'carga') as ca_plata,
           min(r.cuando::date) filter (where r.clase = 'carga') as ca_primera,
           sum(r.ingreso) filter (where r.clase = 'plata') as ve_ingreso,
           sum(r.costo) filter (where r.clase = 'plata') as ve_costo,
           (max(r.cuando) filter (where r.clase = 'plata'))::date as ve_ultima,
           (sum(r.uds) filter (where r.clase = 'venta'))::integer as vn_uds,
           (sum(r.uds) filter (where r.clase = 'stock'))::integer as st_uds,
           bool_or(r.clase in ('compra', 'carga')) as le_compre
    from retail.fn_proveedor_reparto_de(p_proveedor_id, null) r
    group by r.proveedor_id, r.producto_id
  )
  select s.prov, s.pid,
         coalesce(s.co_uds, 0) + coalesce(s.ca_uds, 0),
         coalesce(s.co_uds, 0), coalesce(s.co_sin_factura, 0), coalesce(s.ca_uds, 0), coalesce(s.ca_uds, 0),
         coalesce(s.co_plata, 0) + coalesce(s.ca_plata, 0), coalesce(s.co_plata, 0), coalesce(s.ca_plata, 0),
         least(s.co_primera, s.ca_primera), coalesce(s.co_con_factura, false),
         greatest(coalesce(s.vn_uds, 0), 0), coalesce(s.ve_ingreso, 0), coalesce(s.ve_costo, 0), s.ve_ultima, coalesce(s.st_uds, 0)
  from s
  where s.le_compre;
$function$;

create or replace function retail.fn_proveedores_ventas_diarias(p_dias integer default 28)
returns table (proveedor_id uuid, dia date, vendidas integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 28), 7), 90);
  v_desde date := (timezone('America/Lima', now()))::date - (v_dias - 1);
  v_desde_ts timestamptz := (v_desde::timestamp at time zone 'America/Lima');
begin
  if not retail.fn_ve_plata_de_proveedores() then
    raise exception 'Las ventas de los proveedores necesitan Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol.' using errcode = '42501';
  end if;
  -- Solo las ventas desde el primer día pedido (el reparto las sigue calculando con toda su historia). El taller (CAYLA SAC) se pregunta una
  -- vez por proveedor, no una por venta.
  return query
    with talleres as (
      select pv.id from retail.proveedores pv where retail.fn_proveedor_es_taller(pv.id)
    )
    select r.proveedor_id, (timezone('America/Lima', r.cuando))::date, sum(r.uds)::integer
    from retail.fn_proveedor_reparto_de(null, v_desde_ts) r
    where r.clase = 'venta'
      and r.cuando >= v_desde_ts
      and not exists (select 1 from talleres t where t.id = r.proveedor_id)
    group by r.proveedor_id, (timezone('America/Lima', r.cuando))::date
    having sum(r.uds) <> 0
    order by 1, 2;
end;
$function$;

create or replace function retail.fn_proveedor_tallas_sedes(p_proveedor_id uuid)
returns table (
  producto_id uuid, referencia text, categoria text, talla text, ubicacion_id uuid, sede text, sede_tipo text, vendidas integer, stock integer,
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
      -- El reparto solo de las variantes de este proveedor (fn_proveedor_reparto_de ya deja solo sus filas).
      select * from retail.fn_proveedor_reparto_de(p_proveedor_id, null) x where x.proveedor_id = p_proveedor_id
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
