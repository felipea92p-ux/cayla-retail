-- Ventas ▸ Reportes ▸ «CAYLA y CLAURE» (ADR-0667, Felipe 2026-11-15): las ventas de una tienda donde venden dos empresas (hoy Tienda LIM), separadas por
-- empresa, con el medio de pago, la cuenta donde entró cada cobro, el comprobante y las prendas de cada venta.
--
-- EL PROBLEMA. Felipe quería saber dónde está la plata de CLAURE: su tarjeta cae a Interbank Empresas mezclada con la de CAYLA (vía «Por depositar
-- Izipay») y su Yape al BCP. Reportes ya filtraba una empresa por vez (ADR-0665) y la cuenta con CLAURE (`fn_claure_cuenta`) ya calcula lo que se le debe,
-- pero ninguna pantalla mostraba las dos empresas lado a lado, por cuenta, con boleta o nota de venta, ni bajaba de la cifra a la venta y a la prenda.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) Una sola lectura con TODO lo de las ventas completadas (sin las de prueba) de una tienda entre dos días de Lima, ambos incluidos: cada venta
--            con su comprobante (el primero que la ampara: boleta, factura o nota de venta; nunca una nota de crédito), sus prendas con la empresa de cada línea
--            (`fn_empresa_de_la_linea`, la regla de Caja, Historial y Reportes) y sus pagos por medio, con la cuenta donde entraron y la parte de cada empresa
--            (`fn_pago_de_la_empresa`, la regla de «Cómo se pagó»); de cada cuenta, su tipo, si es de la casa y, si es la de una máquina del POS, el banco
--            al que abona (`pos_maquinas.banco_id`). (2) La suma de las partes de un pago es SIEMPRE lo pagado con ese medio (la casa se queda con
--            el resto, así lo hace `fn_pago_de_la_empresa`). (3) La comisión estimada del POS de lo cobrado con tarjeta o QR de cada empresa que NO es la casa
--            (la asume Claudia), con la misma tarifa y la misma agrupación por día, medio y cuenta que `fn_claure_filas`; `null` si la cuenta no tiene máquina.
--            (4) Sin `p_desde`, el período empieza el día en que la otra empresa empezó a vender aquí (`empresas.cuenta_corriente_desde`) y termina hoy (o
--            en `p_hasta`); la respuesta dice siempre ese día (`inicio`) y las fechas que de verdad usó (`desde`, `hasta`).
--   ASUME:   que quien llama tiene el módulo `reportes_ventas` y opera esa tienda (`fn_puede_operar_ubicacion`; el líder, todas), y que en la tienda operan dos
--            empresas o más (`fn_empresas_de_sede`): si no, no hay nada que separar y se rechaza (22023).
--   NO HACE: no escribe nada; no calcula lo que se le debe a CLAURE (eso es `fn_claure_cuenta`: suma pagos, gastos, devoluciones y cambios); no cuenta
--            devoluciones ni cambios (una venta devuelta sigue completada, como en «Ventas del mes»); no agrega cifras: la pantalla suma en `lib/` lo que la
--            base le entrega fila por fila, así todo total sale de las mismas filas que se ven al bajar al detalle.
--
-- POR QUÉ SECURITY DEFINER (y no INVOKER como las otras cuatro de Reportes). La cuenta donde entró un cobro sin cuenta escrita sale de
-- `fn_cuenta_de_cobro`, y la comisión de `fn_pos_comision_estimada`: las dos están cerradas a `authenticated`. Por eso esta función pregunta ella misma el
-- módulo y la tienda antes de leer nada, y es UNA sola llamada por pantalla (no una por fila: ADR-0622).
--
-- CUÁNTO PESA (números antes que opiniones). Tienda LIM vende ~100 ventas al mes (71 del 23-oct al 14-nov). El tope de 186 días son ~600 ventas y ~750
-- prendas: ~250 KB de jsonb y ~1,500 llamadas a `fn_pago_de_la_empresa` (cada una lee 2 a 4 filas por índice). Más que eso se pide por partes (22023).
--
-- CÓMO PEGARLA EN PRODUCCIÓN (CLAUDE.md «Cómo aplicar SQL a producción»): una sola parte, con el prefijo `retail.`. Solo crea una función: sin `alter`, sin
-- políticas ni `drop trigger`, así que no toma los candados de `auth` ni `storage`. Se puede pegar dos veces. Depende de `fn_pago_de_la_empresa`
-- (20261115013000) y de `fn_empresa_de_la_linea` (20261114215000): si faltan, el candado de abajo aborta antes de crear nada. Sin `select … into` dentro de
-- un texto entre comillas (ADR-0288). Vuelta atrás: `drop function retail.fn_reporte_ventas_por_empresa(date, date, uuid);` (nadie más la usa).
--
-- SE ROMPE SI: pasan más de seis meses desde que llegó CLAURE: «desde que llegó» pasa el tope y la lectura lo rechaza con su motivo (22023); entonces
-- se mira por mes o por fechas, o se sube el tope midiendo cuánto tarda. Y si una venta se paga con un mismo medio en dos cuentas distintas (dos tarjetas en dos máquinas): la lectura agrupa por medio y entonces no
-- sabe a cuál cuenta fue cada parte; lo dice con `cuenta_id = null` y `varias_cuentas = true`, y la pantalla lo muestra como «Varias cuentas», no lo adivina.

-- ============================== CANDADO (corre primero) ==============================
do $candado$
begin
  if to_regprocedure('retail.fn_pago_de_la_empresa(uuid,text,uuid)') is null
     or to_regprocedure('retail.fn_empresa_de_la_linea(uuid)') is null
     or to_regprocedure('retail.fn_empresa_casa_id()') is null
     or to_regprocedure('retail.fn_cuenta_de_cobro(uuid,text,date)') is null
     or to_regprocedure('retail.fn_pos_comision_estimada(uuid,text,numeric,integer,date)') is null then
    raise exception 'Faltan fn_pago_de_la_empresa (20261115013000), fn_empresa_de_la_linea (20261114215000), fn_cuenta_de_cobro o fn_pos_comision_estimada: pega esas migraciones primero.';
  end if;
end
$candado$;

set lock_timeout = '3s';

create or replace function retail.fn_reporte_ventas_por_empresa(p_desde date, p_hasta date, p_ubicacion uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_casa uuid := retail.fn_empresa_casa_id();
  v_empresas jsonb;
  v_ventas jsonb;
  v_comisiones jsonb;
  v_inicio date;         -- el primer día en que vende aquí la empresa que no es la casa (`empresas.cuenta_corriente_desde`)
begin
  if p_ubicacion is null then
    raise exception 'Falta la tienda del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  if not coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion), false) then
    raise exception 'No ves las ventas de esa tienda.' using errcode = '42501';
  end if;
  if (select count(*) from retail.fn_empresas_de_sede(p_ubicacion)) < 2 then
    raise exception 'En esa tienda vende una sola empresa: no hay nada que separar.' using errcode = '22023';
  end if;

  -- Sin fechas, el período es «desde que llegó la otra empresa» hasta hoy: la web no puede leer `empresas` (sin permiso) y por eso lo pide así.
  select min(e.cuenta_corriente_desde) into v_inicio
    from retail.empresas e
   where e.id in (select es.id from retail.fn_empresas_de_sede(p_ubicacion) es) and e.id is distinct from v_casa;
  if p_desde is null then
    if v_inicio is null then
      raise exception 'No se sabe desde cuándo vende aquí la otra empresa: elige las fechas.' using errcode = '22023';
    end if;
    p_desde := least(v_inicio, v_hoy);
    p_hasta := coalesce(p_hasta, v_hoy);
  end if;
  if p_hasta is null then
    raise exception 'Falta la fecha final del reporte.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'La fecha final es anterior a la inicial.' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 185 then
    raise exception 'Elige un período de seis meses o menos.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'clave', e.clave, 'nombre', e.nombre, 'casa', e.id = v_casa) order by e.orden, e.nombre), '[]'::jsonb)
    into v_empresas
    from retail.fn_empresas_de_sede(p_ubicacion) e;

  with vt as (   -- las ventas del tramo
    select v.id, v.created_at, (v.created_at at time zone 'America/Lima')::date as fecha
      from retail.ventas v
     where v.ubicacion_id = p_ubicacion
       and v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and v.created_at >= (p_desde::timestamp at time zone 'America/Lima')
       and v.created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima')
  ),
  pm as (        -- lo pagado en cada venta, por medio, con la cuenta donde entró (la escrita en el pago o la del medio en esa tienda ese día)
    select vt.id as venta_id, vt.fecha, p.metodo, sum(p.monto) as monto,
           count(distinct coalesce(p.cuenta_dinero_id, retail.fn_cuenta_de_cobro(p_ubicacion, p.metodo, vt.fecha))) as n_cuentas,
           min(coalesce(p.cuenta_dinero_id, retail.fn_cuenta_de_cobro(p_ubicacion, p.metodo, vt.fecha))::text)::uuid as cuenta_id
      from vt join retail.venta_pagos p on p.venta_id = vt.id
     group by vt.id, vt.fecha, p.metodo
  ),
  partes as (    -- la parte de cada empresa en cada medio de cada venta (suman lo pagado con ese medio)
    select pm.venta_id, pm.fecha, pm.metodo, pm.cuenta_id, pm.n_cuentas, e.id as empresa_id,
           retail.fn_pago_de_la_empresa(pm.venta_id, pm.metodo, e.id) as monto
      from pm cross join retail.fn_empresas_de_sede(p_ubicacion) e
  ),
  items as (
    select i.venta_id,
           jsonb_agg(jsonb_build_object(
             'id', i.id,
             'empresa_id', coalesce(retail.fn_empresa_de_la_linea(i.id), v_casa),
             'producto', pr.referencia,
             'codigo', coalesce(va.codigo, va.sku),
             'talla', ta.valor,
             'color', co.nombre,
             'color_hex', co.hex,
             'categoria', ca.nombre,
             'categoria_prefijo', ca.prefijo,
             'categoria_familia', ca.familia,
             'foto', (select f.url from retail.producto_fotos f
                       where f.producto_id = pr.id
                       order by (f.color_codigo = va.color_codigo) desc nulls last, f.es_principal desc nulls last, f.orden nulls last
                       limit 1),
             'cantidad', i.cantidad,
             'subtotal', i.subtotal
           ) order by i.subtotal desc, i.id) as lista
      from vt
      join retail.venta_items i on i.venta_id = vt.id
      left join retail.variantes va on va.id = i.variante_id
      left join retail.productos pr on pr.id = va.producto_id
      left join retail.categorias ca on ca.id = pr.categoria_id
      left join retail.tallas ta on ta.id = va.talla_id
      left join retail.colores co on co.codigo = va.color_codigo
     group by i.venta_id
  ),
  pagos as (
    select pm.venta_id,
           jsonb_agg(jsonb_build_object(
             'metodo', pm.metodo,
             'monto', pm.monto,
             'cuenta_id', case when pm.n_cuentas = 1 then pm.cuenta_id end,
             'cuenta', case when pm.n_cuentas = 1 then cd.nombre end,
             'cuenta_tipo', case when pm.n_cuentas = 1 then cd.tipo end,
             -- La cuenta es de la casa (CAYLA) o de otra empresa (el Yape de Claudia): lo que cae en una de CAYLA es lo que se le debe a la otra.
             'cuenta_de_la_casa', case when pm.n_cuentas = 1 then cd.empresa_id = v_casa end,
             -- Una cuenta «por depositar» (la de una máquina del POS) dice a qué banco abona: «Por depositar Izipay → Interbank Empresas».
             'abona_a', case when pm.n_cuentas = 1 then
                          (select b.nombre from retail.pos_maquinas m join retail.cuentas_dinero b on b.id = m.banco_id
                            where m.cuenta_id = pm.cuenta_id order by m.archivada_en nulls first, m.orden limit 1) end,
             'varias_cuentas', pm.n_cuentas > 1,
             'partes', (select coalesce(jsonb_object_agg(pa.empresa_id, pa.monto), '{}'::jsonb)
                          from partes pa where pa.venta_id = pm.venta_id and pa.metodo = pm.metodo and pa.monto <> 0)
           ) order by pm.monto desc, pm.metodo) as lista
      from pm left join retail.cuentas_dinero cd on cd.id = pm.cuenta_id
     group by pm.venta_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', vt.id,
           'creada', vt.created_at,
           'fecha', vt.fecha,
           'comprobante', (select jsonb_build_object('tipo', c.tipo, 'serie', c.serie, 'numero', c.numero)
                             from retail.comprobantes c
                            where c.venta_id = vt.id and c.tipo in ('boleta', 'factura', 'nota_venta')
                            order by c.created_at limit 1),
           'items', coalesce(it.lista, '[]'::jsonb),
           'pagos', coalesce(pg.lista, '[]'::jsonb)
         ) order by vt.created_at desc, vt.id), '[]'::jsonb)
    into v_ventas
    from vt left join items it on it.venta_id = vt.id left join pagos pg on pg.venta_id = vt.id;

  -- La comisión del POS de lo que cobró cada empresa que no es la casa, con la regla de `fn_claure_filas`: por día, medio y cuenta, con la tarifa de la
  -- máquina de esa cuenta y el cargo fijo por cada cobro.
  with vt as (
    select v.id, (v.created_at at time zone 'America/Lima')::date as fecha
      from retail.ventas v
     where v.ubicacion_id = p_ubicacion
       and v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and v.created_at >= (p_desde::timestamp at time zone 'America/Lima')
       and v.created_at <  ((p_hasta + 1)::timestamp at time zone 'America/Lima')
  ),
  pm as (
    select vt.id as venta_id, vt.fecha, p.metodo,
           min(coalesce(p.cuenta_dinero_id, retail.fn_cuenta_de_cobro(p_ubicacion, p.metodo, vt.fecha))::text)::uuid as cuenta_id,
           count(*)::integer as n_pagos
      from vt join retail.venta_pagos p on p.venta_id = vt.id
     where p.metodo in ('tarjeta', 'qr')
     group by vt.id, vt.fecha, p.metodo
  ),
  dia as (
    select e.id as empresa_id, pm.fecha, pm.metodo, pm.cuenta_id,
           sum(retail.fn_pago_de_la_empresa(pm.venta_id, pm.metodo, e.id)) as monto,
           sum(pm.n_pagos) filter (where retail.fn_pago_de_la_empresa(pm.venta_id, pm.metodo, e.id) <> 0)::integer as n_pagos
      from pm cross join retail.fn_empresas_de_sede(p_ubicacion) e
     where e.id is distinct from v_casa
     group by e.id, pm.fecha, pm.metodo, pm.cuenta_id
  ),
  estimada as (
    select d.empresa_id, d.metodo, d.cuenta_id, d.monto,
           (select retail.fn_pos_comision_estimada(m.id, d.metodo, round(d.monto, 2), d.n_pagos, d.fecha)
              from retail.pos_maquinas m where m.cuenta_id = d.cuenta_id order by m.archivada_en nulls first, m.orden limit 1) as comision
      from dia d
     where d.monto <> 0
  )
  select coalesce(jsonb_agg(jsonb_build_object('empresa_id', x.empresa_id, 'metodo', x.metodo, 'cuenta_id', x.cuenta_id, 'comision', x.comision)
                            order by x.empresa_id, x.metodo), '[]'::jsonb)
    into v_comisiones
    from (select es.empresa_id, es.metodo, es.cuenta_id,
                 case when bool_and(es.comision is not null) then sum(es.comision) end as comision
            from estimada es
           group by es.empresa_id, es.metodo, es.cuenta_id) x;

  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'hoy', v_hoy, 'inicio', v_inicio, 'empresas', v_empresas, 'ventas', v_ventas, 'comisiones', v_comisiones);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_por_empresa(date, date, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_por_empresa(date, date, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_por_empresa(date, date, uuid) is
  'Ventas ▸ Reportes ▸ CAYLA y CLAURE (ADR-0667): las ventas completadas de una tienda con dos empresas entre dos días de Lima, cada una con su comprobante, sus prendas (empresa de cada línea) y sus pagos por medio con la cuenta y la parte de cada empresa; más la comisión estimada del POS de la empresa que no es la casa. Security definer: exige reportes_ventas y la tienda.';
