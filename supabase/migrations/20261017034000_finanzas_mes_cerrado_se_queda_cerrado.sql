-- ============================================================================
-- 20261017034000_finanzas_mes_cerrado_se_queda_cerrado.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, G09; ADR-0433, actividad 9)
--
-- EL PROBLEMA PRIMERO. Cerrar un mes congela su diario (`diario_cerrado`) y le saca una huella: es lo que el contador recibe. Cuatro grietas
-- dejaban que ese número cambiara DESPUÉS, o que un registro se colara a media confirmación sin que nadie lo supiera:
--   1. `fn_estado_resultados` leía el diario VIVO (`fn_asientos`) y no el congelado (`fn_diario`, que ya existe y solo lo usaba el Balance):
--      lo que cambie en el diario vivo de un mes cerrado (una planilla de Dynamic corregida, un cambio hecho por fuera del sistema) movía el
--      Estado de resultados de un mes que el contador ya tiene, y el Balance y el Estado del MISMO mes dejaban de cuadrar entre sí.
--   2. `archivar_caja_prueba` (cambia el diario vivo: el cierre de la caja y su diferencia entran por su fecha) y `guardar_parametro_tributario`
--      (el IGV y el tope de la planilla de movilidad rigen hacia atrás) no pasaban por el candado de mes: un líder las usaba como puerta trasera.
--   3. El candado (`fn_exigir_mes_abierto`) miraba `periodos` con la foto de la sentencia que lo llama y sin ningún cerrojo compartido con
--      `cerrar_periodo`, que sí toma uno (`cierre_mes:<mes>`): un gasto con fecha del mes que se cierra, registrado mientras el cierre se
--      confirma, pasaba el candado (el cierre aún no era visible) y quedaba FUERA del diario congelado.
--   (El cuarto punto del informe —Dynamic puede volver a congelar períodos ya pagados— no se bloquea: el chequeo «huella» avisa; lo que cambia
--   es el texto de la web, que ya no culpa solo a Dynamic.)
--
-- CÓMO (lo que cambia el diseño, lente 1 y 5 de /rigor):
--   · Estado de resultados: un reemplazo anclado, `fn_asientos(` → `fn_diario(` en la CTE `a`. Para un mes ABIERTO `fn_diario` llama a
--     `fn_asientos` y la salida es idéntica; para uno cerrado lee lo congelado. Los contadores `sc` y `msc` (prendas y mermas sin costo) siguen
--     vivos A PROPÓSITO: son avisos de qué falta cargar, no cifras del cierre.
--   · Candado de mes con cerrojo: `fn_exigir_mes_abierto` pasa de STABLE a VOLATILE y, ANTES de mirar `periodos`, toma el cerrojo COMPARTIDO
--     (`pg_advisory_xact_lock_shared`) de cada mes cerrable del rango: quien registra espera a que termine un cierre en marcha, y un cierre
--     espera a quien está registrando. Al ser VOLATILE, la lectura de `periodos` que sigue toma una foto NUEVA (ya con el cierre confirmado:
--     el registro se rechaza) y `cerrar_periodo`, al despertar, ve el registro confirmado (queda dentro de lo congelado). Antes era una función
--     STABLE: aunque hubiera tomado el cerrojo, habría leído con la foto vieja. Solo se toma para meses YA terminados: una venta de hoy no
--     paga nada. El rango se acota a los 120 meses más recientes (un activo fijo llega a 60).
--   · `archivar_caja_prueba` llama al candado con las fechas de la caja (reemplazo anclado; abrir y cerrar la caja de hoy no se ve afectado).
--   · `guardar_parametro_tributario` llama a `fn_exigir_vigencia_sin_meses_cerrados` (nueva): el IGV y el tope de la planilla de movilidad rigen
--     desde su fecha hacia adelante, así que se rechaza una vigencia que alcance un mes ya cerrado (cualquier alcance). La UIT, el régimen y el
--     pago a cuenta no entran al diario, no se guardan. Un re-guardado del mismo valor ya confirmado sigue siendo un no-op.
-- Reemplazos anclados sobre la función VIVA (cada texto ancla aparece una vez o la migración aborta; si el texto nuevo ya está, no toca nada).
-- ORDEN: se pega después de la 8 (alcance) y ANTES de cerrar el primer mes: un mes cerrado antes de pegarla se lee, en el Estado de resultados, del diario vivo.
-- Verificado: `scripts/pruebas/finanzas_mes_cerrado.mjs` (incluye dos sesiones reales entrelazadas) y las suites de cierre de mes y de gastos.
-- Contra producción (solo lectura, 2026-10-16): `fn_exigir_mes_abierto` (md5 66ee8ad2…) y `fn_primer_mes_cerrado` (f95be278…) son idénticas a las de local, y los
-- anclajes de `fn_estado_resultados`, `archivar_caja_prueba` y `guardar_parametro_tributario` aparecen exactamente una vez; hoy hay 0 filas en `periodos`.
--
-- SE ROMPE SI: una vigencia retroactiva se guarda en el mismo instante en que se cierra el mes (el cerrojo no cubre los parámetros: son una
-- acción rara de Configuración y tomar 180 cerrojos por un IGV desde 2011 no se justifica; el chequeo «huella» del cierre lo avisaría).
--
-- Producción: sin `alter` de tablas en uso y sin políticas (ADR-0195, «Políticas y deadlocks»): se pega entera.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ── 1. El candado de mes toma el cerrojo compartido del cierre ───────────────────────────────────────────────────────────
create or replace function retail.fn_exigir_mes_abierto(p_ubicacion_id uuid, p_desde date, p_hasta date default null, p_para text default null, p_por text default null)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_mes date;
  v_ult date := (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date;
  v_tope date := least(date_trunc('month', coalesce(p_hasta, p_desde))::date, v_ult);
  -- Un rango largo (un activo fijo de 2014) se cubre desde el mes MÁS RECIENTE hacia atrás, hasta 120 meses: son los que se cierran.
  v_m date := greatest(date_trunc('month', p_desde)::date, (v_tope - interval '119 months')::date);
begin
  if p_desde is null then
    return;
  end if;
  -- El mismo cerrojo que toma `cerrar_periodo`, pero compartido: quien registra espera a que un cierre en marcha termine, y un cierre
  -- espera a quien está registrando. Solo los meses que ya pueden estar cerrados (un mes en curso no se cierra): lo de hoy no espera a nadie.
  -- La llave se escribe con to_char y no con `::text`: el texto de una fecha depende del DateStyle de la sesión, y dos sesiones con otro
  -- formato dejarían de esperarse en silencio.
  while v_m <= v_tope loop
    perform pg_advisory_xact_lock_shared(hashtextextended('cierre_mes:' || to_char(v_m, 'YYYY-MM-DD'), 0));
    v_m := (v_m + interval '1 month')::date;
  end loop;
  -- DESPUÉS del cerrojo: esta lectura toma una foto nueva (la función es VOLATILE) y ve un cierre que se confirmó mientras esperábamos.
  v_mes := retail.fn_primer_mes_cerrado(p_ubicacion_id, p_desde, p_hasta);
  if v_mes is null then
    return;
  end if;
  raise exception '% está cerrado%: reábrelo con motivo%.',
    retail.fn_texto_periodo(v_mes, case when p_ubicacion_id is null then 'empresa' else 'ubicacion' end, p_ubicacion_id),
    case when p_por is not null and v_mes > date_trunc('month', p_desde)::date then ' y ' || p_por else '' end,
    case when p_para is not null then ' para ' || p_para
         when p_por is not null and v_mes > date_trunc('month', p_desde)::date then ' para registrarlo'
         else ' o registra con fecha de ' || retail.fn_mes_nombre(retail.fn_hoy_lima()) end
    using errcode = 'P0001', hint = 'periodo_cerrado', detail = to_char(v_mes, 'YYYY-MM');
end
$fn$;

-- ── 1b. La misma llave en el cierre, y la puerta de las ventas, que llama al candado, deja de decirse STABLE ──────────────
select pg_temp.anclar('retail.cerrar_periodo(date, text, uuid)',
  $v$perform pg_advisory_xact_lock(hashtextextended('cierre_mes:' || v_mes::text, 0));$v$,
  $n$perform pg_advisory_xact_lock(hashtextextended('cierre_mes:' || to_char(v_mes, 'YYYY-MM-DD'), 0));$n$);

-- Se declaraba STABLE y desde ahora llama a una función VOLATILE que toma cerrojos: dicha STABLE, un SELECT que la evaluara por fila podría
-- correrla una sola vez o quitarla, y el cerrojo se perdería sin error. Solo la llaman disparadores por `perform`: no cambia nada más.
alter function retail.fn_exigir_venta_abierta(uuid, text) volatile;

-- ── 2. Una vigencia que alcanza un mes cerrado no se guarda ─────────────────────────────────────────────────────────────
create or replace function retail.fn_exigir_vigencia_sin_meses_cerrados(p_nombre text, p_desde date)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_mes date;
begin
  -- Solo el IGV y el tope de la planilla de movilidad entran al diario (la UIT, el régimen y el pago a cuenta se leen en Impuestos).
  if p_nombre is null or p_nombre not in ('igv', 'tope_planilla_movilidad') or p_desde is null then
    return;
  end if;
  v_mes := (select min(p.mes) from retail.periodos p where p.estado = 'cerrado' and p.mes >= date_trunc('month', p_desde)::date);
  if v_mes is null then
    return;
  end if;
  raise exception '% ya está cerrado: reábrelo con motivo para cambiar % desde esa fecha.',
    initcap(retail.fn_mes_nombre(v_mes))
      || case when extract(year from v_mes) <> extract(year from retail.fn_hoy_lima()) then ' ' || extract(year from v_mes)::int else '' end,
    case p_nombre when 'igv' then 'el IGV' else 'el tope de la planilla de movilidad' end
    using errcode = 'P0001', hint = 'periodo_cerrado', detail = to_char(v_mes, 'YYYY-MM');
end
$fn$;
revoke all on function retail.fn_exigir_vigencia_sin_meses_cerrados(text, date) from public, anon, authenticated;

select pg_temp.anclar('retail.guardar_parametro_tributario(text, date, numeric, text)',
  $v$-- clock_timestamp y no now(): dos correcciones en la misma transacción siguen teniendo un orden.$v$,
  $n$-- ADR-0433, actividad 9: una vigencia que alcanza un mes ya cerrado cambiaría lo que el contador recibió.
  perform retail.fn_exigir_vigencia_sin_meses_cerrados(p_nombre, p_vigente_desde);

  -- clock_timestamp y no now(): dos correcciones en la misma transacción siguen teniendo un orden.$n$);

-- ── 3. Archivar una caja de prueba de un mes cerrado pasa por el candado ─────────────────────────────────────────────────
select pg_temp.anclar('retail.archivar_caja_prueba(uuid)',
  $v$-- Una caja «abierta» archivada sin cerrarse sigue bloqueando el índice único de la$v$,
  $n$-- ADR-0433, actividad 9: el cierre de una caja y su diferencia entran al diario por su fecha; archivarla de un mes cerrado cambiaría su foto.
  perform retail.fn_exigir_mes_abierto(v_caja.ubicacion_id,
    (least(v_caja.abierta_en, coalesce(v_caja.cerrada_en, v_caja.abierta_en)) at time zone 'America/Lima')::date,
    (greatest(v_caja.abierta_en, coalesce(v_caja.cerrada_en, v_caja.abierta_en)) at time zone 'America/Lima')::date,
    'archivar esta caja de prueba');

  -- Una caja «abierta» archivada sin cerrarse sigue bloqueando el índice único de la$n$);

-- ── 4. El Estado de resultados lee lo congelado ─────────────────────────────────────────────────────────────────────────
select pg_temp.anclar('retail.fn_estado_resultados(date, date, uuid)',
  $v$a as materialized (select * from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id)),$v$,
  $n$-- ADR-0433, actividad 9: un mes cerrado se lee de su foto (`fn_diario`); uno abierto, del diario vivo (lo mismo que `fn_asientos`).
  a as materialized (select * from retail.fn_diario(p_desde, p_hasta, p_ubicacion_id)),$n$);

notify pgrst, 'reload schema';
