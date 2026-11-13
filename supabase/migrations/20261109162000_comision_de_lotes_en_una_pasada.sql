-- ============================================================================
-- 20261109162000 — La comisión estimada de las máquinas, en una sola pasada (rendimiento de Finanzas, ADR-0622; diagnóstico del 2026-11-09)
--
-- EL PROBLEMA PRIMERO. El 2026-11-09 la base de producción (2 GB) llegó a 3,36 GB de memoria y cortó por tiempo `fn_resumen_finanzas`,
-- `fn_estado_resultados` y otras de Finanzas. Medido en producción (pg_stat_statements, solo lectura): `fn_resumen_finanzas` tarda 5,9 s en
-- promedio y toca ~256.000 bloques por llamada, aunque los datos son pocos (2.137 ventas desde el 28-sep). Ningún mes está cerrado, así que el
-- diario (`fn_asientos`) se arma de cero en cada pantalla, y la pieza más cara del diario es `fn_asientos_dinero_y_caja`: 1,5 s y 71.600
-- bloques para octubre y noviembre. Dentro de ella, `lotes_est` llamaba a `fn_pos_comision_lote` UNA VEZ POR LOTE (cuenta, día, sede y
-- medio: 157 lotes), y cada llamada volvía a recorrer todas las ventas de su día. Un día con tres sedes y dos medios se recorría seis veces.
--
-- LO QUE CAMBIA. `lotes_est` recorre los pagos del período UNA vez y suma la comisión de cada lote con la misma cuenta de
-- `fn_pos_comision_lote`, pago por pago. `rev_est` (la reversa el día del depósito) hacía lo mismo una vez por abono: ahora toma la comisión
-- de `comision_abonos`, otra sola pasada. La línea de `rev_est` que decide qué abono revierte (ADR-0629) no se toca. Tampoco
-- `fn_pos_comision_lote` (la usan otras seis funciones), ni tablas, datos, permisos o índices.
--
-- MEDIDO EN PRODUCCIÓN (solo lectura, octubre y noviembre): `lotes_est` 403 ms y 29.684 bloques → 70 ms y 3.361; `rev_est` 394 ms y
-- 30.642 bloques → 84 ms y 10.433. Juntas, ~800 ms → ~150 ms por cada vez que se arma el diario de esos dos meses.
--
-- IDÉNTICO. En producción, las consultas viejas y las nuevas dieron las MISMAS filas (`except all` en las dos direcciones = 0) y la misma
-- suma al céntimo: `lotes_est` en cuatro rangos (oct–nov, nov, sep–dic y un solo día) y `rev_est` en cinco (los mismos y uno sin abonos). Una máquina por cuenta (`pos_maquinas_cuenta_id_key`); si algún día
-- hubiera dos, las dos versiones suman igual (una vez por máquina con tarifa). `pnpm pruebas:comision-lotes` lo vuelve a comprobar en el CI.
--
-- ANTES DE PEGAR. Una sola parte: solo `create or replace function` (por los tres reemplazos anclados), sin políticas ni `alter`. Cada
-- reemplazo frena si su texto viejo no aparece exactamente una vez (alguien tocó `lotes_est` o `rev_est`) y no hace nada si ya está el
-- nuevo: se puede pegar dos veces. La última línea dice «QUEDÓ BIEN» si la función quedó con la cuenta nueva.
--
-- VOLVER ATRÁS. Pegar el reemplazo al revés (`scripts/pruebas/_deshacer_20261109162000.mjs` lo hace leyendo este archivo).
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

select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$    select l.cuenta_id, l.f, l.ubicacion_id, l.medio, retail.fn_pos_comision_lote(l.cuenta_id, l.f, l.ubicacion_id, l.medio) as estimada
      from (select distinct vp.cuenta_dinero_id as cuenta_id, (v.created_at at time zone 'America/Lima')::date as f, v.ubicacion_id, vp.metodo as medio
              from retail.venta_pagos vp
              join retail.ventas v on v.id = vp.venta_id
              join retail.pos_maquinas m on m.cuenta_id = vp.cuenta_dinero_id
             where p_todo and v.estado = 'completada' and not coalesce(v.es_prueba, false)
               and v.created_at >= (greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde))::timestamp at time zone 'America/Lima')
               and v.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')) l$a$,
$n$    -- 20261109162000: TODAS las comisiones del período en una sola pasada sobre los pagos, en vez de `fn_pos_comision_lote` lote por lote
    -- (cada lote volvía a recorrer las ventas de su día). Es la misma cuenta, pago por pago: la tarifa de la máquina vigente ese día para ese
    -- medio (como `fn_pos_tarifa`), sus días gratis del mes (`gratis_hasta_dia`), su % redondeado por pago, su IGV y su cargo fijo. Si cambia la regla
    -- de `fn_pos_comision_lote`, cambia también aquí: `pnpm pruebas:comision-lotes` compara las dos con datos de verdad.
    select p.cuenta_id, p.f, p.ubicacion_id, p.medio,
           coalesce(sum(round(p.monto * t.tasa_pct / 100, 2)
                        + case when t.igv_sobre_tasa then round(round(p.monto * t.tasa_pct / 100, 2) * retail.fn_tasa_igv(p.f), 2) else 0 end
                        + t.cargo_fijo) filter (where t.id is not null and extract(day from p.f) > t.gratis_hasta_dia), 0)::numeric as estimada
      from (select vp.cuenta_dinero_id as cuenta_id, (v.created_at at time zone 'America/Lima')::date as f, v.ubicacion_id, vp.metodo as medio, vp.monto, m.id as maquina_id
              from retail.venta_pagos vp
              join retail.ventas v on v.id = vp.venta_id
              join retail.pos_maquinas m on m.cuenta_id = vp.cuenta_dinero_id
             where p_todo and v.estado = 'completada' and not coalesce(v.es_prueba, false)
               and v.created_at >= (greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde))::timestamp at time zone 'America/Lima')
               and v.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')) p
      left join lateral (select t1.* from retail.pos_tarifas t1
                          where t1.maquina_id = p.maquina_id and t1.medio = p.medio and t1.vigente_desde <= p.f
                          order by t1.vigente_desde desc, t1.created_at desc limit 1) t on true
     group by p.cuenta_id, p.f, p.ubicacion_id, p.medio$n$, 1);

-- Lo mismo para la reversa del día del depósito: `rev_est` pedía `fn_pos_comision_lote` UNA VEZ POR ABONO (156 en octubre y noviembre).
-- `comision_abonos` suma de una pasada la comisión de los lotes que esos abonos cubren (las ventas entre el lote más viejo y el más nuevo
-- que se depositó en el período) y `rev_est` la toma de ahí. La línea que filtra la reversa (la regla del primer depósito) no cambia.
-- Medido en producción: 394 ms y 30.642 bloques → 84 ms y 10.433, con las mismas filas en cinco rangos.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$  rev_est as ($a$,
$n$  -- 20261109162000: la comisión de los lotes que cubre cada abono del período, en una sola pasada (la misma cuenta que `lotes_est`).
  comision_abonos as (
    select c.cuenta_id, c.f, c.ubicacion_id, c.medio,
           coalesce(sum(round(c.monto * t.tasa_pct / 100, 2)
                        + case when t.igv_sobre_tasa then round(round(c.monto * t.tasa_pct / 100, 2) * retail.fn_tasa_igv(c.f), 2) else 0 end
                        + t.cargo_fijo) filter (where t.id is not null and extract(day from c.f) > t.gratis_hasta_dia), 0)::numeric as estimada
      from (select vp.cuenta_dinero_id as cuenta_id, (v.created_at at time zone 'America/Lima')::date as f, v.ubicacion_id, vp.metodo as medio, vp.monto, m.id as maquina_id
              from (select min(a.fecha) as d0, max(a.fecha) as d1
                      from retail.pos_abonos_lotes a
                      join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id and d.estado = 'vigente'
                     where p_todo and d.fecha between p_desde and p_hasta) w
              join retail.ventas v on v.created_at >= (w.d0::timestamp at time zone 'America/Lima') and v.created_at < ((w.d1 + 1)::timestamp at time zone 'America/Lima')
              join retail.venta_pagos vp on vp.venta_id = v.id
              join retail.pos_maquinas m on m.cuenta_id = vp.cuenta_dinero_id
             where v.estado = 'completada' and not coalesce(v.es_prueba, false)) c
      left join lateral (select t1.* from retail.pos_tarifas t1
                          where t1.maquina_id = c.maquina_id and t1.medio = c.medio and t1.vigente_desde <= c.f
                          order by t1.vigente_desde desc, t1.created_at desc limit 1) t on true
     group by c.cuenta_id, c.f, c.ubicacion_id, c.medio
  ),
  rev_est as ($n$, 1);

select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$    select d.fecha as f, d.id as movimiento_id, a.clave, retail.fn_pos_comision_lote(a.cuenta_id, a.fecha, a.ubicacion_id, a.medio) as estimada
      from retail.pos_abonos_lotes a$a$,
$n$    select d.fecha as f, d.id as movimiento_id, a.clave, coalesce(ca.estimada, 0)::numeric as estimada
      from retail.pos_abonos_lotes a
      left join comision_abonos ca on ca.cuenta_id = a.cuenta_id and ca.f = a.fecha and ca.ubicacion_id = a.ubicacion_id and ca.medio = a.medio$n$, 1);

-- Comprobación: ya no queda ninguna llamada a `fn_pos_comision_lote` en el diario, y están las dos pasadas nuevas.
do $comprobar$
declare v_def text := pg_get_functiondef('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])'::regprocedure);
begin
  if position('retail.fn_pos_comision_lote(' in v_def) > 0 or position('20261109162000: TODAS las comisiones' in v_def) = 0
     or position('comision_abonos ca on ca.cuenta_id' in v_def) = 0 then
    raise exception '20261109162000: fn_asientos_dinero_y_caja no quedó con la comisión en una sola pasada (lotes y abonos).';
  end if;
end
$comprobar$;

select '20261109162000 · QUEDÓ BIEN: la comisión estimada de las máquinas se calcula en una sola pasada' as resultado;
