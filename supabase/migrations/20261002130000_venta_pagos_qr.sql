-- ============================================================================================================
-- QR como medio de cobro de una VENTA (cobro en hoja lateral, Felipe 2026-10-02).
--
-- La hoja de cobro de Vender ofrece seis medios: los cinco de siempre y el QR. Esta migración deja que una venta lo
-- registre y que el dinero cobrado con QR aparezca donde aparece el de Yape, Plin y la transferencia:
--   · `venta_pagos.metodo` acepta 'qr' (el candado que antes lo rechazaba entero). Se conserva 'anticipo' (el adelanto de
--     un apartado entregado, 20260923090000_separaciones.sql): rehacer el candado sin él rompería la entrega de apartados.
--   · `fn_acepta_pago_qr()`: la web pregunta por ella antes de mostrar el cuadrado QR. Si la función no existe (esta
--     migración aún no está en producción), la hoja sigue con los cinco medios: nunca ofrece algo que la base rechaza.
--   · Finanzas: el cobro con QR se sella solo en la cuenta de cobro de TRANSFERENCIA de la sede (`fn_cuenta_sellada` ya
--     manda ahí todo medio que no es Yape, Plin ni tarjeta; no hace falta tocarla). Lo que sí se toca, sumando 'qr':
--     `fn_dinero_libro` (el libro de las cuentas: los cobros con QR del día van en una línea «Cobros con QR · sede»),
--     `fn_flujo_caja_proyeccion` (lo cobrado en las últimas 8 semanas) y `fn_cuenta_sirve` (un banco sirve para QR).
--   · Solo VENTAS: Apartados, Cambios y Devoluciones siguen con los cinco medios (sus listas y candados no cambian).
--
-- Las tres funciones se copian TAL CUAL de su última versión en el repo (de donde se indica en cada una) y solo se les
-- agrega 'qr'; generado con un script que exige que cada reemplazo ocurra exactamente una vez.
--
-- PRODUCCIÓN: dos partes, cada una pegada por separado (regla «Políticas y deadlocks», ADR-0195). Ninguna crea
-- políticas. Idempotentes: se pueden volver a pegar.
-- ============================================================================================================

-- ============================== PARTE 1 · el candado de venta_pagos (sola) ==============================
set lock_timeout = '3s';
alter table retail.venta_pagos drop constraint if exists venta_pagos_metodo_check;
alter table retail.venta_pagos
  add constraint venta_pagos_metodo_check
  check (metodo in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'anticipo', 'qr'));

-- ============================== PARTE 2 · funciones ==============================
set lock_timeout = '3s';

create or replace function retail.fn_acepta_pago_qr() returns boolean
language sql stable set search_path = retail, public, extensions as $$
  select true;
$$;
comment on function retail.fn_acepta_pago_qr() is
  'Existe desde que venta_pagos acepta el QR (20261002120000). La hoja de cobro de Vender lo pregunta antes de ofrecer el cuadrado QR.';
grant execute on function retail.fn_acepta_pago_qr() to authenticated;

-- De 20260925150000_finanzas_cuenta_sellada.sql
create or replace function retail.fn_cuenta_sirve(p_clase text, p_medio text, p_tipo text) returns boolean
language sql immutable set search_path = retail, public, extensions as $$
  select case
    when p_medio = 'efectivo' and p_clase = 'cobro' then p_tipo = 'cajon'
    when p_medio = 'efectivo' then p_tipo in ('cajon', 'caja_fuerte', 'por_rendir')
    when p_medio = 'tarjeta' and p_clase = 'pago' then p_tipo in ('tarjeta_credito', 'banco')
    when p_medio = 'tarjeta' and p_clase = 'cobro' then p_tipo in ('por_abonar', 'banco')
    when p_medio in ('yape', 'plin', 'transferencia', 'deposito', 'otro', 'tarjeta', 'qr') then p_tipo = 'banco'
    else false
  end;
$$;

-- De 20260925150000_finanzas_cuenta_sellada.sql
create or replace function retail.fn_dinero_libro(p_hasta date)
returns table (cuenta_id uuid, fecha date, monto numeric, clave text, detalle text, ubicacion_id uuid, origen text)
language sql stable set search_path = retail, public, extensions as $$
  with tarjeta as (
    -- Deducción para lo viejo pagado «con tarjeta»: la primera tarjeta de crédito activa.
    select c.id from retail.cuentas_dinero c where c.tipo = 'tarjeta_credito' and c.archivada_en is null order by c.orden, c.created_at limit 1
  ),
  asignadas as (
    select a.origen, a.origen_id, a.cuenta_id from retail.cuentas_asignadas a
  ),
  movs as (
    select d.cuenta_destino_id as cuenta_id, d.fecha, d.monto::numeric as monto, 'mov:' || d.id::text as clave,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') as detalle, d.ubicacion_id, 'movimiento'::text as origen
      from retail.movimientos_dinero d
     where d.estado = 'vigente' and d.cuenta_destino_id is not null and d.fecha <= p_hasta
    union all
    select d.cuenta_origen_id, d.fecha, -(d.monto + d.comision), 'mov:' || d.id::text,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') ||
             case when d.comision > 0 then ' (incluye comisión S/ ' || to_char(d.comision, 'FM999999990.00') || ')' else '' end,
           d.ubicacion_id, 'movimiento'
      from retail.movimientos_dinero d join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
     where d.estado = 'vigente' and o.tipo <> 'cajon' and d.fecha <= p_hasta
  ),
  traslados as (
    select coalesce(t.cuenta_dinero_id,
             case t.destino
               when 'caja_fuerte' then (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = k.ubicacion_id)
               when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
               else coalesce((select x.cuenta_id from asignadas x where x.origen = 'traslado' and x.origen_id = t.id),
                             retail.fn_cuenta_de_cobro(k.ubicacion_id, 'transferencia', (t.creado_en at time zone 'America/Lima')::date))
             end) as cuenta_id,
           (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto::numeric as monto, 'traslado:' || t.id::text as clave,
           'Cierre de caja · ' || u.nombre || case t.destino when 'caja_fuerte' then ' → caja fuerte' when 'lider' then ' → entregado al líder' else ' → depósito' end
             || coalesce(' · ' || t.referencia, '') as detalle,
           k.ubicacion_id, 'traslado'::text as origen
      from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id join retail.ubicaciones u on u.id = k.ubicacion_id
     where not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_hasta
  ),
  cobros_base as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha, vp.metodo as medio, vp.monto::numeric as monto,
           vp.cuenta_dinero_id as sellada
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.metodo, sp.monto, sp.cuenta_dinero_id
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- La diferencia de un cambio ya trae el signo (la clienta paga + / se le devuelve −).
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date, cb.metodo_pago_diferencia, cb.diferencia, cb.cuenta_dinero_id
      from retail.cambios cb
     where cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia') and cb.diferencia <> 0
    union all
    select dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date, dv.reembolso_metodo, -dv.reembolso_monto, dv.reembolso_cuenta_id
      from retail.devoluciones dv
     where dv.estado = 'aprobada' and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
    union all
    -- F3b: el adelanto devuelto de un apartado (situación 10).
    select s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date, s.devolucion_medio_real, -s.adelanto, s.devolucion_cuenta_id
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en is not null and s.devolucion_medio_real in ('yape', 'plin', 'tarjeta', 'transferencia')
       and coalesce(s.adelanto, 0) > 0
  ),
  cobros as (
    -- Los cobros de un día con un medio en una tienda van en UNA línea por cuenta: así llegan al banco (el lote del Yape).
    select c.cuenta_id, c.fecha, sum(c.monto) as monto,
           'cobros:' || c.fecha::text || ':' || c.ubicacion_id::text || ':' || c.medio as clave,
           'Cobros con ' || case c.medio when 'yape' then 'Yape' when 'plin' then 'Plin' when 'qr' then 'QR' else c.medio end || ' · ' || u.nombre as detalle,
           c.ubicacion_id, 'cobros'::text as origen
      from (select b.ubicacion_id, b.fecha, b.medio, b.monto,
                   coalesce(b.sellada, retail.fn_cuenta_de_cobro(b.ubicacion_id, b.medio, b.fecha)) as cuenta_id
              from cobros_base b where b.fecha <= p_hasta) c
      join retail.ubicaciones u on u.id = c.ubicacion_id
     group by c.ubicacion_id, c.fecha, c.medio, u.nombre, c.cuenta_id
    having sum(c.monto) <> 0
  ),
  pagos as (
    -- Pagos de comprobantes de proveedor (mercadería, gasto o activo).
    select coalesce(cp.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'pago' and x.origen_id = cp.id),
                    case
                      when cp.metodo = 'tarjeta' then (select id from tarjeta)
                      when cp.metodo in ('yape', 'plin') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, cp.metodo, cp.fecha)
                      when cp.metodo in ('transferencia', 'deposito', 'otro') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, 'transferencia', cp.fecha)
                    end) as cuenta_id,
           cp.fecha, -cp.monto::numeric as monto, 'pago:' || cp.id::text as clave,
           'Pago a ' || pr.nombre || ' · ' || c.serie || '-' || c.numero as detalle, cp.ubicacion_id, 'pago'::text as origen
      from retail.compra_pagos cp
      join retail.compras c on c.id = cp.compra_id
      join retail.proveedores pr on pr.id = c.proveedor_id
     where cp.metodo <> 'saldo_a_favor' and cp.fecha <= p_hasta
       -- Lo viejo pagado del cajón con un gasto o activo (antes de F3b el pago no guardaba su cuenta): ya está en la caja.
       and not (cp.cuenta_dinero_id is null and cp.metodo = 'efectivo' and (
             exists (select 1 from retail.gastos g where g.compra_id = c.id and g.caja_movimiento_id is not null and g.estado = 'vigente')
          or exists (select 1 from retail.activos_fijos a where a.compra_id = c.id and a.caja_movimiento_id is not null and a.estado <> 'anulado')))
    union all
    -- F3b: pagos a proveedores del Taller (situación 12).
    select coalesce(pp.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'pagoprod' and x.origen_id = pp.id)),
           pp.fecha, -pp.monto::numeric, 'pagoprod:' || pp.id::text,
           'Pago del Taller a ' || prp.nombre || ' · ' || co.serie || '-' || co.numero, null::uuid, 'pago'
      from retail.comprobantes_produccion_pagos pp
      join retail.comprobantes_produccion co on co.id = pp.comprobante_id
      join retail.proveedores_produccion prp on prp.id = co.proveedor_id
     where pp.fecha <= p_hasta
    union all
    -- F3b: un proveedor devuelve plata (situación 6).
    select coalesce(pc.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'reembolso' and x.origen_id = pc.id)),
           pc.fecha, pc.monto::numeric, 'reembolso:' || pc.id::text,
           'Reembolso de ' || pv.nombre || coalesce(' · ' || pc.referencia, ''), null::uuid, 'reembolso'
      from retail.proveedor_creditos pc join retail.proveedores pv on pv.id = pc.proveedor_id
     where pc.tipo = 'reembolso' and pc.fecha <= p_hasta
    union all
    -- Gastos sin comprobante pagados sin cajón. La comisión del POS no: esa plata ya la descontó el abono.
    select coalesce(g.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'gasto' and x.origen_id = g.id),
                    case
                      when g.medio_pago = 'efectivo' then null
                      when g.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when g.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(g.ubicacion_id, g.medio_pago, g.fecha)
                      else retail.fn_cuenta_de_cobro(g.ubicacion_id, 'transferencia', g.fecha)
                    end),
           g.fecha, -g.monto_total, 'gasto:' || g.id::text, 'Gasto · ' || g.descripcion, g.ubicacion_id, 'gasto'
      from retail.gastos g
     where g.compra_id is null and g.estado = 'vigente' and g.caja_movimiento_id is null and g.fecha <= p_hasta
       and not exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = g.id)
    union all
    select coalesce(a.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'activo' and x.origen_id = a.id),
                    case
                      when a.medio_pago = 'efectivo' then null
                      when a.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when a.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(a.ubicacion_id, a.medio_pago, a.fecha_adquisicion)
                      else retail.fn_cuenta_de_cobro(a.ubicacion_id, 'transferencia', a.fecha_adquisicion)
                    end),
           a.fecha_adquisicion, -a.costo, 'activo:' || a.id::text, 'Activo · ' || a.nombre, a.ubicacion_id, 'activo'
      from retail.activos_fijos a
     where a.compra_id is null and a.estado <> 'anulado' and a.medio_pago is not null and a.caja_movimiento_id is null
       and a.fecha_adquisicion <= p_hasta
  ),
  todo as (
    select * from movs
    union all select * from traslados
    union all select * from cobros
    union all select * from pagos
  )
  select t.* from todo t
   where t.cuenta_id is null
      or not exists (select 1 from retail.cuentas_dinero c where c.id = t.cuenta_id and c.tipo = 'cajon');
$$;

-- De 20260925160000_finanzas_flujo_de_caja.sql
create or replace function retail.fn_flujo_caja_proyeccion(p_semanas integer default 6)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_ini date := retail.fn_hoy_lima() + 1;
  v_n integer := least(greatest(coalesce(p_semanas, 6), 1), 12);
  v_fin date;
  v_saldo numeric;
  v_minimo numeric;
  v_sal_cuenta numeric;
  v_sal_sin numeric;
  v_planilla_mes numeric;
  v_diarias numeric;
  v_out jsonb;
begin
  perform retail.fn_flujo_exigir_lider();
  v_fin := v_ini + 7 * v_n - 1;
  v_saldo := retail.fn_flujo_disponible(v_hoy);
  v_minimo := coalesce((retail.fn_parametros_finanzas() ->> 'minimo_caja')::numeric, 0);

  -- Lo que sale en un día normal: lo que salió los últimos 30 días (con lo que no dice de qué cuenta, que igual salió) más
  -- la planilla del último período, que Dynamic paga sin que baje de ningún banco aquí.
  select coalesce(-sum(l.monto) filter (where l.con_cuenta and retail.fn_flujo_lado(l.categoria) = 'sale'), 0),
         coalesce(-sum(l.monto) filter (where not l.con_cuenta and l.categoria <> 'cobros'), 0)
    into v_sal_cuenta, v_sal_sin
    from retail.fn_flujo_lineas(v_hoy - 29, v_hoy) l;
  select coalesce(sum(p.pagado), 0) into v_planilla_mes
    from retail.fn_flujo_planilla_pagada() p
   where p.fecha_fin = (select max(q.fecha_fin) from retail.fn_flujo_planilla_pagada() q);
  v_diarias := round((v_sal_cuenta + v_sal_sin + v_planilla_mes) / 30, 2);

  with
  dias as (select d::date as fecha from generate_series(v_ini, v_fin, interval '1 day') d),
  tiendas as (select u.id, u.nombre from retail.ubicaciones u where u.activo and u.tipo = 'tienda'),
  -- Lo cobrado en las últimas 8 semanas (56 días, 8 de cada día de la semana), para la tienda que no tiene meta.
  hist as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as dia, vp.monto::numeric as monto
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', 'qr')
       and v.created_at >= ((v_hoy - 56)::timestamp at time zone 'America/Lima') and v.created_at < (v_hoy::timestamp at time zone 'America/Lima')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.monto
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.created_at >= ((v_hoy - 56)::timestamp at time zone 'America/Lima') and sp.created_at < (v_hoy::timestamp at time zone 'America/Lima')
  ),
  promedio as (
    select h.ubicacion_id, extract(isodow from h.dia)::integer as dow, sum(h.monto) / 8 as monto from hist h group by 1, 2
  ),
  cobros as (
    select d.fecha, t.id as ubicacion_id, t.nombre as tienda,
           case when p.meta > 0 then p.meta else round(coalesce(pr.monto, 0) * (1 + coalesce(p.meta_pct, 0) / 100), 2) end as monto,
           case when p.meta > 0 then 'meta' else 'promedio' end as origen,
           coalesce(p.meta_pct, 0) as meta_pct,
           coalesce(p.campanas, '[]'::jsonb) as campanas
      from dias d
     cross join tiendas t
     cross join lateral retail.fn_parametros_caja(t.id, d.fecha) p
      left join promedio pr on pr.ubicacion_id = t.id and pr.dow = extract(isodow from d.fecha)::integer
  ),
  vencimientos as (
    select 'vencimiento'::text as tipo, v.origen || ':' || v.id::text as id,
           greatest(coalesce(v.vence, v_ini), v_ini) as fecha, v.vence,
           v.proveedor as titulo, v.documento || coalesce(' · ' || nullif(v.concepto, ''), '') as detalle,
           v.naturaleza as clase, v.ubicacion_id, v.unidades as unidad, v.saldo as monto,
           coalesce(v.vence < v_hoy, false) as atrasada
      from retail.fn_por_pagar_consolidado(null, v_fin, false) v
     where v.saldo > 0
  ),
  fijos as (
    select 'fijo'::text, f.id::text || ':' || to_char(m, 'YYYY-MM'),
           greatest(f.fecha_esperada, v_ini), f.fecha_esperada,
           f.descripcion, f.ubicacion_nombre || coalesce(' · ' || f.proveedor_nombre, ''),
           f.categoria, f.ubicacion_id, f.ubicacion_nombre, f.monto,
           (f.estado = 'falta')
      from generate_series(date_trunc('month', v_hoy), date_trunc('month', v_fin), interval '1 month') m
     cross join lateral retail.fn_gastos_fijos_mes(m::date) f
     where f.estado in ('por_llegar', 'falta') and greatest(f.fecha_esperada, v_ini) <= v_fin
  ),
  ultima as (select max(p.fecha_fin) as fin from retail.fn_flujo_planilla_pagada() p),
  planilla as (
    select 'planilla'::text, p.sede_codigo || ':' || to_char((u.fin + make_interval(months => k))::date, 'YYYY-MM'),
           greatest((u.fin + make_interval(months => k))::date, v_ini), (u.fin + make_interval(months => k))::date,
           'Planilla · ' || p.nombre, 'Como la del período que terminó el ' || to_char(u.fin, 'DD/MM'),
           'planilla', p.ubicacion_id, p.nombre, p.pagado,
           ((u.fin + make_interval(months => k))::date < v_hoy)
      from ultima u
      join retail.fn_flujo_planilla_pagada() p on p.fecha_fin = u.fin
     cross join generate_series(1, 15) k
     where (u.fin + make_interval(months => k))::date between v_hoy - 31 and v_fin
       and p.pagado > 0
  ),
  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla
  ),
  bloques as (select b.i, v_ini + 7 * b.i as desde, v_ini + 7 * b.i + 6 as hasta from generate_series(0, v_n - 1) b(i)),
  semanas as (
    select b.i, b.desde, b.hasta,
           coalesce((select sum(c.monto) from cobros c where c.fecha between b.desde and b.hasta), 0) as entra,
           coalesce((select sum(s.monto) from salidas s where s.fecha between b.desde and b.hasta), 0) as sale
      from bloques b
  ),
  con_saldo as (
    select s.*, v_saldo + sum(s.entra - s.sale) over (order by s.i) as saldo from semanas s
  )
  select jsonb_build_object(
    'hoy', v_hoy, 'desde', v_ini, 'hasta', v_fin, 'semanas_pedidas', v_n,
    'saldo_hoy', v_saldo, 'minimo_caja', v_minimo,
    'salidas_diarias', v_diarias,
    'dias_de_caja', case when v_diarias > 0 then greatest(floor(v_saldo / v_diarias), 0) end,
    'salidas_30', jsonb_build_object('con_cuenta', v_sal_cuenta, 'sin_cuenta', v_sal_sin, 'planilla', v_planilla_mes),
    'planilla_visible', retail.fn_flujo_planilla_visible(),
    'semanas', (select jsonb_agg(jsonb_build_object('desde', c.desde, 'hasta', c.hasta, 'entra', c.entra, 'sale', c.sale,
                                                     'saldo', c.saldo, 'bajo_minimo', c.saldo < v_minimo) order by c.i)
                  from con_saldo c),
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('fecha', c.fecha, 'ubicacion_id', c.ubicacion_id, 'tienda', c.tienda,
                                                            'monto', c.monto, 'origen', c.origen, 'meta_pct', c.meta_pct,
                                                            'campanas', c.campanas) order by c.fecha, c.tienda)
                          from cobros c), '[]'::jsonb),
    'salidas', coalesce((select jsonb_agg(jsonb_build_object('tipo', s.tipo, 'id', s.id, 'fecha', s.fecha, 'vence', s.vence,
                                                             'titulo', s.titulo, 'detalle', s.detalle, 'clase', s.clase,
                                                             'ubicacion_id', s.ubicacion_id, 'unidad', s.unidad, 'monto', s.monto,
                                                             'atrasada', s.atrasada) order by s.fecha, s.monto desc, s.id)
                           from salidas s), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
