-- ============================================================================
-- 20261030170000_finanzas_lecturas_que_escalan.sql — CAYLA V2 (ADR-0583, Felipe 2026-10-30: «Finanzas está lento con poca información;
-- con mucha más será muchísimo más lento: tiene que ser escalable»)
--
-- EL PROBLEMA PRIMERO (medido en producción el 2026-10-30, solo lectura, con `pg_stat_statements` y cronómetro dentro de una transacción
-- que se deshizo). Con UN solo mes de datos (1.526 ventas, 8.771 líneas de diario) el Resumen de Finanzas tardaba 2,3 s de promedio y hasta 7 s.
-- Dos causas raíz, las dos en piezas que se llaman miles de veces y que crecen con el negocio:
--
--   1. `fn_item_es_de_claure(línea, sede, fecha)` (ADR-0560) se evalúa UNA VEZ POR LÍNEA DE VENTA en 31 lecturas (Rendimiento, el medidor de
--      confianza de Finanzas, el Observatorio, Análisis, el Plan de compra, la demanda, Frescura…). Su `exists` dejaba al planificador llamar a
--      `fn_dueno_de_la_linea` (que busca el movimiento de salida de la línea) ANTES de mirar si la sede es de las que opera CLAURE: en TRU y AQP,
--      donde la respuesta es siempre «no», pagaba ~200 µs por línea. 1.571 líneas de octubre en TRU: 335 ms solo en esa pregunta; la serie de
--      ventas de UNA tienda (`fn_rendimiento_serie`), 819 ms. Crece con cada venta.
--   2. `fn_diario(desde, hasta)` rearmaba SIEMPRE el diario vivo (`fn_asientos`) de TODO el rango y después descartaba lo de los meses cerrados.
--      Cerrar un mes no ahorraba nada: el Balance (`fn_bal_diario` desde el arranque hasta hoy) recorrería cada venta, gasto y movimiento de toda
--      la historia en cada lectura. Hoy son 240 ms por mes; en un año, 12 veces eso en cada Balance, y subiendo.
--
-- CÓMO (lo que cambia, sin cambiar ninguna cifra):
--   1. `fn_item_es_de_claure` pregunta primero lo barato —¿la sede es de CLAURE y la venta es de desde su arranque?— con un CASE (Postgres
--      garantiza el orden de un CASE) y solo entonces pregunta el dueño de la línea, con la MISMA condición de antes. Misma firma, mismos permisos.
--      Medido en producción con la versión nueva en `pg_temp`: TRU 335 → 57 ms, AQP 201 → 33 ms, LIM igual (ahí sí hay que preguntar el dueño).
--   2. `fn_diario` calcula el primer mes del rango que NO está cerrado entero para lo que se mira (la empresa y cada ubicación del alcance, activa
--      o no) y llama a `fn_asientos` solo desde ahí. Un mes cerrado entero ya se leía de `diario_cerrado`: todo lo que `fn_asientos` devolviera de
--      ese mes se descartaba por el `not exists` (cada fila es de la empresa o de una ubicación, y todas están cerradas). El diario es aditivo por
--      mes —`cerrar_periodo` congela exactamente `fn_asientos(inicio del mes, fin del mes)`—, así que empezar el vivo en un mes posterior da las
--      mismas filas de ahí en adelante. Un mes cerrado a medias (una sede sí, otra no) sigue el camino de siempre.
--      Comparado en producción (sin meses cerrados todavía): el mismo resultado, fila por fila (EXCEPT ALL en los dos sentidos = 0), para CAYLA
--      entera y para una sede. El camino de los meses cerrados lo prueba `pnpm pruebas:finanzas-lecturas-que-escalan` contra la fórmula de antes.
--
-- CONTRATO (Liskov): las dos funciones devuelven exactamente lo mismo que antes para cualquier entrada; solo cambia cuánto trabajo hacen.
--   NO HACE: no toca tablas, políticas, permisos ni ninguna otra función; no cambia el orden de las filas de `fn_diario`.
--   SE ROMPE SI: alguien hace que `fn_asientos` deje de ser aditivo por mes (una línea fechada en un mes que dependa del inicio del rango pedido):
--   ya rompería el cierre de mes, que congela mes por mes.
--
-- PEGADA EN PRODUCCIÓN el 2026-10-30 con el OK de Felipe (versión `20261030203931`); verificada: las dos funciones nuevas vivas, los permisos
-- iguales y `fn_finanzas_confianza` de ~629 a 162 ms.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN (solo `create or replace function`: sin `alter` de tablas en uso, sin políticas ni `drop
-- trigger`; ADR-0195 «Políticas y deadlocks»). Idempotente. Antes de reemplazar `fn_diario`, comprueba que la definición viva sea la que se leyó
-- el 2026-10-30 (el texto ancla aparece una vez); si alguien la cambió, ABORTA sin tocar nada. Con la web vieja o la nueva, igual.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- La definición viva de `fn_diario` tiene que ser la que se leyó (la del 20261017034000): si no, esta versión pisaría un cambio que no conoce.
do $$
declare
  v_def text := pg_get_functiondef('retail.fn_diario(date,date,uuid)'::regprocedure);
begin
  if position('v_vivo' in v_def) > 0 then
    return;   -- ya está pegada
  end if;
  if (length(v_def) - length(replace(v_def, 'from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a', ''))) / length('from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a') <> 1 then
    raise exception 'fn_diario cambió desde que se escribió esta migración (2026-10-30): regenérala desde su definición viva.';
  end if;
end $$;

-- ---------- 1. ¿Esta línea de venta es de CLAURE? Lo barato primero ----------
create or replace function retail.fn_item_es_de_claure(p_venta_item_id uuid, p_ubicacion_id uuid, p_creada timestamptz)
returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  -- ADR-0583: el CASE asegura el orden. Si la sede no es de CLAURE (o la venta es de antes de su arranque) la respuesta es «no» sin buscar el
  -- dueño de la línea; si lo es, la misma pregunta de siempre (ADR-0560).
  select case
    when not exists (
      select 1
        from retail.empresas e
        join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
       where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
         and (p_creada at time zone 'America/Lima')::date >= e.cuenta_corriente_desde) then false
    else exists (
      select 1
        from retail.empresas e
        join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
       where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
         and (p_creada at time zone 'America/Lima')::date >= e.cuenta_corriente_desde
         and retail.fn_dueno_de_la_linea(p_venta_item_id) = e.id)
  end
$$;

comment on function retail.fn_item_es_de_claure(uuid, uuid, timestamptz) is
  'ADR-0560 (interna): ¿esta línea de venta es de CLAURE? La sede es de las que CLAURE opera, la venta es de desde el arranque de su cuenta (empresas.cuenta_corriente_desde) y el dueño real de la línea (fn_dueno_de_la_linea) es CLAURE. La misma regla que fn_claure_ventas. ADR-0583: pregunta primero la sede y la fecha (lo barato) y solo entonces el dueño.';
revoke all on function retail.fn_item_es_de_claure(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------- 2. El diario: lo congelado se lee congelado, el vivo se rearma solo desde el primer mes abierto ----------
create or replace function retail.fn_diario(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table(fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text, congelado boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $function$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_ve_finanzas_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_planilla boolean := retail.fn_planilla_visible();
  v_vivo date;
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

  -- ADR-0583: el primer mes del rango que NO está cerrado entero para lo que se mira (la empresa y cada ubicación del alcance, activa o no). Lo
  -- anterior ya está todo en `diario_cerrado`: rearmarlo con `fn_asientos` era trabajo que el `not exists` de abajo tiraba entero. Si todo el
  -- rango está cerrado, `v_vivo` cae después de `p_hasta` y el diario vivo ni se llama.
  select coalesce(min(m.mes), (date_trunc('month', p_hasta) + interval '1 month')::date)
    into v_vivo
    from (select g::date as mes from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') g) m
   where not exists (select 1 from retail.periodos p where p.mes = m.mes and p.alcance = 'empresa' and p.estado = 'cerrado')
      or exists (select 1 from retail.ubicaciones u
                  where u.id = any (v_ubics)
                    and not exists (select 1 from retail.periodos p
                                     where p.mes = m.mes and p.alcance = 'ubicacion' and p.ubicacion_id = u.id and p.estado = 'cerrado'));

  return query
  with cerr as materialized (
    select p.mes, p.alcance, p.ubicacion_id, p.cierre_id
      from retail.periodos p
     where p.estado = 'cerrado' and p.alcance <> 'consolidado'
       and p.mes between date_trunc('month', p_desde)::date and p_hasta
  )
  select d.fecha, d.ubicacion_id, d.asiento, d.regla, d.cuenta, d.debe, d.haber, d.origen_tabla, d.origen_id, d.glosa, true
    from cerr c join retail.diario_cerrado d on d.cierre_id = c.cierre_id
   where d.fecha between p_desde and p_hasta
     and (v_todo or d.ubicacion_id = any (v_ubics))
     and (v_planilla or d.regla <> 'planilla')
  union all
  select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa, false
    from retail.fn_asientos(greatest(p_desde, v_vivo), p_hasta, p_ubicacion_id) a
   where v_vivo <= p_hasta
     and not exists (
     select 1 from cerr c
      where c.mes = date_trunc('month', a.fecha)::date
        and ((a.ubicacion_id is null and c.alcance = 'empresa') or (c.alcance = 'ubicacion' and c.ubicacion_id = a.ubicacion_id)))
   order by 1, 3, 6 desc, 5;
end $function$;
