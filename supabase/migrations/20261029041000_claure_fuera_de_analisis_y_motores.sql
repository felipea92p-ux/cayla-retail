-- ============================================================================
-- 20261029041000 — Lo vendido de CLAURE no suma en Análisis ni en los motores de decisión (ADR-0560; actividad 6d)
--
-- EL PROBLEMA PRIMERO. Análisis («¿qué hago hoy?»), el Plan del piso, la demanda, el plan de compra, la rentabilidad, la calidad por origen y la tienda web
-- deciden mirando lo que se vendió. En Tienda LIM se vende lo de CAYLA y lo de CLAURE (de Claudia) en la misma caja: una blusa de CLAURE que se vende mucho haría
-- que el plan de compra pida más de esa categoría para CAYLA, que Plan del piso le deje más lugar o que la tienda web destaque algo que CAYLA no tiene.
-- Felipe (2026-10-28): «CLAURE no suma en Análisis, Rendimiento, metas…».
--
-- CONTRATO (Liskov)
--   PROMETE: las trece funciones de abajo leen solo lo vendido de CAYLA, con la regla de 6a (`fn_item_es_de_claure`: sede donde opera CLAURE, venta desde el arranque de su
--            cuenta y dueño real de la línea). Con una sede sin CLAURE, o antes del arranque, los resultados son EXACTAMENTE los de antes. Funciones: Análisis
--            (`fn_analisis_sede`); lo vendido que leen el plan de compra, su propuesta y sus resultados (`fn_unidades_vendidas`, `fn_plan_compra`, `fn_historial_ventas`); los motores del
--            piso (`fn_piso_plan_lectura`, `fn_demanda_sede`, `fn_motor_demanda_preparacion`, `fn_frescura_decisiones`); `fn_rentabilidad`, `fn_calidad`,
--            `fn_costo_estimado_resumen` (lo que el Resumen de Finanzas estima de costo: la actividad 5 lo dejó fuera) y lo más vendido de la tienda web
--            (`fn_vitrina_probador`, `fn_vitrina_recortes`).
--   ASUME:   (a) lo que mira el LIBRO de movimientos y el STOCK por dueño (ADR-0542), y no la línea de venta, NO cambia aquí y queda como pendiente de Felipe: Frescura del piso
--            (`fn_frescura_sede`), el Resumen por variante y la comparación (`fn_resumen_variantes`, `fn_resumen_comparacion`), Pérdidas (`fn_perdidas_hechos`) y su calidad de dañadas
--            (`fn_calidad_danadas`), el reparto por proveedor (`fn_proveedor_reparto`) y las unidades de CLAURE que ocupan el piso (la capacidad del Plan del piso): cada una
--            necesita decidir qué pasa con las unidades de otro dueño en el mismo estante; (b) `fn_plan_compra_propuesta` y `fn_plan_compra_resultados` quedan sin sus CLAURE
--            porque leen `fn_unidades_vendidas`.
--   FALLA:   igual que antes (cada función conserva sus candados).
--   NO HACE: no toca ninguna tabla, ningún stock ni la regla de familias fuera de los motores (ADR-0377).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029035000. Solo reemplazos anclados; sin tablas, políticas ni `drop trigger`. Idempotente. Si una función de
-- producción no tiene el texto esperado, ABORTA sin cambiar nada y dice cuál (no pude leer los textos vivos). Son 20 reemplazos sobre 13 funciones: es la migración con más
-- probabilidad de abortar por un cambio de producción sin archivo; si pasa, el mensaje nombra la función y su ancla.
-- SE ROMPE SI: alguna de las trece funciones cambió en producción sin dejar archivo.
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

-- ---------- 3. Análisis: lo cobrado de cada prenda, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_analisis_sede(uuid)',
$v$      where v.ubicacion_id = p_ubicacion_id
        and v.estado = 'completada'
        and not v.es_prueba
        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    cambiado as ($v$,
$n$      where v.ubicacion_id = p_ubicacion_id
        and v.estado = 'completada'
        and not v.es_prueba
        -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA.
        and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    cambiado as ($n$,
1);

-- ---------- 4. Unidades vendidas (las leen el plan de compra y sus resultados): lo cobrado ----------
select pg_temp.reemplazar('retail.fn_unidades_vendidas(timestamp with time zone, timestamp with time zone)',
$v$     and v.created_at >= p_desde and v.created_at < p_hasta
  union all$v$,
$n$     and v.created_at >= p_desde and v.created_at < p_hasta
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
  union all$n$,
1);

-- ---------- 4b. Unidades vendidas: lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_unidades_vendidas(timestamp with time zone, timestamp with time zone)',
$v$   where p.estado in ('pendiente', 'cerrada_sin_prenda') and p.categoria_id is not null and retail.fn_categoria_entra_a_motores(p.categoria_id)
     and v.estado = 'completada' and not v.es_prueba
     and v.created_at >= p_desde and v.created_at < p_hasta$v$,
$n$   where p.estado in ('pendiente', 'cerrada_sin_prenda') and p.categoria_id is not null and retail.fn_categoria_entra_a_motores(p.categoria_id)
     and v.estado = 'completada' and not v.es_prueba
     and v.created_at >= p_desde and v.created_at < p_hasta
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)$n$,
1);

-- ---------- 5. Plan del piso: lo que se llevó el cliente, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_piso_plan_lectura(uuid)',
$v$        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')$v$,
$n$        and not exists (select 1 from retail.movimientos m
                         where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
        -- ADR-0560 (6d): lo vendido de CLAURE no es demanda de CAYLA.
        and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)$n$,
1);

-- ---------- 6. Demanda: las líneas cobradas, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$         and not exists (select 1 from retail.movimientos m
                          where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
    ),
    lineas as materialized ($v$,
$n$         and not exists (select 1 from retail.movimientos m
                          where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
         -- ADR-0560 (6d): lo vendido de CLAURE no es demanda de CAYLA.
         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
    ),
    lineas as materialized ($n$,
1);

-- ---------- 6b. Demanda: lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_demanda_sede(uuid, integer)',
$v$         and v.estado = 'completada' and not v.es_prueba
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and retail.fn_categoria_entra_a_motores(p.categoria_id)
       group by p.categoria_id, p.talla_id, co.familia_color$v$,
$n$         and v.estado = 'completada' and not v.es_prueba
         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
         and retail.fn_categoria_entra_a_motores(p.categoria_id)
         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
       group by p.categoria_id, p.talla_id, co.familia_color$n$,
1);

-- ---------- 7. Motor de demanda (¿ya puede recomendar?): ventas solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_motor_demanda_preparacion(uuid)',
$v$       and not exists (select 1 from retail.movimientos m
                        where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
       and retail.fn_categoria_entra_a_motores($v$,
$n$       and not exists (select 1 from retail.movimientos m
                        where m.venta_item_id = vi.id and m.motivo = 'cuarentena_liquidada')
       -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA.
       and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
       and retail.fn_categoria_entra_a_motores($n$,
1);

-- ---------- 8a. Plan de compra: la curva de tallas ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                      union all$v$,
$n$                         and vi.variante_id <> c_centinela and v.created_at >= v_curva_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$n$,
1);

-- ---------- 8b. Plan de compra: la curva, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()) z$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_curva_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) z$n$,
1);

-- ---------- 8c. Plan de compra: lo vendido dentro de las fechas de la campaña ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                      union all$v$,
$n$                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$n$,
1);

-- ---------- 8d. Plan de compra: la campaña, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts) q$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba
                         and v.created_at >= v_desde_ts and v.created_at < v_hasta_ts
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) q$n$,
1);

-- ---------- 8e. Plan de compra: lo vendido en 30 días ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                      union all$v$,
$n$                         and vi.variante_id <> c_centinela and v.created_at >= v_30_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
                      union all$n$,
1);

-- ---------- 8f. Plan de compra: 30 días, lo anotado «sin registrar» ----------
select pg_temp.reemplazar('retail.fn_plan_compra(uuid)',
$v$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()) t$v$,
$n$                         and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_30_desde and v.created_at < now()
                         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) t$n$,
1);

-- ---------- 9. Frescura: lo vendido desde cada decisión, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_frescura_decisiones(uuid, integer)',
$v$                and va.producto_id = s.producto_id and va.color_codigo is not distinct from s.color_codigo) end$v$,
$n$                and va.producto_id = s.producto_id and va.color_codigo is not distinct from s.color_codigo
                and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)) end$n$,
1);

-- ---------- 10. Historial del plan de compra: lo vendido por tienda y día, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_historial_ventas(date, date)',
$v$       where v.estado = 'completada' and not v.es_prueba
       group by 1, 2$v$,
$n$       where v.estado = 'completada' and not v.es_prueba
         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
       group by 1, 2$n$,
1);

-- ---------- 11. Rentabilidad: las líneas vendidas, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_rentabilidad(date, integer, numeric)',
$v$    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
  ),
  devuelto as ($v$,
$n$    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
      -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA (ni su costo ni su origen).
      and not retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
  ),
  devuelto as ($n$,
1);

-- ---------- 12. Calidad por origen: las líneas vendidas, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_calidad(date, integer, integer)',
$v$    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
  ),
  devuelto as ($v$,
$n$    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
      -- ADR-0560 (6d): lo vendido de CLAURE no es de CAYLA (no viene de su producción).
      and not retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
  ),
  devuelto as ($n$,
1);

-- ---------- 13. Costo estimado del Resumen de Finanzas: solo lo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_costo_estimado_resumen(date, date, uuid)',
$v$       and v.created_at >= v_ini and v.created_at < v_fin
       and v.ubicacion_id = any (v_ubics)$v$,
$n$       and v.created_at >= v_ini and v.created_at < v_fin
       and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
       and v.ubicacion_id = any (v_ubics)$n$,
1);

-- ---------- 14. Tienda web (fn_vitrina_probador): lo más vendido de los últimos 90 días, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_vitrina_probador()',
$v$         and not coalesce(v.es_prueba, false)
         and va.producto_id in (select pub.producto_id from pub)$v$,
$n$         and not coalesce(v.es_prueba, false)
         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
         and va.producto_id in (select pub.producto_id from pub)$n$,
1);

-- ---------- 14. Tienda web (fn_vitrina_recortes): lo más vendido de los últimos 90 días, solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_vitrina_recortes()',
$v$         and not coalesce(v.es_prueba, false)
         and va.producto_id in (select pub.producto_id from pub)$v$,
$n$         and not coalesce(v.es_prueba, false)
         and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)
         and va.producto_id in (select pub.producto_id from pub)$n$,
1);

-- ---------- Que quedó como se prometió ----------
do $$
begin
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_analisis_sede(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_analisis_sede no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_calidad(date, integer, integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_calidad no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_costo_estimado_resumen(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_costo_estimado_resumen no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_demanda_sede(uuid, integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_demanda_sede no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_frescura_decisiones(uuid, integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_frescura_decisiones no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_historial_ventas(date, date)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_historial_ventas no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_motor_demanda_preparacion(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_motor_demanda_preparacion no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_piso_plan_lectura(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_piso_plan_lectura no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_plan_compra(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_plan_compra no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_rentabilidad(date, integer, numeric)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_rentabilidad no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_unidades_vendidas(timestamp with time zone, timestamp with time zone)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_unidades_vendidas no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_vitrina_probador()'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_vitrina_probador no quedó sin lo de CLAURE';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_vitrina_recortes()'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_vitrina_recortes no quedó sin lo de CLAURE';
  end if;
end $$;
