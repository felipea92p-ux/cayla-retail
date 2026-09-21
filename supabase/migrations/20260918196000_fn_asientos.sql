-- 20260918196000_fn_asientos.sql — ADR-0109 (modelo C) y ADR-0120 (reglas), tarea 4
--
-- EL DIARIO DERIVADO. Las reglas de posteo viven AQUÍ, en un solo lugar de la base: esta función
-- LEE las tablas de origen (ventas, devoluciones, cambios, movimientos, gastos) y GENERA las líneas
-- debe/haber. No guarda nada y no toca ninguna operación de dinero. Cada línea trae de qué fila
-- salió (`origen_tabla`, `origen_id`) para poder auditarla. Al cerrar el mes (tarea 8) este mismo
-- diario se materializa en tablas inmutables; hasta entonces un mes abierto puede cambiar.
--
-- REGLAS IMPLEMENTADAS EN ESTA TAREA (las del manual contable, más los casos que V2 tiene y V1 no):
--   venta        cobro (101 efectivo · 104 yape/plin/transferencia · 105 tarjeta) contra 7011 + 4011,
--                y el costo sellado en la venta: 691 contra 201.
--   anulacion    revierte ingreso, IGV y cobro; el costo vuelve a 201 si la prenda es vendible, o pasa
--                a 659 (merma) si no lo es. Se asienta el día en que se ANULA, no el de la venta.
--   devolucion   revierte ingreso e IGV por el valor de las LÍNEAS devueltas (no por `reembolso_monto`,
--                que es libre y puede ser NULL); el costo vuelve a 201 (la prenda regresó al
--                inventario, aunque sea a cuarentena: la pérdida se reconoce cuando se resuelve).
--   cambio       la diferencia de precio como ingreso (o su reversa) y el ajuste de costo entre la
--                prenda vieja y la nueva.
--   merma        659 contra 201, valorizada al costo vigente EN ESA FECHA (`fn_costo_variante_al`).
--   gasto        la cuenta de su categoría (+ 4011 si trae IGV) contra 101 (efectivo) o 104.
-- FUERA (siguientes tareas): compras y pagos a proveedor (5-7), depósitos, abonos de tarjeta,
-- depreciación (10), Taller (12). Mientras no estén, este diario NO alcanza para un Balance.
--
-- CONVENCIONES QUE TODO LECTOR DEBE CONOCER
--   · La fecha de un asiento es la fecha DE LIMA del hecho (no la del servidor, que es UTC: de 7 pm a
--     medianoche en Lima ya es "mañana" para la base).
--   · Los precios de CAYLA incluyen IGV. La base sale de `total − round(total − total/(1+tasa), 2)`,
--     redondeando el IGV primero, igual que `registrar_venta` y `desgloseIgv`: así cuadra al centavo
--     con el comprobante. La tasa sale de `fn_tasa_igv(fecha de la venta)`.
--   · `costo_unitario = 0` significa "costo no cargado", no "costó cero": esas líneas no aportan
--     costo (la pantalla las cuenta aparte y avisa). Un margen inflado en silencio es peor que un aviso.
--   · Una devolución, un cambio o una anulación se asienta en la SEDE de la venta original, no donde se
--     procesó (mismo criterio que `fn_resumen_variantes`), y en el mes del HECHO, no en el de la venta:
--     así un mes ya cerrado no cambia retroactivamente.
--   · Un gasto con `ubicacion_id` nulo es "de la empresa": solo aparece en el consolidado.

set search_path = retail, public, extensions;

-- ---------- Ayudantes (una sola definición de cada cosa) ----------

-- A qué cuenta va un medio de cobro/reembolso. Yape, Plin y transferencia llegan al banco al instante
-- (decisión de Felipe, ADR-0109); solo la tarjeta espera en tránsito hasta que el banco la abona.
create function retail.fn_cuenta_de_medio(p_metodo text)
returns text
language sql
immutable
as $$
  select case p_metodo when 'efectivo' then '101' when 'tarjeta' then '105' else '104' end
$$;

-- Qué movimiento es una MERMA (pérdida de inventario). Misma definición que `fn_resumen_variantes` (ajuste
-- negativo con motivo 'merma', o salida de cuarentena botada/donada), MÁS los faltantes de conteo. NO entra
-- `cuarentena_devuelta_proveedor`: devolver al proveedor no es pérdida. Los sobrantes de conteo (ajuste
-- positivo) tampoco se reconocen. Una sola definición: la usan el diario y los avisos de la pantalla.
create function retail.fn_es_merma(p_tipo text, p_motivo text, p_cantidad integer)
returns boolean
language sql
immutable
as $$
  select (p_tipo = 'ajuste' and p_cantidad < 0 and p_motivo in ('merma', 'conteo'))
      or (p_tipo = 'salida' and p_motivo in ('cuarentena_se_boto', 'cuarentena_donada'))
$$;

-- El costo de una prenda EN un instante. `movimientos` no guarda valor, así que una merma se valoriza con esto:
--   1. el costo resultante del último cambio de costo hasta ese momento;
--   2. si aún no había cambiado, el costo que tenía ANTES del primer cambio posterior (`costo_anterior`) —
--      usar el costo actual sería usar un costo que todavía no existía;
--   3. si nunca cambió, el costo actual;   4. si no hay ninguno, 0 (= "sin costo cargado").
-- Es una aproximación honesta: solo las compras y la producción mueven el costo (`costo_historial`).
create function retail.fn_costo_variante_al(p_variante_id uuid, p_instante timestamptz)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select h.costo_resultante from retail.costo_historial h
      where h.variante_id = p_variante_id and h.created_at <= p_instante
      order by h.created_at desc limit 1),
    (select h.costo_anterior from retail.costo_historial h
      where h.variante_id = p_variante_id and h.created_at > p_instante
      order by h.created_at asc limit 1),
    (select v.costo from retail.variantes v where v.id = p_variante_id),
    0)
$$;

-- ---------- El diario ----------
-- CONTRATO. Promete: líneas debe/haber, cada asiento cuadrado por construcción (los descuadres por
-- datos corruptos se ven con `fn_asientos_descuadrados`), con su origen; `p_ubicacion_id` nulo devuelve
-- el consolidado (incluye "de la empresa"). `p_hasta` es INCLUSIVO. Asume: que las tablas de origen
-- tienen fecha y costo correctos; jamás las modifica. Solo líder.
create function retail.fn_asientos(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text,
  debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver el diario contable';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas del diario no es válido';
  end if;
  -- Límites en instantes reales (no en fechas): así se puede usar el índice por fecha.
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  -- ===== ventas del rango (incluye las luego anuladas: la venta ocurrió; la anulación revierte aparte)
  vt as (
    select v.id, v.ubicacion_id,
           (v.created_at at time zone 'America/Lima')::date as f,
           sum(vi.subtotal) as tot,
           sum(vi.costo_unitario * vi.cantidad) as costo
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
     where v.created_at >= v_ini and v.created_at < v_fin
       and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
     group by v.id, v.ubicacion_id, v.created_at
  ),
  vv as (
    select vt.*, round(vt.tot - vt.tot / (1 + retail.fn_tasa_igv(vt.f)), 2) as igv from vt
  ),
  l_venta as (
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id as asiento, 'venta'::text as regla,
           retail.fn_cuenta_de_medio(vp.metodo) as cuenta, vp.monto as debe, 0::numeric as haber,
           'ventas'::text as ot, vv.id as oid, 'Cobro (' || vp.metodo || ')' as glosa
      from vv join retail.venta_pagos vp on vp.venta_id = vv.id
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '7011', 0, vv.tot - vv.igv, 'ventas', vv.id, 'Venta neta de IGV'
      from vv where vv.tot - vv.igv > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '4011', 0, vv.igv, 'ventas', vv.id, 'IGV de la venta'
      from vv where vv.igv > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '691', vv.costo, 0, 'ventas', vv.id, 'Costo de lo vendido'
      from vv where vv.costo > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '201', 0, vv.costo, 'ventas', vv.id, 'Salida de mercadería'
      from vv where vv.costo > 0
  ),

  -- ===== anulaciones del rango (por la fecha en que se anuló)
  an as (
    select v.id, v.ubicacion_id,
           (v.anulado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta,
           sum(vi.subtotal) as tot,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') = 'vendible'), 0) as costo_ok,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      left join retail.venta_anulacion_items ai on ai.venta_item_id = vi.id
     where v.estado = 'anulada' and v.anulado_en >= v_ini and v.anulado_en < v_fin
       and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
     group by v.id, v.ubicacion_id, v.anulado_en, v.created_at
  ),
  aa as (
    select an.*, round(an.tot - an.tot / (1 + retail.fn_tasa_igv(an.f_venta)), 2) as igv from an
  ),
  l_anul as (
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id as asiento, 'anulacion'::text as regla,
           '7011'::text as cuenta, aa.tot - aa.igv as debe, 0::numeric as haber,
           'ventas'::text as ot, aa.id as oid, 'Reversa de la venta neta de IGV' as glosa
      from aa where aa.tot - aa.igv > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '4011', aa.igv, 0, 'ventas', aa.id, 'Reversa del IGV'
      from aa where aa.igv > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion',
           retail.fn_cuenta_de_medio(vp.metodo), 0, vp.monto, 'ventas', aa.id, 'Devolución del cobro (' || vp.metodo || ')'
      from aa join retail.venta_pagos vp on vp.venta_id = aa.id
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '201', aa.costo_ok, 0, 'ventas', aa.id, 'Vuelve a mercadería'
      from aa where aa.costo_ok > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '659', aa.costo_mal, 0, 'ventas', aa.id, 'Prenda no vendible: pasa a merma'
      from aa where aa.costo_mal > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '691', 0, aa.costo_ok + aa.costo_mal, 'ventas', aa.id, 'Reversa del costo de lo vendido'
      from aa where aa.costo_ok + aa.costo_mal > 0
  ),

  -- ===== devoluciones aprobadas del rango (por la fecha de aprobación)
  dv as (
    select d.id, v.ubicacion_id,
           (d.aprobado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta,
           coalesce(d.reembolso_metodo, 'efectivo') as metodo,
           sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad) as tot,
           sum(vi.costo_unitario * di.cantidad) as costo
      from retail.devoluciones d
      join retail.ventas v on v.id = d.venta_id
      join retail.devolucion_items di on di.devolucion_id = d.id
      join retail.venta_items vi on vi.id = di.venta_item_id
     where d.estado = 'aprobada' and d.aprobado_en >= v_ini and d.aprobado_en < v_fin
       and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
     group by d.id, v.ubicacion_id, d.aprobado_en, v.created_at, d.reembolso_metodo
  ),
  dd as (
    select dv.*, round(dv.tot - dv.tot / (1 + retail.fn_tasa_igv(dv.f_venta)), 2) as igv from dv
  ),
  l_devol as (
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id as asiento, 'devolucion'::text as regla,
           '7011'::text as cuenta, dd.tot - dd.igv as debe, 0::numeric as haber,
           'devoluciones'::text as ot, dd.id as oid, 'Reversa de la venta neta de IGV' as glosa
      from dd where dd.tot - dd.igv > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '4011', dd.igv, 0, 'devoluciones', dd.id, 'Reversa del IGV'
      from dd where dd.igv > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', retail.fn_cuenta_de_medio(dd.metodo), 0, dd.tot, 'devoluciones', dd.id, 'Reembolso (' || dd.metodo || ')'
      from dd where dd.tot > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '201', dd.costo, 0, 'devoluciones', dd.id, 'La prenda vuelve al inventario'
      from dd where dd.costo > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '691', 0, dd.costo, 'devoluciones', dd.id, 'Reversa del costo de lo vendido'
      from dd where dd.costo > 0
  ),

  -- ===== cambios del rango (diferencia de precio y de costo entre la prenda vieja y la nueva)
  cb as (
    select c.id, v.ubicacion_id,
           (c.created_at at time zone 'America/Lima')::date as f,
           c.diferencia, c.metodo_pago_diferencia as metodo,
           round(abs(c.diferencia) - abs(c.diferencia) / (1 + retail.fn_tasa_igv((c.created_at at time zone 'America/Lima')::date)), 2) as igv,
           -- Solo se ajusta el costo si AMBAS prendas tienen costo cargado: con una en 0 el "ajuste" sería
           -- el costo entero de la otra y fabricaría margen o pérdida.
           case when vi.costo_unitario > 0 and retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) > 0
                then (retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) - vi.costo_unitario) * c.cantidad
                else 0 end as dcosto
      from retail.cambios c
      join retail.venta_items vi on vi.id = c.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
     where c.created_at >= v_ini and c.created_at < v_fin
       and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
  ),
  l_cambio as (
    -- la clienta pagó de más: ingreso
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id as asiento, 'cambio'::text as regla,
           retail.fn_cuenta_de_medio(cb.metodo) as cuenta, cb.diferencia as debe, 0::numeric as haber,
           'cambios'::text as ot, cb.id as oid, 'Diferencia cobrada' as glosa
      from cb where cb.diferencia > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '7011', 0, cb.diferencia - cb.igv, 'cambios', cb.id, 'Diferencia neta de IGV'
      from cb where cb.diferencia > 0 and cb.diferencia - cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '4011', 0, cb.igv, 'cambios', cb.id, 'IGV de la diferencia'
      from cb where cb.diferencia > 0 and cb.igv > 0
    -- se le devolvió a la clienta: reversa de ingreso
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '7011', -cb.diferencia - cb.igv, 0, 'cambios', cb.id, 'Reversa neta de IGV'
      from cb where cb.diferencia < 0 and -cb.diferencia - cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '4011', cb.igv, 0, 'cambios', cb.id, 'Reversa del IGV'
      from cb where cb.diferencia < 0 and cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', retail.fn_cuenta_de_medio(cb.metodo), 0, -cb.diferencia, 'cambios', cb.id, 'Diferencia devuelta'
      from cb where cb.diferencia < 0
    -- ajuste de costo entre prendas
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '691', cb.dcosto, 0, 'cambios', cb.id, 'La prenda nueva cuesta más'
      from cb where cb.dcosto > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '201', 0, cb.dcosto, 'cambios', cb.id, 'Ajuste de mercadería'
      from cb where cb.dcosto > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '201', -cb.dcosto, 0, 'cambios', cb.id, 'Ajuste de mercadería'
      from cb where cb.dcosto < 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '691', 0, -cb.dcosto, 'cambios', cb.id, 'La prenda nueva cuesta menos'
      from cb where cb.dcosto < 0
  ),

  -- ===== mermas del rango (movimientos de pérdida de inventario)
  -- Qué es una merma: `fn_es_merma` (una sola definición).
  mm as (
    select m.id, m.ubicacion_id,
           (m.created_at at time zone 'America/Lima')::date as f,
           case when m.tipo = 'ajuste' and m.motivo = 'merma' then 'merma'
                when m.tipo = 'salida' then 'cuarentena'
                else 'conteo' end as origen,
           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin
       and (p_ubicacion_id is null or m.ubicacion_id = p_ubicacion_id)
       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
  ),
  l_merma as (
    select mm.f, mm.ubicacion_id, 'merma:' || mm.id as asiento, ('merma_' || mm.origen)::text as regla,
           '659'::text as cuenta, mm.valor as debe, 0::numeric as haber,
           'movimientos'::text as ot, mm.id as oid, 'Merma valorizada al costo de la fecha' as glosa
      from mm where mm.valor > 0
    union all
    select mm.f, mm.ubicacion_id, 'merma:' || mm.id, 'merma_' || mm.origen, '201', 0, mm.valor, 'movimientos', mm.id, 'Salida de mercadería'
      from mm where mm.valor > 0
  ),

  -- ===== gastos vigentes del rango (por la fecha del pago)
  l_gasto as (
    select g.fecha as f, g.ubicacion_id, 'gasto:' || g.id as asiento, 'gasto'::text as regla,
           c.cuenta_pcge::text as cuenta, g.monto_total - g.igv as debe, 0::numeric as haber,
           'gastos'::text as ot, g.id as oid, g.descripcion as glosa
      from retail.gastos g join retail.categorias_gasto c on c.codigo = g.categoria
     where g.estado = 'vigente' and g.fecha between p_desde and p_hasta
       and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
       and g.monto_total - g.igv > 0
    union all
    select g.fecha, g.ubicacion_id, 'gasto:' || g.id, 'gasto', '4011', g.igv, 0, 'gastos', g.id, 'IGV de la factura'
      from retail.gastos g
     where g.estado = 'vigente' and g.fecha between p_desde and p_hasta
       and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id) and g.igv > 0
    union all
    select g.fecha, g.ubicacion_id, 'gasto:' || g.id, 'gasto',
           case g.medio_pago when 'efectivo' then '101' else '104' end, 0, g.monto_total, 'gastos', g.id, 'Pago (' || g.medio_pago || ')'
      from retail.gastos g
     where g.estado = 'vigente' and g.fecha between p_desde and p_hasta
       and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
  ),

  todo as (
    select * from l_venta union all select * from l_anul union all select * from l_devol
    union all select * from l_cambio union all select * from l_merma union all select * from l_gasto
  )
  select t.f, t.ubicacion_id, t.asiento, t.regla, t.cuenta, t.debe, t.haber, t.ot, t.oid, t.glosa
    from todo t
   order by t.f, t.asiento, t.debe desc;
end;
$$;

-- Los asientos cuyo debe no es igual al haber. Debe estar SIEMPRE vacío: si no lo está, una fuente
-- tiene datos que no cuadran (típico: `venta_pagos` no suma lo que suman las líneas de la venta) y el
-- estado que se calcule encima miente. El Estado de Resultados lo muestra como aviso.
create function retail.fn_asientos_descuadrados(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (asiento text, regla text, debe numeric, haber numeric, diferencia numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede ver el diario contable';
  end if;
  return query
  select a.asiento, min(a.regla), sum(a.debe), sum(a.haber), sum(a.debe) - sum(a.haber)
    from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a
   group by a.asiento
  having round(sum(a.debe), 2) <> round(sum(a.haber), 2)
   order by 1;
end;
$$;

-- ---------- Permisos ----------
revoke all on function retail.fn_es_merma(text, text, integer) from public, anon, authenticated;
revoke all on function retail.fn_cuenta_de_medio(text) from public, anon, authenticated;
revoke all on function retail.fn_costo_variante_al(uuid, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_asientos(date, date, uuid) from public, anon;
revoke all on function retail.fn_asientos_descuadrados(date, date, uuid) from public, anon;
grant execute on function retail.fn_asientos(date, date, uuid) to authenticated;
grant execute on function retail.fn_asientos_descuadrados(date, date, uuid) to authenticated;

comment on function retail.fn_asientos(date, date, uuid) is
  'Diario derivado (ADR-0109/0120): genera las líneas debe/haber desde ventas, anulaciones, devoluciones, cambios, mermas y gastos. Única casa de las reglas de posteo. No guarda nada.';
