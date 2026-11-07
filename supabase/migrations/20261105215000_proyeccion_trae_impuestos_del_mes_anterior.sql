-- ============================================================================
-- 20261105215000 — La proyección trae el IGV y la renta del mes anterior (tarea 11 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. `fn_flujo_caja_proyeccion` solo miraba el mes en curso. El 4 de noviembre decía «IGV de noviembre, el 15 de
-- diciembre» y callaba lo de octubre, que vence entre el 12 y el 22 de noviembre. Pasaba la primera quincena de todos los meses, justo
-- cuando esa plata está por salir, y lo leen «¿Me alcanza?», Plata y el Resumen.
--
-- LA DECISIÓN. Una fila más de IGV y otra de renta por el mes anterior, en su propia CTE:
--   · CAE el día 15 o, pasado ese día, mañana (`greatest`): lo que no se pagó sigue por salir y nunca queda fuera de lo que viene.
--   · ATRASADA recién desde el día 23: SUNAT vence entre el 12 y el 22 según el último dígito del RUC, y el RUC no está cargado.
--   · SE RESTA lo pagado este mes con `pago_sunat` vigente, primero al IGV y lo que sobre a la renta. `movimientos_dinero` no dice de qué mes
--     es un pago: asumimos que lo pagado este mes es lo del mes anterior, que es lo que vence. La tarea 10 lo reemplaza por el mes real.
--   · LA RENTA PAGADA COMO GASTO NO SE RESTA: no pasa por `pago_sunat` (tarea 10). Esa fila sigue saliendo hasta fin de mes y lo dice su detalle.
-- No cambia el mes en curso ni el «día normal»: `salidas_diarias` ya excluía los impuestos.
--
-- SUPUESTO PARA EL CONTADOR: el día 15 es un punto medio, no el cronograma real. La tarea 10 lo cambia por el último dígito del RUC.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Se reescribe desde la definición viva cambiando cinco anclas; si una
-- no aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:flujo-caja`.
--
-- SE ROMPE SI: una migración futura recrea `fn_flujo_caja_proyeccion` copiando un texto viejo del repo (lo vigila la prueba 10e).
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

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$  v_claudia numeric := 0;$a$,
$n$  v_claudia numeric := 0;
  -- Tarea 11: lo del mes anterior, que vence este mes.
  v_mes_ant date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date;
  v_igv_ant numeric := 0;
  v_renta_ant numeric := 0;
  v_pagado_ant numeric := 0;$n$, 1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$    v_incluye_impuestos := true;$a$,
$n$    for v_fila in select coalesce(m.a_pagar, 0) as a_pagar, coalesce(m.base_ventas, 0) as base
                    from retail.fn_impuestos_igv_meses(v_mes_ant, v_mes_ant) m where m.mes = v_mes_ant loop
      v_igv_ant := v_fila.a_pagar;
      v_renta_ant := round(v_fila.base * coalesce((select t.valor from retail.fn_parametro_tributario('renta_pago_cuenta', v_mes - 1) t), 0), 2);
      exit;
    end loop;
    v_pagado_ant := coalesce((select sum(d.monto) from retail.movimientos_dinero d
                               where d.tipo = 'pago_sunat' and d.estado = 'vigente' and d.fecha >= v_mes and d.fecha <= v_hoy), 0);
    v_renta_ant := greatest(v_renta_ant - greatest(v_pagado_ant - v_igv_ant, 0), 0);
    v_igv_ant := greatest(v_igv_ant - v_pagado_ant, 0);
    v_incluye_impuestos := true;$n$, 1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$    v_incluye_impuestos := false;$a$,
$n$    v_igv_ant := 0;
    v_renta_ant := 0;
    v_incluye_impuestos := false;$n$, 1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$  salidas as ($a$,
$n$  -- Tarea 11: lo del mes anterior cae el día 15 o, si ya pasó, mañana. Atrasado recién pasado el día 22, el último posible según el RUC.
  impuestos_anteriores as (
    select 'impuesto'::text as tipo, 'igv:' || to_char(v_mes_ant, 'YYYY-MM') as id,
           greatest(v_mes + 14, v_ini) as fecha, (v_mes + 14) as vence,
           'IGV de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from v_mes_ant)::int] as titulo,
           'Lo que falta pagar del mes pasado. Vence entre el 12 y el 22 de este mes, según el último dígito del RUC.' as detalle,
           'impuestos'::text as clase, null::uuid as ubicacion_id, null::text as unidad, v_igv_ant as monto, (v_hoy > v_mes + 21) as atrasada
     where v_incluye_impuestos and v_igv_ant > 0
    union all
    select 'impuesto'::text, 'renta:' || to_char(v_mes_ant, 'YYYY-MM'),
           greatest(v_mes + 14, v_ini), (v_mes + 14),
           'Pago a cuenta de renta de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from v_mes_ant)::int],
           'Vence junto con el IGV. Si ya lo pagaste como gasto, sigue aquí hasta fin de mes.',
           'impuestos'::text, null::uuid, null::text, v_renta_ant, (v_hoy > v_mes + 21)
     where v_incluye_impuestos and v_renta_ant > 0
  ),
  salidas as ($n$, 1);

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$select * from planilla union all select * from impuestos$a$,
$n$select * from planilla union all select * from impuestos union all select * from impuestos_anteriores$n$, 1);
