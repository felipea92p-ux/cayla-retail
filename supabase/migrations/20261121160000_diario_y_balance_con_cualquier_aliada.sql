-- ============================================================================
-- 20261121160000 — El Diario y el Balance con cualquier empresa aliada (ADR-0683, actividad 2)
--
-- EL PROBLEMA PRIMERO. El Balance ya saca de la mercadería de CAYLA el stock de CUALQUIER dueña que no sea la casa (`fn_bal_stock`, ADR-0558), pero el
-- Diario reclasificaba solo lo de CLAURE: `fn_claure_ventas`, `fn_claure_cambios` y `fn_movimiento_es_de_claure` buscaban `clave = 'claure'`. Con una
-- segunda aliada, su venta bajaba la 201 de CAYLA por una prenda que el Balance ya no contaba: la 201 dejaba de cuadrar y el Balance no se dibujaba.
-- Y las tres preguntaban `e.activo`: al dar de baja a una aliada, su pasado volvía a ser de CAYLA y los meses cerrados cambiaban de cifra.
--
-- QUÉ PROMETE.
--   · `fn_aliada_ventas(p_empresa, …)` y `fn_aliada_cambios(p_empresa, …)`: la MISMA lógica de las de CLAURE (copiada de su definición vigente, sin tocar
--     una línea más), para la aliada que se pida. Sin mirar `activo`: lo que fue suyo sigue siendo suyo aunque se dé de baja.
--   · `fn_aliadas_ventas(…)` y `fn_aliadas_cambios(…)`: las de todas las aliadas con cuenta (`cuenta_corriente_desde`), con su `empresa_id`. Las usa el Diario.
--   · `fn_claure_ventas` y `fn_claure_cambios` siguen existiendo con la misma firma y lo mismo que devuelven: piden lo de CLAURE a la versión por aliada.
--     Sus pantallas (Impuestos, la cuenta con Claudia) no cambian hasta la actividad 3.
--   · `fn_movimiento_es_de_claure` responde por cualquier aliada con cuenta (pérdidas, conteos, producción, carga inicial): su nombre queda por sus 7 llamadores.
--   · `fn_asientos_claure` lee las versiones de todas las aliadas (un reemplazo anclado de dos nombres, nada más).
--
-- QUÉ NO PROMETE. La deuda de cada dueña por separado (la 479 es una sola cuenta; lo de cada una es la actividad 3), el reparto de gastos (`fn_claure_gastos_base`,
-- actividad 5) ni las cifras de CAYLA en Inicio, metas o Análisis (`fn_item_es_de_claure`, actividad 6). Las glosas siguen diciendo «CLAURE» (actividad 7).
--
-- DECIDÍ copiar la lógica en una función por aliada y dejar las de CLAURE como envoltura. DESCARTÉ cambiar `fn_claure_ventas` para que devuelva todas:
-- `fn_claure_ventas_en` (la línea «de eso, CLAURE» de Impuestos) y la cuenta con Claudia sumarían ventas de otra dueña.
-- SE ROMPE SI producción tiene otra versión de esas funciones: la migración busca trozos de su lógica y, si no los encuentra, no aplica nada.
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-balance (y pnpm pruebas:balance-claure sigue 16/16).
-- CÓMO SE PEGA. Después de 20261121152000. Una sola parte, sin políticas. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Que producción tenga la lógica que se copia ----------
do $comprueba$
declare
  v_v text := pg_get_functiondef('retail.fn_claure_ventas(date, date, boolean, uuid[])'::regprocedure);
  v_c text := pg_get_functiondef('retail.fn_claure_cambios(date, date, uuid[])'::regprocedure);
  v_a text := pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure);
begin
  -- Ya pegada antes: las de CLAURE ya son envolturas y el Diario ya lee las de todas.
  if v_a like '%retail.fn_aliadas_ventas(%' then
    return;
  end if;
  if v_v not like '%fn_dueno_de_la_linea(vi.id) = v_claure%' or v_v not like '%venta_anulacion_items ai on ai.venta_item_id = vi.id%'
     or v_v not like '%fn_tasa_igv(dv.f_venta)%' or v_v not like '%(v.created_at at time zone ''America/Lima'')::date >= v_desde%' then
    raise exception 'retail.fn_claure_ventas no es la que se copió (ADR-0638, 20261115122000): regenera esta migración desde su definición real. No se aplicó nada.';
  end if;
  if v_c not like '%vieja_es_claure%' or v_c not like '%filter (where m.empresa_id = v_claure)%' or v_c not like '%cd.empresa_id = v_casa%' then
    raise exception 'retail.fn_claure_cambios no es la que se copió (20261029162000): regenera esta migración desde su definición real. No se aplicó nada.';
  end if;
  if v_a not like '%retail.fn_claure_ventas(p_desde, p_hasta, p_todo, p_ubics)%' or v_a not like '%retail.fn_claure_cambios(p_desde, p_hasta,%' then
    raise exception 'retail.fn_asientos_claure no lee fn_claure_ventas / fn_claure_cambios como se esperaba: regenera esta migración. No se aplicó nada.';
  end if;
end
$comprueba$;

-- ---------- 1. Lo de una aliada (la lógica de CLAURE, para la que se pida) ----------
CREATE OR REPLACE FUNCTION retail.fn_aliada_ventas(p_empresa uuid, p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
 RETURNS TABLE(fecha date, ubicacion_id uuid, origen text, id uuid, total numeric, igv numeric, base numeric, costo numeric, costo_ok numeric, costo_mal numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
  v_ini timestamptz := (p_desde::timestamp at time zone 'America/Lima');
  v_fin timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Lima');
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_claure is null or v_desde is null then
    return;
  end if;

  return query
  with sedes as (
    select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure and (p_todo or es.ubicacion_id = any (p_ubics))
  ),
  -- Las ventas del rango (también las luego anuladas: la venta ocurrió; la anulación la deshace en su día), solo las líneas de CLAURE.
  vt as (
    select v.id, v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as f,
           sum(vi.subtotal) as tot, sum(vi.costo_unitario * vi.cantidad) as costo
      from retail.ventas v
      join sedes s on s.ubicacion_id = v.ubicacion_id
      join retail.venta_items vi on vi.venta_id = v.id
      cross join lateral (select retail.fn_dueno_de_la_linea(vi.id) = v_claure as es) o
     where o.es and v.created_at >= v_ini and v.created_at < v_fin and not coalesce(v.es_prueba, false)
       and (v.created_at at time zone 'America/Lima')::date >= v_desde
     group by v.id, v.ubicacion_id, v.created_at
  ),
  -- Las anulaciones del rango, por la fecha en que se anularon; solo de ventas que ya contaban (desde el arranque).
  an as (
    select v.id, v.ubicacion_id, (v.anulado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta,
           sum(vi.subtotal) as tot,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') = 'vendible'), 0) as costo_ok,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal
      from retail.ventas v
      join sedes s on s.ubicacion_id = v.ubicacion_id
      join retail.venta_items vi on vi.venta_id = v.id
      left join retail.venta_anulacion_items ai on ai.venta_item_id = vi.id
      cross join lateral (select retail.fn_dueno_de_la_linea(vi.id) = v_claure as es) o
     where o.es and v.estado = 'anulada' and v.anulado_en >= v_ini and v.anulado_en < v_fin and not coalesce(v.es_prueba, false)
       and (v.created_at at time zone 'America/Lima')::date >= v_desde
     group by v.id, v.ubicacion_id, v.anulado_en, v.created_at
  ),
  -- Las devoluciones aprobadas del rango, valoradas por las líneas devueltas (como el Diario), solo de ventas que ya contaban.
  dv as (
    select d.id, v.ubicacion_id, (d.aprobado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta,
           sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad) as tot,
           sum(vi.costo_unitario * di.cantidad) as costo
      from retail.devoluciones d
      join retail.ventas v on v.id = d.venta_id
      join sedes s on s.ubicacion_id = v.ubicacion_id
      join retail.devolucion_items di on di.devolucion_id = d.id
      join retail.venta_items vi on vi.id = di.venta_item_id
      cross join lateral (select retail.fn_dueno_de_la_linea(vi.id) = v_claure as es) o
     where o.es and d.estado = 'aprobada' and d.aprobado_en >= v_ini and d.aprobado_en < v_fin and not coalesce(v.es_prueba, false)
       and (v.created_at at time zone 'America/Lima')::date >= v_desde
     group by d.id, v.ubicacion_id, d.aprobado_en, v.created_at
  )
  select vt.f, vt.ubicacion_id, 'venta'::text, vt.id, vt.tot, i.igv, vt.tot - i.igv, vt.costo, 0::numeric, 0::numeric
    from vt cross join lateral (select round(vt.tot - vt.tot / (1 + retail.fn_tasa_igv(vt.f)), 2) as igv) i
  union all
  select an.f, an.ubicacion_id, 'anulacion', an.id, an.tot, i.igv, an.tot - i.igv, an.costo_ok + an.costo_mal, an.costo_ok, an.costo_mal
    from an cross join lateral (select round(an.tot - an.tot / (1 + retail.fn_tasa_igv(an.f_venta)), 2) as igv) i
  union all
  select dv.f, dv.ubicacion_id, 'devolucion', dv.id, dv.tot, i.igv, dv.tot - i.igv, dv.costo, 0::numeric, 0::numeric
    from dv cross join lateral (select round(dv.tot - dv.tot / (1 + retail.fn_tasa_igv(dv.f_venta)), 2) as igv) i;
end $function$;

comment on function retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[]) is
  'ADR-0683 (interna): las ventas, anulaciones y devoluciones de las líneas de una aliada, desde su cuenta (cuenta_corriente_desde). La lógica de fn_claure_ventas (ADR-0560/0638), para cualquier aliada y sin mirar activo.';
revoke all on function retail.fn_aliada_ventas(uuid, date, date, boolean, uuid[]) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION retail.fn_aliada_cambios(p_empresa uuid, p_desde date, p_hasta date, p_ubics uuid[])
 RETURNS TABLE(cambio_id uuid, fecha date, ubicacion_id uuid, medio text, cuenta_id uuid, delta numeric, igv numeric, base numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
  v_casa uuid := retail.fn_empresa_casa_id();
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_claure is null or v_desde is null then
    return;
  end if;

  return query
  with sedes as (
    select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = any (p_ubics)
  ),
  base as (
    -- Cada cambio de esas sedes: lo que se pagó por lo que devolvió (`a`), si esa prenda era de CLAURE, y qué parte de la venta original se pagó en cuentas (no en efectivo).
    select cb.id as cambio_id, cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date as fecha,
           coalesce(cb.diferencia, 0) as d, cb.metodo_pago_diferencia as medio, cb.cuenta_dinero_id as cuenta_id, cb.cantidad,
           (vi.precio_unitario - coalesce(vi.descuento_unitario, 0)) * cb.cantidad as a,
           (retail.fn_dueno_de_la_linea(vi.id) = v_claure) as vieja_es_claure,
           coalesce((select sum(case when vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr') then vp.monto else 0 end) / nullif(sum(vp.monto), 0)
                       from retail.venta_pagos vp where vp.venta_id = vi.venta_id), 0) as nc
      from retail.cambios cb
      join sedes s on s.ubicacion_id = cb.ubicacion_id
      join retail.venta_items vi on vi.id = cb.venta_item_id
     where (cb.created_at at time zone 'America/Lima')::date between greatest(p_desde, v_desde) and p_hasta
  ),
  nueva as (
    -- Lo que la clienta se llevó, prenda por prenda: de quién era (el dueño de su movimiento) y a qué precio; la plata se reparte entre los dueños a lo que valga cada una.
    select b.cambio_id,
           coalesce(sum(m.cantidad * coalesce(sl.precio_unitario, (b.a + b.d) / nullif(b.cantidad, 0))) filter (where m.empresa_id = v_claure), 0) as v_claure,
           coalesce(sum(m.cantidad * coalesce(sl.precio_unitario, (b.a + b.d) / nullif(b.cantidad, 0))), 0) as v_total
      from base b
      join retail.movimientos m on m.cambio_id = b.cambio_id and m.tipo = 'salida'
      left join lateral (select s2.precio_unitario from retail.cambio_salidas s2 where s2.cambio_id = b.cambio_id and s2.variante_id = m.variante_id limit 1) sl on true
     group by b.cambio_id
  ),
  calc as (
    select b.*,
           case when coalesce(n.v_total, 0) > 0 then n.v_claure / n.v_total else 0 end as parte_nueva,
           b.a * b.nc as a_cuentas,
           -- La diferencia solo cuenta si se cobró o se devolvió en una cuenta de CAYLA (el efectivo lo tiene Claudia).
           case when b.medio in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
                     and (b.cuenta_id is null or exists (select 1 from retail.cuentas_dinero cd where cd.id = b.cuenta_id and cd.empresa_id = v_casa))
                then b.d else 0 end as d_cuentas
      from base b left join nueva n on n.cambio_id = b.cambio_id
  ),
  calculo as (
    select c.*, round(c.parte_nueva * (c.a_cuentas + c.d_cuentas) - case when c.vieja_es_claure then c.a_cuentas else 0 end, 2) as delta
      from calc c
  )
  select k.cambio_id, k.fecha, k.ubicacion_id, k.medio, k.cuenta_id, k.delta,
         round(k.delta - k.delta / (1 + retail.fn_tasa_igv(k.fecha)), 2),
         k.delta - round(k.delta - k.delta / (1 + retail.fn_tasa_igv(k.fecha)), 2)
    from calculo k
   where k.delta <> 0;
end $function$;

comment on function retail.fn_aliada_cambios(uuid, date, date, uuid[]) is
  'ADR-0683 (interna): cuánto cambia lo que se le debe a una aliada por los cambios de prenda. La lógica de fn_claure_cambios (ADR-0560), para cualquier aliada y sin mirar activo.';
revoke all on function retail.fn_aliada_cambios(uuid, date, date, uuid[]) from public, anon, authenticated;

-- ---------- 2. Lo de todas las aliadas con cuenta (lo que lee el Diario) ----------
create or replace function retail.fn_aliadas_ventas(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table(empresa_id uuid, fecha date, ubicacion_id uuid, origen text, id uuid, total numeric, igv numeric, base numeric, costo numeric, costo_ok numeric, costo_mal numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id, x.* from retail.empresas e
   cross join lateral retail.fn_aliada_ventas(e.id, p_desde, p_hasta, p_todo, p_ubics) x
   where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
$$;
revoke all on function retail.fn_aliadas_ventas(date, date, boolean, uuid[]) from public, anon, authenticated;

create or replace function retail.fn_aliadas_cambios(p_desde date, p_hasta date, p_ubics uuid[])
returns table(empresa_id uuid, cambio_id uuid, fecha date, ubicacion_id uuid, medio text, cuenta_id uuid, delta numeric, igv numeric, base numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id, x.* from retail.empresas e
   cross join lateral retail.fn_aliada_cambios(e.id, p_desde, p_hasta, p_ubics) x
   where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
$$;
revoke all on function retail.fn_aliadas_cambios(date, date, uuid[]) from public, anon, authenticated;

-- ---------- 3. Las de CLAURE: la misma firma, lo mismo que devuelven, pidiéndoselo a la versión por aliada ----------
create or replace function retail.fn_claure_ventas(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table(fecha date, ubicacion_id uuid, origen text, id uuid, total numeric, igv numeric, base numeric, costo numeric, costo_ok numeric, costo_mal numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select x.* from retail.empresas e cross join lateral retail.fn_aliada_ventas(e.id, p_desde, p_hasta, p_todo, p_ubics) x where e.clave = 'claure'
$$;
revoke all on function retail.fn_claure_ventas(date, date, boolean, uuid[]) from public, anon, authenticated;

create or replace function retail.fn_claure_cambios(p_desde date, p_hasta date, p_ubics uuid[])
returns table(cambio_id uuid, fecha date, ubicacion_id uuid, medio text, cuenta_id uuid, delta numeric, igv numeric, base numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select x.* from retail.empresas e cross join lateral retail.fn_aliada_cambios(e.id, p_desde, p_hasta, p_ubics) x where e.clave = 'claure'
$$;
revoke all on function retail.fn_claure_cambios(date, date, uuid[]) from public, anon, authenticated;

-- ---------- 4. ¿Este movimiento es de una aliada? (pérdidas, conteos, producción, carga inicial y el Diario) ----------
-- El nombre se queda por sus llamadores. Sin `clave` y sin `activo`: cualquier dueña con cuenta, y lo suyo sigue siendo suyo aunque se dé de baja.
create or replace function retail.fn_movimiento_es_de_claure(p_empresa_id uuid, p_ubicacion_id uuid, p_cuando timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select p_empresa_id is not null and p_empresa_id <> retail.fn_empresa_casa_id() and exists (
    select 1
      from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
     where e.id = p_empresa_id and e.cuenta_corriente_desde is not null
       and (p_cuando at time zone 'America/Lima')::date >= e.cuenta_corriente_desde)
$$;
comment on function retail.fn_movimiento_es_de_claure(uuid, uuid, timestamptz) is
  'ADR-0560 / ADR-0683 (interna): ¿este movimiento es de una empresa aliada con cuenta (desde su arranque)? Desde ADR-0683 responde por cualquier aliada, no solo CLAURE, y no mira si sigue activa.';

-- ---------- 5. El Diario lee lo de todas las aliadas ----------
do $diario$
declare
  v text := pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure);
  n_c int := (length(v) - length(replace(v, 'retail.fn_claure_cambios(p_desde, p_hasta,', ''))) / length('retail.fn_claure_cambios(p_desde, p_hasta,');
begin
  if v like '%retail.fn_aliadas_ventas(%' then
    return;
  end if;
  if n_c <> 6 then
    raise exception 'fn_asientos_claure lee fn_claure_cambios % veces (se esperaban 6): regenera esta migración. No se aplicó nada.', n_c;
  end if;
  v := replace(v, 'retail.fn_claure_ventas(p_desde, p_hasta, p_todo, p_ubics)', 'retail.fn_aliadas_ventas(p_desde, p_hasta, p_todo, p_ubics)');
  v := replace(v, 'retail.fn_claure_cambios(p_desde, p_hasta,', 'retail.fn_aliadas_cambios(p_desde, p_hasta,');
  execute v;
end
$diario$;

select 'QUEDÓ BIEN' as resultado;
