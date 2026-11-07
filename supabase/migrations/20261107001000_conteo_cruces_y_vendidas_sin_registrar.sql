-- ============================================================================
-- 20261107001000 — Lo que falta en un conteo no siempre es merma: prendas cruzadas y vendidas sin registrar
--
-- EL PROBLEMA PRIMERO. Desde el corte del 1-nov el diario asienta cada faltante de conteo como merma (6951) y cada sobrante
-- como sobrante (6959). Pero dos cosas que no son pérdidas entraban como pérdidas:
--   1. LA PRENDA CRUZADA. Se vendió la talla M y se escaneó la L, o se contó una por otra: el conteo dice «falta la M, sobra la
--      L» del mismo modelo, el mismo día. En AQP, 19 de los 29 faltantes de noviembre tenían su sobrante del mismo modelo.
--      Se veía como merma y sobrante a la vez, inflando los dos.
--   2. LA VENTA SIN PRENDA. Al cobrar sin escanear, la venta saca de la 201 su costo ESTIMADO (691 | 201), pero la prenda sigue en
--      el stock del sistema. Cuando el conteo no la encuentra, el diario la saca OTRA VEZ como merma: el costo se cobraba dos
--      veces (en noviembre, hasta S/ 932 en AQP y S/ 644 en TRU de ventas sin prenda; desde octubre, ~1,200 cerradas sin prenda).
--
-- LA DECISIÓN (Felipe, 2026-11-06).
--   · Cruce: un faltante y un sobrante de conteo del mismo modelo, en la misma sede y el mismo día, se emparejan unidad por unidad
--     (en orden de llegada). Ninguno de los dos es merma ni sobrante: si sus costos difieren, solo la diferencia se asienta
--     (merma o sobrante, regla «merma_cruce» / «sobrante_cruce»). La 201 y el resultado quedan IGUAL que antes; cambia lo que se
--     llama merma.
--   · Vendida sin registrar: un faltante de conteo (que no se cruzó) se empareja con una venta sin prenda cerrada SIN prenda de la
--     misma sede, categoría, talla y color, vendida antes del conteo (la k-ésima con la k-ésima, en orden de llegada; cada venta
--     una sola vez). Deja de ser merma: su costo ya salió con la venta. Solo se ajusta el costo de venta a lo real
--     (691 | 201 por real − estimado, o al revés). Ganancia: el costo estimado que se cobraba dos veces.
--   · El emparejamiento es GLOBAL y determinista (`fn_conteo_explicado`): da lo mismo con cualquier rango de fechas. Un mes
--     cerrado lee su foto y no cambia.
--
-- CONTRATO
--   PROMETE: (1) `fn_asientos` deja de asentar como merma o sobrante las unidades explicadas y suma las líneas de
--            `fn_asientos_conteo_explicado`, que cuadran solas; (2) la causa «venta_sin_prenda» de la comprobación de la 201
--            deja de contar las ventas que un conteo ubicó (su costo ya cuadra contra el stock); (3) pegarla dos veces no cambia nada.
--   ASUME:   que ya están pegadas 20261106171000 y 20261106204000 (anclas en `fn_asientos` y en `fn_bal_causas_mercaderia`), que
--            `prendas_por_regularizar` trae categoría, talla y color, y que una fila es una unidad.
--   NO HACE: no toca movimientos, stock, costos ni la pestaña Pérdidas de Inventario (que sigue mostrando el faltante del conteo);
--            no regulariza las ventas sin prenda (siguen «cerradas sin prenda»).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Crea dos funciones y reescribe dos desde su definición viva (si un ancla no
-- aparece exactamente una vez, aborta entero). Sin políticas ni `alter`. Sin `select … into` dentro de un texto entre comillas.
-- SE ROMPE SI: se cierra noviembre antes de pegarla (su foto queda con las mermas viejas).
-- DOWN: volver a pegar `fn_asientos` y `fn_bal_causas_mercaderia` sin las anclas nuevas y borrar las dos funciones.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Cada unidad de un faltante o sobrante de conteo que tiene explicación, con su pareja. Una fila = una unidad.
--   lado:        'perdida' (faltó) o 'aparecio' (sobró).
--   explicacion: 'cruce' (la pareja es la unidad del otro lado, del mismo modelo y día) o 'vendida' (la pareja es la línea de
--                la venta sin prenda que la explica; solo lado 'perdida').
--   costo_propio: el costo de la unidad ese día; costo_pareja: el de la otra unidad (cruce) o el estimado de la venta (vendida).
create or replace function retail.fn_conteo_explicado()
returns table (movimiento_id uuid, ubicacion_id uuid, instante timestamptz, lado text, explicacion text,
               costo_propio numeric, costo_pareja numeric, pareja_id uuid)
language sql stable security definer set search_path = retail, public, extensions as $$
  with
  u as (
    select m.id as mov, m.ubicacion_id as ub, m.created_at as t, (m.created_at at time zone 'America/Lima')::date as dia,
           v.producto_id as prod, p.categoria_id as cat, v.talla_id as talla, v.color_codigo as color,
           retail.fn_perdida_lado(m.tipo, m.motivo, m.cantidad) as lado,
           retail.fn_costo_variante_al(m.variante_id, m.created_at) as costo, g.n
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
      join retail.productos p on p.id = v.producto_id
      cross join lateral generate_series(1, abs(m.cantidad)) as g(n)
     where retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad) = 'conteo'
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
       -- Solo lo que el diario asienta: faltantes desde el corte de mermas, sobrantes desde el de sobrantes.
       and m.created_at >= case when retail.fn_perdida_lado(m.tipo, m.motivo, m.cantidad) = 'perdida'
                                then retail.fn_mermas_asientan_desde() else retail.fn_sobrantes_asientan_desde() end
  ),
  r as (
    select u.*, row_number() over (partition by u.ub, u.prod, u.dia, u.lado order by u.t, u.mov, u.n) as k from u
  ),
  cruce as (
    select f.mov as fmov, f.n as fn, f.ub, f.t as ft, f.costo as fc, a.mov as amov, a.t as at_, a.costo as ac
      from r f
      join r a on a.ub = f.ub and a.prod = f.prod and a.dia = f.dia and a.k = f.k and a.lado = 'aparecio'
     where f.lado = 'perdida'
  ),
  libres as (
    select r.*, row_number() over (partition by r.ub, r.cat, r.talla, r.color order by r.t, r.mov, r.n) as k2
      from r
     where r.lado = 'perdida' and not exists (select 1 from cruce c where c.fmov = r.mov and c.fn = r.n)
  ),
  vs as (
    select vi.id as vi_id, x.ubicacion_id as ub, x.categoria_id as cat, x.talla_id as talla, x.color_codigo as color,
           x.vendido_en as t, vi.costo_unitario as estimado,
           row_number() over (partition by x.ubicacion_id, x.categoria_id, x.talla_id, x.color_codigo order by x.vendido_en, x.id) as k2
      from retail.prendas_por_regularizar x
      join retail.venta_items vi on vi.id = x.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
     where x.estado = 'cerrada_sin_prenda' and v.estado = 'completada' and not coalesce(v.es_prueba, false)
       -- Una venta de antes de Finanzas no sacó su costo en el diario: no hay nada que compensar.
       and (retail.fn_finanzas_desde() is null or v.created_at >= (retail.fn_finanzas_desde()::timestamp at time zone 'America/Lima'))
       and not exists (select 1 from retail.devolucion_items di join retail.devoluciones d on d.id = di.devolucion_id
                        where di.venta_item_id = vi.id and d.estado = 'aprobada')
  )
  select c.fmov, c.ub, c.ft, 'perdida'::text, 'cruce'::text, c.fc, c.ac, c.amov from cruce c
  union all
  select c.amov, c.ub, c.at_, 'aparecio'::text, 'cruce'::text, c.ac, c.fc, c.fmov from cruce c
  union all
  select l.mov, l.ub, l.t, 'perdida'::text, 'vendida'::text, l.costo, s.estimado, s.vi_id
    from libres l
    join vs s on s.ub = l.ub and s.cat = l.cat and s.talla = l.talla and s.color = l.color and s.k2 = l.k2
   where s.t <= l.t;
$$;
revoke all on function retail.fn_conteo_explicado() from public, anon, authenticated;
comment on function retail.fn_conteo_explicado() is
  'Faltantes y sobrantes de conteo que no son pérdida ni hallazgo: la prenda cruzada (mismo modelo, sede y día) y la vendida sin registrar (una venta sin prenda de la misma sede, categoría, talla y color, antes del conteo). Una fila por unidad. Global y determinista. Interna: la llaman fn_asientos y fn_bal_causas_mercaderia.';

-- Las líneas del diario de lo explicado: solo la diferencia de costo. Cada asiento cuadra solo.
create or replace function retail.fn_asientos_conteo_explicado(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with
  x as (
    select e.* from retail.fn_conteo_explicado() e
     where e.instante >= (p_desde::timestamp at time zone 'America/Lima') and e.instante < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
       and (p_todo or e.ubicacion_id = any (p_ubics))
  ),
  -- Cruce: por pareja de movimientos, lo que vale lo que apareció menos lo que faltó.
  cz as (
    select (min(x.instante) at time zone 'America/Lima')::date as f, x.ubicacion_id, x.movimiento_id as fmov, x.pareja_id as amov,
           round(sum(x.costo_pareja - x.costo_propio), 2) as dif
      from x where x.explicacion = 'cruce' and x.lado = 'perdida'
     group by x.ubicacion_id, x.movimiento_id, x.pareja_id
  ),
  -- Vendida: por faltante, lo que costó de verdad menos lo que la venta ya sacó como estimado.
  vz as (
    select (min(x.instante) at time zone 'America/Lima')::date as f, x.ubicacion_id, x.movimiento_id as mov,
           round(sum(x.costo_propio - x.costo_pareja), 2) as dif
      from x where x.explicacion = 'vendida'
     group by x.ubicacion_id, x.movimiento_id
  )
  select cz.f, cz.ubicacion_id, 'conteo_cruce:' || cz.fmov || ':' || cz.amov, 'sobrante_cruce', '201', cz.dif, 0::numeric,
         'movimientos', cz.fmov, 'Prenda cruzada en el conteo: la que apareció vale más que la que faltó'
    from cz where cz.dif > 0
  union all
  select cz.f, cz.ubicacion_id, 'conteo_cruce:' || cz.fmov || ':' || cz.amov, 'sobrante_cruce', '6959', 0, cz.dif,
         'movimientos', cz.fmov, 'Diferencia de costo de la prenda cruzada'
    from cz where cz.dif > 0
  union all
  select cz.f, cz.ubicacion_id, 'conteo_cruce:' || cz.fmov || ':' || cz.amov, 'merma_cruce', '6951', -cz.dif, 0,
         'movimientos', cz.fmov, 'Diferencia de costo de la prenda cruzada'
    from cz where cz.dif < 0
  union all
  select cz.f, cz.ubicacion_id, 'conteo_cruce:' || cz.fmov || ':' || cz.amov, 'merma_cruce', '201', 0, -cz.dif,
         'movimientos', cz.fmov, 'Prenda cruzada en el conteo: la que faltó vale más que la que apareció'
    from cz where cz.dif < 0
  union all
  select vz.f, vz.ubicacion_id, 'conteo_vendida:' || vz.mov, 'venta_sin_registrar', '691', vz.dif, 0,
         'movimientos', vz.mov, 'Vendida sin registrar: el costo real fue mayor que el estimado de la venta'
    from vz where vz.dif > 0
  union all
  select vz.f, vz.ubicacion_id, 'conteo_vendida:' || vz.mov, 'venta_sin_registrar', '201', 0, vz.dif,
         'movimientos', vz.mov, 'Sale la prenda que se vendió sin registrar'
    from vz where vz.dif > 0
  union all
  select vz.f, vz.ubicacion_id, 'conteo_vendida:' || vz.mov, 'venta_sin_registrar', '201', -vz.dif, 0,
         'movimientos', vz.mov, 'Vendida sin registrar: el estimado de la venta sacó de más'
    from vz where vz.dif < 0
  union all
  select vz.f, vz.ubicacion_id, 'conteo_vendida:' || vz.mov, 'venta_sin_registrar', '691', 0, -vz.dif,
         'movimientos', vz.mov, 'Vuelve al costo de venta lo estimado de más'
    from vz where vz.dif < 0;
$$;
revoke all on function retail.fn_asientos_conteo_explicado(date, date, boolean, uuid[]) from public, anon, authenticated;

-- El diario: lo explicado deja de ser merma o sobrante, y entran sus líneas.
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
  $v$  mm as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,$v$,
  $n$  -- 20261107001000: las unidades de conteo que tienen explicación (cruzadas o vendidas sin registrar), por movimiento.
  ex as materialized (select e.movimiento_id, count(*)::integer as n from retail.fn_conteo_explicado() e group by e.movimiento_id),
  mm as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,$n$, 1);

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
  $v$           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_es_merma$v$,
  $n$           (abs(m.cantidad) - coalesce((select ex.n from ex where ex.movimiento_id = m.id), 0)) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_es_merma$n$, 1);

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
  $v$           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= greatest(v_ini, retail.fn_sobrantes_asientan_desde()) and m.created_at < v_fin$v$,
  $n$           (abs(m.cantidad) - coalesce((select ex.n from ex where ex.movimiento_id = m.id), 0)) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= greatest(v_ini, retail.fn_sobrantes_asientan_desde()) and m.created_at < v_fin$n$, 1);

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
  $v$    union all select * from retail.fn_asientos_carga_inicial(p_desde, p_hasta, v_todo, v_ubics)
  )$v$,
  $n$    union all select * from retail.fn_asientos_carga_inicial(p_desde, p_hasta, v_todo, v_ubics)
    -- 20261107001000: la prenda cruzada y la vendida sin registrar, solo por su diferencia de costo.
    union all select * from retail.fn_asientos_conteo_explicado(p_desde, p_hasta, v_todo, v_ubics)
  )$n$, 1);

-- La comprobación de la 201: una venta sin prenda que el conteo ubicó ya cuadra contra el stock (la prenda salió del stock y el
-- diario sacó solo su costo real). Se le devuelve su estimado a la causa, con el signo del resto (diario − stock).
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
  $v$    select 'venta_sin_prenda', 'Ventas sin prenda: su costo estimado sale de la mercadería sin mover stock',
           (select coalesce(-sum(vi.costo_unitario * vi.cantidad), 0)$v$,
  $n$    select 'venta_sin_prenda', 'Ventas sin prenda: su costo estimado sale de la mercadería sin mover stock',
           -- 20261107001000: las que un conteo ubicó ya no cuentan (su costo se cerró contra la prenda que faltó).
           (select coalesce(sum(e.costo_pareja), 0) from retail.fn_conteo_explicado() e cross join lim
             where e.explicacion = 'vendida' and e.instante >= lim.ini and e.instante < lim.fin)
           + (select coalesce(-sum(vi.costo_unitario * vi.cantidad), 0)$n$, 1);
