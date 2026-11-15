-- Ventas ▸ Reportes ▸ Ventas del mes: «Cómo se pagó» también con la empresa elegida (CAYLA / CLAURE, hoy solo Tienda Lima). Pedido del equipo
-- el 2026-11-15: «¿no se puede ver los medios de pago cuando selecciono CLAURE y CAYLA?»; eligió «exacto + reparto» (ADR-0665, act. 2026-11-15).
--
-- EL PROBLEMA. Con la empresa elegida, «Cómo se pagó» salía vacío: ADR-0532 y ADR-0665 descartaron partir los pagos porque «sería una estimación en
-- una venta mixta». Medido en producción el 2026-11-15 (Tienda LIM, del 23-oct al 14-nov): 71 ventas; 66 de una sola empresa y 4 mixtas pagadas con
-- UN solo medio, y en las 71 lo pagado es igual a lo cobrado de las líneas. En esas 70 (S/ 4,862 de S/ 4,960) se sabe EXACTO con qué medio se pagó lo
-- de cada empresa. Solo 1 venta (S/ 98) tiene prendas de las dos y se pagó con dos medios: ahí, y solo ahí, el reparto es una estimación.
--
-- LA REGLA (`fn_pago_de_la_empresa`). Lo pagado con un medio en una venta se reparte entre las empresas de sus líneas, en proporción a lo cobrado de cada
-- una (`venta_items.subtotal`, con la regla de la línea de ADR-0665: `fn_empresa_de_la_linea`). Por eso:
--   · Venta de una sola empresa: todo su pago es de ella. Exacto.
--   · Venta mixta con un solo medio: a cada empresa le toca exactamente lo cobrado de sus prendas. Exacto.
--   · Venta mixta con dos medios o más: cada medio se reparte por la proporción de lo cobrado. Estimado, y la lectura dice cuánto (`repartido`).
--   · Al céntimo, y cuadra de las dos maneras: la parte de una empresa que no es la casa se redondea sobre lo ACUMULADO de los medios (en orden de nombre)
--     y no medio por medio, así lo de esa empresa en todos los medios suma justo su parte de la venta (S/ 10 + 10 + 10 con 2/3 de CLAURE da 6.67, 6.66 y
--     6.67 = 20.00, no 20.01); la casa (CAYLA) se queda con el resto de cada medio, así CAYLA + CLAURE es SIEMPRE lo pagado con ese medio. Si la venta no
--     tiene líneas con valor, todo es de la casa (como el reembolso de `fn_reembolso_de_la_empresa`).
--
-- POR QUÉ UNA LECTURA NUEVA Y NO UN PARCHE A `fn_reporte_ventas_series`. Esa lectura y sus tres hermanas están en producción con un candado por su
-- cuerpo (md5) que también corre en las pruebas que vuelven a pegarlas; reescribirla obligaba a deshacer y rehacer su cuerpo en cada prueba. Una pieza
-- chica al lado (principio 3) no toca nada vivo: `fn_reporte_ventas_series` sigue devolviendo `pagos` vacío con la empresa, y la pantalla, cuando hay
-- empresa, le pregunta a esta. Sin empresa, esta lectura devuelve lo mismo que `pagos` de la serie (lo exige la prueba).
--
-- CÓMO PEGARLA EN PRODUCCIÓN (CLAUDE.md «Cómo aplicar SQL a producción»): una sola parte, con el prefijo `retail.`. Solo crea dos funciones: sin `alter`,
-- sin políticas ni `drop trigger`, así que no toma los candados de `auth` ni `storage`. Se puede pegar dos veces. Depende de `fn_empresa_de_la_linea` y
-- `fn_exigir_empresa_del_reporte` (20261114215000, en producción desde el 2026-11-14): si faltan, el candado de abajo aborta antes de crear nada.
-- La web llama a esta lectura solo con una empresa elegida y, si la base no la tiene todavía, «Cómo se pagó» dice que no se pudo leer: el resto del
-- reporte no depende de ella.

-- ============================== CANDADO (corre primero) ==============================
do $candado$
begin
  if to_regprocedure('retail.fn_empresa_de_la_linea(uuid)') is null
     or to_regprocedure('retail.fn_exigir_empresa_del_reporte(uuid,uuid)') is null
     or to_regprocedure('retail.fn_empresa_casa_id()') is null then
    raise exception 'Faltan los ayudantes de 20261114215000 (fn_empresa_de_la_linea, fn_exigir_empresa_del_reporte) o fn_empresa_casa_id: pega esa migración primero.';
  end if;
end
$candado$;

set lock_timeout = '3s';

-- ============================== La regla: cuánto de un pago es de una empresa ==============================

-- Cuánto de lo pagado con un medio (`p_metodo`) en una venta es de una empresa. INVOKER y en SQL llano, como `fn_empresa_de_la_linea`: las lecturas de
-- Reportes son INVOKER (las filtra la RLS) y una función `security definer` por fila las haría lentas (ADR-0622). Una empresa que no es la casa recibe,
-- en cada medio, la diferencia entre su parte redondeada de lo pagado HASTA ese medio y la de lo pagado ANTES (los medios en orden de nombre): así sus
-- partes suman justo su parte de la venta. La casa se queda con el resto de cada medio: la suma de todas las empresas es lo pagado con ese medio.
create or replace function retail.fn_pago_de_la_empresa(p_venta_id uuid, p_metodo text, p_empresa uuid)
returns numeric
language sql
stable
as $$
  with pm as (   -- lo pagado en la venta, por medio, con lo acumulado antes y hasta cada uno
    select x.metodo, x.monto,
           sum(x.monto) over (order by x.metodo) as hasta,
           sum(x.monto) over (order by x.metodo) - x.monto as antes
    from (select p.metodo, sum(p.monto) as monto from retail.venta_pagos p where p.venta_id = p_venta_id group by p.metodo) x
  ),
  l as (         -- lo cobrado de cada empresa en esa venta
    select retail.fn_empresa_de_la_linea(i.id) as empresa_id, sum(i.subtotal) as cobrado
    from retail.venta_items i
    where i.venta_id = p_venta_id
    group by 1
  ),
  t as (select coalesce(sum(l.cobrado), 0) as total from l),
  partes as (    -- la parte de cada empresa que no es la casa, en cada medio, al céntimo
    select l.empresa_id, pm.metodo,
           round(pm.hasta * l.cobrado / t.total, 2) - round(pm.antes * l.cobrado / t.total, 2) as parte
    from l cross join t cross join pm
    where t.total > 0 and l.empresa_id is not null and l.empresa_id is distinct from retail.fn_empresa_casa_id()
  )
  select case
           when (select t.total from t) <= 0 then
             case when p_empresa = retail.fn_empresa_casa_id() then coalesce((select pm.monto from pm where pm.metodo = p_metodo), 0) else 0 end
           when p_empresa = retail.fn_empresa_casa_id() then
             coalesce((select pm.monto from pm where pm.metodo = p_metodo), 0) - coalesce((select sum(partes.parte) from partes where partes.metodo = p_metodo), 0)
           else coalesce((select partes.parte from partes where partes.empresa_id = p_empresa and partes.metodo = p_metodo), 0)
         end
$$;

revoke all on function retail.fn_pago_de_la_empresa(uuid, text, uuid) from public, anon;
grant execute on function retail.fn_pago_de_la_empresa(uuid, text, uuid) to authenticated;

comment on function retail.fn_pago_de_la_empresa(uuid, text, uuid) is
  'ADR-0665 (act. 2026-11-15): cuánto de lo pagado con un medio en una venta es de una empresa, en proporción a lo cobrado de sus líneas. Exacto si la venta es de una empresa o se pagó con un medio; al céntimo, las partes de una empresa suman su parte de la venta y la casa se queda con el resto de cada medio.';

-- ============================== Ventas del mes: cómo se pagó, por empresa ==============================

create or replace function retail.fn_reporte_ventas_pagos(p_mes date, p_ubicacion uuid default null, p_empresa uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date;
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido: el mismo de `fn_reporte_ventas_series`
  v_pagos jsonb;
  v_repartido jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  perform retail.fn_exigir_empresa_del_reporte(p_empresa, p_ubicacion);

  v_ini := date_trunc('month', p_mes)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío

  with pv as (   -- lo pagado en cada venta del tramo, sumado por medio (dos pagos en efectivo de una venta son un solo efectivo)
    select p.venta_id, p.metodo, sum(p.monto) as monto
    from retail.ventas vt
    join retail.venta_pagos p on p.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_ini::timestamp at time zone 'America/Lima')
      and vt.created_at <  (v_fin::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
    group by p.venta_id, p.metodo
  ),
  pe as (        -- la parte de la empresa (sin empresa, todo)
    select pv.venta_id, pv.metodo,
           case when p_empresa is null then pv.monto else retail.fn_pago_de_la_empresa(pv.venta_id, pv.metodo, p_empresa) end as monto
    from pv
  ),
  mixtas as (    -- las ventas donde la parte es un reparto: líneas con valor de dos empresas o más, y dos medios o más
    select v.venta_id
    from (select distinct pv.venta_id from pv) v
    where (select count(distinct pv2.metodo) from pv pv2 where pv2.venta_id = v.venta_id and pv2.monto <> 0) > 1
      and (select count(distinct retail.fn_empresa_de_la_linea(i.id)) from retail.venta_items i where i.venta_id = v.venta_id and i.subtotal <> 0) > 1
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('metodo', t.metodo, 'monto', t.monto) order by t.monto desc, t.metodo), '[]'::jsonb)
       from (select pe.metodo, round(sum(pe.monto), 2) as monto from pe group by pe.metodo) t
      where p_empresa is null or t.monto <> 0),
    case when p_empresa is null then null else
      (select jsonb_build_object('ventas', count(*), 'monto', round(coalesce(sum(x.monto), 0), 2))
         from (select pe.venta_id, sum(pe.monto) as monto from pe where pe.venta_id in (select mixtas.venta_id from mixtas) group by pe.venta_id) x
        where x.monto <> 0)
    end
  into v_pagos, v_repartido;

  return jsonb_build_object('mes', v_ini, 'hoy', v_hoy, 'pagos', v_pagos, 'repartido', v_repartido);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_pagos(date, uuid, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_pagos(date, uuid, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_pagos(date, uuid, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: lo cobrado por medio de pago en el tramo del mes; con p_empresa, la parte de esa empresa (fn_pago_de_la_empresa) y, en `repartido`, cuánto de eso sale de ventas mixtas pagadas con dos medios o más (ADR-0665, act. 2026-11-15). Invoker; exige el módulo reportes_ventas.';
