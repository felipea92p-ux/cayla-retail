-- ============================================================================
-- 20261029020000 — CLAURE fuera de las cifras de CAYLA: lo que se vende de CLAURE no es ingreso, costo ni mercadería de CAYLA
-- (ADR-0560; actividad 5 de 9)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM se venden prendas de CLAURE (de Claudia) con el RUC y las cuentas de CAYLA. El Diario las trataba como ventas
-- de CAYLA (7011 al haber, 691 y 201 por su costo), así que el Resumen, el Estado de resultados, el Balance y el Cierre de mes sumaban ingresos y
-- margen que no son de CAYLA. Felipe (2026-10-28): las ventas de CLAURE no suman a los ingresos ni a los datos de CAYLA; lo que se le debe queda
-- como cuenta por pagar a CLAURE; Impuestos sigue mostrando lo real de SUNAT (la boleta sale con el RUC de CAYLA) con la línea «de eso, CLAURE».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_claure_ventas(desde, hasta, todo, sedes)`: lo vendido de CLAURE por documento —venta, anulación, devolución—, valorado igual que el
--            Diario (las ventas y anulaciones por `venta_items.subtotal`, las devoluciones por las líneas devueltas), repartido por línea según su dueño
--            real (`fn_dueno_de_la_linea`, ADR-0542), desde `empresas.cuenta_corriente_desde` y solo en las sedes donde opera CLAURE. INTERNA.
--            (2) `fn_asientos_claure(...)`: una RECLASIFICACIÓN del Diario, un asiento por documento que cuadra solo: la parte sin IGV de lo vendido de
--            CLAURE sale de 7011 y va a 479 (lo que se le debe), y su costo vuelve a 201 y sale de 691; una anulación o una devolución la deshace en su
--            día. Los cobros, el IGV (4011) y las reversas de cobro NO se tocan: la plata entró a las cuentas de CAYLA y el IGV de la boleta lo declara
--            CAYLA. Por eso todo lo que lee el Diario (Estado de resultados, Resumen, Reportes, Balance, Cierre de mes) deja de contar a CLAURE sin que
--            ninguno cambie. `fn_asientos` la suma al final, como las demás fuentes. (3) `fn_claure_ventas_en(desde, hasta, sede)`: lo vendido de CLAURE
--            neto de anulaciones y devoluciones (venta, IGV, base, costo), para decir «de eso, CLAURE» en Impuestos y en el Estado de resultados.
--            (4) El Flujo real cuenta «Pago a CLAURE» como una salida (`pago_claure`, actividad 2).
--   ASUME:   (a) la 479 es PROVISIONAL hasta el contador y acumula la parte sin IGV de TODO lo vendido de CLAURE, también el efectivo que tiene
--            Claudia: hasta que se decida cómo se registra que se lo quedó (backlog), la 479 sube con ese efectivo y la pantalla CLAURE de Finanzas
--            (que solo cuenta lo cobrado en cuentas de CAYLA) dice menos que ella; (b) el IGV de CLAURE queda en 4011: si CAYLA se lo cobra a Claudia
--            es una decisión que falta (el saldo de la pantalla CLAURE ya lo muestra aparte); (c) la comisión del POS sigue siendo gasto de CAYLA
--            (recobrársela a CLAURE no se asienta todavía).
--   NO HACE: no cubre los CAMBIOS con prendas de CLAURE (la actividad 1 ya los lista aparte: siguen contando en CAYLA hasta que se decida cómo
--            contarlos); no toca meses cerrados (su foto es inmutable); no cambia lo anterior a `cuenta_corriente_desde`; no toca el inventario
--            que valora `fn_bal_stock` (cuenta el stock de CLAURE como de CAYLA: backlog).
--
-- CÓMO. Una función por encima de cada fuente y UN reemplazo anclado: `fn_asientos` suma la nueva fuente después de la de los pedidos web, con un
-- ancla que deja entero el texto que ya guardan las migraciones y las pruebas anteriores (`20261015053000`, `pruebas:pedidos-web-entregar`).
-- El de `fn_flujo_lineas` va DESPUÉS de la línea de `pago_sunat` por lo mismo. Funciones nuevas y dos reemplazos; sin tablas ni políticas.
-- Idempotente.
-- SE ROMPE SI: (1) `fn_asientos` o `fn_flujo_lineas` cambian el texto que anclan (aborta sin tocar nada); (2) una sede donde opera CLAURE vende con un
-- dueño de línea que no se pueda atribuir (no pasa: `fn_dueno_de_la_linea` cae a la ficha de la prenda).
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

-- ---------- 1. Lo vendido de CLAURE, por documento (interna) ----------
create or replace function retail.fn_claure_ventas(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (fecha date, ubicacion_id uuid, origen text, id uuid, total numeric, igv numeric, base numeric,
               costo numeric, costo_ok numeric, costo_mal numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
  v_ini timestamptz := (p_desde::timestamp at time zone 'America/Lima');
  v_fin timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Lima');
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
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
end $$;

comment on function retail.fn_claure_ventas(date, date, boolean, uuid[]) is
  'ADR-0560 (interna): lo vendido de CLAURE por documento (venta, anulación, devolución), valorado como el Diario y repartido por línea según su dueño real, desde empresas.cuenta_corriente_desde y solo en las sedes donde opera CLAURE.';
revoke all on function retail.fn_claure_ventas(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 2. La reclasificación del Diario ----------
create or replace function retail.fn_asientos_claure(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with x as (select * from retail.fn_claure_ventas(p_desde, p_hasta, p_todo, p_ubics))
  -- Una venta de CLAURE: sale de los ingresos (7011) y de la mercadería vendida (691) de CAYLA; lo que se le debe va a la 479 y la prenda no era de CAYLA (201).
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '7011', x.base, 0::numeric, 'ventas', x.id, 'Lo vendido de CLAURE no es ingreso de CAYLA'
    from x where x.origen = 'venta' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '479', 0, x.base, 'ventas', x.id, 'Se le debe a CLAURE (sin IGV)'
    from x where x.origen = 'venta' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '201', x.costo, 0, 'ventas', x.id, 'La prenda no era de CAYLA: no sale de su mercadería'
    from x where x.origen = 'venta' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '691', 0, x.costo, 'ventas', x.id, 'Su costo no es costo de lo vendido de CAYLA'
    from x where x.origen = 'venta' and x.costo > 0
  -- Una anulación la deshace el día en que se anuló (el Diario revierte la venta, el costo y la mercadería de CAYLA: aquí se devuelve lo reclasificado).
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '479', x.base, 0, 'ventas', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'anulacion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '7011', 0, x.base, 'ventas', x.id, 'Se revierte la venta de CLAURE que no era de CAYLA'
    from x where x.origen = 'anulacion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '691', x.costo, 0, 'ventas', x.id, 'Vuelve el costo que no era de CAYLA'
    from x where x.origen = 'anulacion' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '201', 0, x.costo_ok, 'ventas', x.id, 'La prenda de CLAURE no entra a la mercadería de CAYLA'
    from x where x.origen = 'anulacion' and x.costo_ok > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '6951', 0, x.costo_mal, 'ventas', x.id, 'La merma de una prenda de CLAURE no es de CAYLA'
    from x where x.origen = 'anulacion' and x.costo_mal > 0
  -- Una devolución, igual: el Diario revierte la venta y devuelve la prenda a CAYLA; aquí se devuelve lo reclasificado.
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '479', x.base, 0, 'devoluciones', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'devolucion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '7011', 0, x.base, 'devoluciones', x.id, 'Se revierte la venta de CLAURE que no era de CAYLA'
    from x where x.origen = 'devolucion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '691', x.costo, 0, 'devoluciones', x.id, 'Vuelve el costo que no era de CAYLA'
    from x where x.origen = 'devolucion' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '201', 0, x.costo, 'devoluciones', x.id, 'La prenda de CLAURE no entra a la mercadería de CAYLA'
    from x where x.origen = 'devolucion' and x.costo > 0;
$$;

comment on function retail.fn_asientos_claure(date, date, boolean, uuid[]) is
  'ADR-0560 (interna): reclasificación del Diario: lo vendido de CLAURE (sin IGV) sale de 7011 y va a 479, y su costo vuelve a 201 y sale de 691; anulaciones y devoluciones la deshacen en su día. Un asiento por documento, que cuadra solo.';
revoke all on function retail.fn_asientos_claure(date, date, boolean, uuid[]) from public, anon, authenticated;

-- fn_asientos la suma al final, como las demás fuentes. El ancla deja entero el texto que ya guardan 20261015053000 y sus pruebas
-- (termina en la línea de los pedidos web y su salto de línea; lo nuevo va DESPUÉS).
select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)
  )$v$,
$n$    union all select * from retail.fn_asientos_pedidos_web(p_desde, p_hasta, v_todo, v_ubics)
    -- ADR-0560, actividad 5: lo vendido de CLAURE no es ingreso, costo ni mercadería de CAYLA: se reclasifica a lo que se le debe (479).
    union all select * from retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)
  )$n$,
1);

-- ---------- 3. Lo vendido de CLAURE, para decirlo en Impuestos y en el Estado de resultados ----------
create or replace function retail.fn_claure_ventas_en(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (ventas numeric, igv numeric, base numeric, costo numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_ve_finanzas_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los números financieros necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  -- Finanzas cuenta desde su inicio (ADR-0332), como el Diario.
  if retail.fn_finanzas_desde() is not null then
    if p_hasta < retail.fn_finanzas_desde() then
      return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric;
      return;
    end if;
    p_desde := greatest(p_desde, retail.fn_finanzas_desde());
  end if;
  return query
  select coalesce(sum(case when f.origen = 'venta' then f.total else -f.total end), 0),
         coalesce(sum(case when f.origen = 'venta' then f.igv else -f.igv end), 0),
         coalesce(sum(case when f.origen = 'venta' then f.base else -f.base end), 0),
         coalesce(sum(case when f.origen = 'venta' then f.costo else -f.costo end), 0)
    from retail.fn_claure_ventas(p_desde, p_hasta, v_todo, v_ubics) f;
end $$;

comment on function retail.fn_claure_ventas_en(date, date, uuid) is
  'ADR-0560: lo vendido de CLAURE en el rango, neto de anulaciones y devoluciones: venta (con IGV), IGV, base y costo, de lo que la cuenta ve en Finanzas. Para decir «de eso, CLAURE» junto a las cifras que ya no lo cuentan.';
revoke all on function retail.fn_claure_ventas_en(date, date, uuid) from public, anon;
grant execute on function retail.fn_claure_ventas_en(date, date, uuid) to authenticated;

-- ---------- 4. El Flujo real: «Pago a CLAURE» es una salida ----------
-- Después de la línea de `pago_sunat` (20261016215000 guarda hasta ahí): una categoría nueva sale por la regla de siempre (`fn_flujo_lado`).
select pg_temp.reemplazar('retail.fn_flujo_lineas(date, date)',
$v$                when d.tipo = 'pago_sunat' then 'impuestos'
$v$,
$n$                when d.tipo = 'pago_sunat' then 'impuestos'
                when d.tipo = 'pago_claure' then 'pago_claure'
$n$,
1);

-- ---------- 5. Que quedó como se prometió ----------
do $$
begin
  if position('retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_asientos no quedó sumando la reclasificación de CLAURE';
  end if;
  if position('pago_claure' in pg_get_functiondef('retail.fn_flujo_lineas(date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_flujo_lineas no quedó contando el pago a CLAURE';
  end if;
end $$;
