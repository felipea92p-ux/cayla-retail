-- ============================================================================
-- 20261029030000 — Lo vendido de CLAURE no suma en Rendimiento, metas ni Comercial (ADR-0560; actividad 6b)
--
-- EL PROBLEMA PRIMERO. Rendimiento (¿cuánto vendió cada persona?), las metas del equipo, el panel Comercial y el «Tu día» de cada integrante suman todo lo cobrado
-- en la sede. En Tienda LIM se vende lo de CAYLA y lo de CLAURE (de Claudia) en la misma caja: una colaboradora de CAYLA «vende» lo de Claudia, su meta se llena con
-- plata que no es de CAYLA y el panel dice que Lima vende más de lo que vende CAYLA. Felipe (2026-10-28): «CLAURE no suma en Análisis, Rendimiento, metas…».
--
-- CONTRATO (Liskov)
--   PROMETE: las once funciones de abajo suman SOLO lo de CAYLA, con la regla de la actividad 6a (`fn_item_es_de_claure`: sede donde opera CLAURE, venta desde el
--            arranque de su cuenta y dueño real de la línea): una venta solo de CLAURE no cuenta como venta ni como ticket, una mixta cuenta por sus líneas de CAYLA, y
--            una devolución de una prenda de CLAURE no resta a CAYLA. Con una sede sin CLAURE, o antes del arranque, los resultados son EXACTAMENTE los de antes.
--            Funciones: Rendimiento (`fn_rendimiento_equipo`, `_detalle`, `_serie`), Metas (`fn_metas_equipo`), Comercial (`fn_comercial_sedes`,
--            `fn_comercial_colaboradoras`, `fn_comercial_horas`) y el «Tu día» (`fn_mis_ventas_del_dia`, `fn_mis_ventas_por_dia`).
--   ASUME:   (a) las metas (`fn_metas_por_dia`, `fn_parametros_caja`) siguen siendo las que Felipe cargó: la de la sede se compara ahora con lo de CAYLA solamente;
--            si Lima necesita otra meta para CAYLA sola, es decisión de Felipe; (b) las horas de cada persona no cambian.
--   FALLA:   igual que antes (cada función conserva sus candados).
--   NO HACE: no toca `fn_ventas_del_dia`, Caja, Historial ni el cierre (siguen mostrándolo todo); no toca ninguna tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029023000 (que crea `fn_item_es_de_claure`). Solo reemplazos anclados; sin tablas, políticas ni
-- `drop trigger`. Idempotente: si el reemplazo ya está, no hace nada. Si una función de producción no tiene el texto esperado, ABORTA sin cambiar nada y dice cuál.
-- SE ROMPE SI: una de las once funciones cambió en producción sin dejar archivo (no pude leer sus textos vivos: el aborto es el aviso).
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

-- ---------- 3. Rendimiento: ventas y soles de cada persona, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_rendimiento_equipo(date)',
$v$       and v.created_at >= v_desde
       and v.created_at < v_hasta
     group by v.ubicacion_id, v.asesora_id$v$,
$n$       and v.created_at >= v_desde
       and v.created_at < v_hasta
       -- ADR-0560 (6b): lo vendido de CLAURE no es de CAYLA (una venta solo de CLAURE ni cuenta como venta).
       and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
     group by v.ubicacion_id, v.asesora_id$n$,
1);

-- ---------- 4. Rendimiento: el detalle por día y hora ----------
select pg_temp.reemplazar('retail.fn_rendimiento_detalle(uuid, date, date)',
$v$       and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
     group by 1, 2$v$,
$n$       and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
       and not retail.fn_item_es_de_claure(vi.id, vt.ubicacion_id, vt.created_at)
     group by 1, 2$n$,
1);

-- ---------- 5. Rendimiento: la serie de la tienda contra su meta ----------
select pg_temp.reemplazar('retail.fn_rendimiento_serie(uuid, date, date)',
$v$           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
         group by 1
      ) v on v.dia = d::date$v$,
$n$           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
           and not retail.fn_item_es_de_claure(vi.id, vt.ubicacion_id, vt.created_at)
         group by 1
      ) v on v.dia = d::date$n$,
1);

-- ---------- 6. Metas: lo vendido por cada persona contra su meta ----------
select pg_temp.reemplazar('retail.fn_metas_equipo(date)',
$v$         and vt.created_at < (greatest((v_mes + interval '1 month')::date, v_hoy + 1)::timestamp at time zone 'America/Lima')
       group by 1, 2$v$,
$n$         and vt.created_at < (greatest((v_mes + interval '1 month')::date, v_hoy + 1)::timestamp at time zone 'America/Lima')
         and not retail.fn_item_es_de_claure(vi.id, vt.ubicacion_id, vt.created_at)
       group by 1, 2$n$,
1);

-- ---------- 7. Comercial: lo vendido por tienda (y lo devuelto) ----------
select pg_temp.reemplazar('retail.fn_comercial_sedes(date)',
$v$    where v.estado = 'completada'
      and v.created_at >= v_ts_desde
      and v.created_at <  v_ts_fin
    group by v.id, v.ubicacion_id, v.created_at$v$,
$n$    where v.estado = 'completada'
      and v.created_at >= v_ts_desde
      and v.created_at <  v_ts_fin
      and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
    group by v.id, v.ubicacion_id, v.created_at$n$,
1);

-- ---------- 7b. Comercial: lo devuelto, sin lo de CLAURE ----------
select pg_temp.reemplazar('retail.fn_comercial_sedes(date)',
$v$    where d.estado = 'aprobada'
      and d.aprobado_en >= v_ts_desde
      and d.aprobado_en <  v_ts_fin
    group by d.id, d.ubicacion_id, d.aprobado_en$v$,
$n$    where d.estado = 'aprobada'
      and d.aprobado_en >= v_ts_desde
      and d.aprobado_en <  v_ts_fin
      and not retail.fn_item_es_de_claure(vi.id, d.ubicacion_id, (select v2.created_at from retail.ventas v2 where v2.id = vi.venta_id))
    group by d.id, d.ubicacion_id, d.aprobado_en$n$,
1);

-- ---------- 8. Comercial: lo vendido por colaboradora ----------
select pg_temp.reemplazar('retail.fn_comercial_colaboradoras(date)',
$v$    where v.estado = 'completada'
      and v.created_at >= v_ts_mes
      and v.created_at <  v_ts_fin
    group by v.id, v.ubicacion_id, v.usuario_id, v.created_at$v$,
$n$    where v.estado = 'completada'
      and v.created_at >= v_ts_mes
      and v.created_at <  v_ts_fin
      and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
    group by v.id, v.ubicacion_id, v.usuario_id, v.created_at$n$,
1);

-- ---------- 9. Comercial: lo vendido por hora ----------
select pg_temp.reemplazar('retail.fn_comercial_horas(date)',
$v$  where v.estado = 'completada'
    and v.created_at >= v_ts_hoy
    and v.created_at <  v_ts_fin
  group by v.ubicacion_id, extract(hour from v.created_at at time zone 'America/Lima')$v$,
$n$  where v.estado = 'completada'
    and v.created_at >= v_ts_hoy
    and v.created_at <  v_ts_fin
    and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
  group by v.ubicacion_id, extract(hour from v.created_at at time zone 'America/Lima')$n$,
1);

-- ---------- 10. Mis ventas de hoy (el «Tu día» de una integrante): total y prendas solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_mis_ventas_del_dia(uuid)',
$v$    (select coalesce(sum(vi.subtotal), 0) from retail.venta_items vi where vi.venta_id = v.id),
    (select coalesce(sum(vi.cantidad), 0)::integer from retail.venta_items vi where vi.venta_id = v.id)
  from quien q$v$,
$n$    (select coalesce(sum(vi.subtotal), 0) from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)),
    (select coalesce(sum(vi.cantidad), 0)::integer from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
  from quien q$n$,
1);

-- ---------- 10b. Mis ventas de hoy: una venta solo de CLAURE no sale ----------
select pg_temp.reemplazar('retail.fn_mis_ventas_del_dia(uuid)',
$v$    and not coalesce(v.es_prueba, false)
    and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
  order by v.created_at desc;$v$,
$n$    and not coalesce(v.es_prueba, false)
    and (p_ubicacion_id is null or v.ubicacion_id = p_ubicacion_id)
    -- Una venta con algo de CLAURE y nada de CAYLA no es suya: no sale (una mixta sale por su parte de CAYLA).
    and (not exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at))
         or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)))
  order by v.created_at desc;$n$,
1);

-- ---------- 11. Mis ventas por día (su meta de hoy y del mes) ----------
select pg_temp.reemplazar('retail.fn_mis_ventas_por_dia(date, date)',
$v$           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
         group by 1
      ) v on v.dia = d::date$v$,
$n$           and vt.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')
           and not retail.fn_item_es_de_claure(vi.id, vt.ubicacion_id, vt.created_at)
         group by 1
      ) v on v.dia = d::date$n$,
1);

-- ---------- Que quedó como se prometió ----------
do $$
begin
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_comercial_colaboradoras(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_comercial_colaboradoras no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_comercial_horas(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_comercial_horas no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_comercial_sedes(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_comercial_sedes no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_metas_equipo(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_metas_equipo no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_mis_ventas_del_dia(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_mis_ventas_del_dia no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_mis_ventas_por_dia(date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_mis_ventas_por_dia no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_rendimiento_detalle(uuid, date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_rendimiento_detalle no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_rendimiento_equipo(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_rendimiento_equipo no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_rendimiento_serie(uuid, date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_rendimiento_serie no quedó sumando solo lo de CAYLA';
  end if;
end $$;
