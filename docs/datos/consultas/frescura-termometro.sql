-- ============================================================================
-- TERMÓMETRO SEMANAL DE FRESCURA — cuánto de cada tienda pasa por el ERP
-- 12 consultas de SOLO LECTURA contra producción (proyecto cayla-dynamic, schema retail).
-- ============================================================================
--
-- QUÉ ES. Frescura (cuántos días lleva una prenda en el piso sin venderse) solo puede leer lo
--   que el ERP registra. Si una venta queda solo en Alegra, la prenda sigue «colgada» en el ERP
--   para siempre y Frescura la pinta de rojo sin razón. Estas consultas miden cuánto de la tienda
--   real ve el ERP, si el libro de movimientos está sano y si ya hay muestra para las varas de
--   Frescura. Son también la vara con la que se mide cada arreglo del plan, antes y después.
--
-- CÓMO SE USA.
--   · SQL Editor del proyecto cayla-dynamic, UNA consulta a la vez, en una pestaña limpia. Primero
--     escribe esta línea y, debajo, pega la consulta desde su primera línea sin «--» hasta su punto
--     y coma:
--         set transaction read only;
--     Córrelas juntas (si resaltas, resalta las dos). Todas nombran sus tablas con `retail.`, así
--     que no hace falta `set search_path`. Con el MCP de Supabase (execute_sql) funcionan igual.
--   · Por qué esa línea: el SQL Editor corre todo lo pegado en UNA transacción y con permisos de
--     dueño, así que nada frena una escritura. Con la transacción en solo lectura, si alguien
--     cambiara una consulta para que escriba, Postgres la corta con el error 25006 («cannot execute
--     … in a read-only transaction») antes de tocar un dato. Que empiece por SELECT o WITH NO
--     basta: un WITH puede llevar un DELETE adentro, y un SELECT puede llamar a una función que
--     escribe (retail.recalcular_stock, por ejemplo). Probado en producción el 25-09: con esa línea
--     delante, transaction_read_only = on, y las 12 corren igual.
--   · La 01 y la 02 miran UNA semana de lunes a domingo, que se elige en su primera línea
--     (`semanas_atras`): 1 = la semana pasada (la de la rutina), 0 = la semana en curso.
--   · Todo día y todo mes se calcula en HORA DE LIMA (`AT TIME ZONE 'America/Lima'`). Las horas
--     sueltas (primer evento, llegadas, `foto`) el SQL Editor las muestra en UTC: réstales 5 horas.
--   · Cada resultado es una FOTO del momento en que la corres: se cuenta contra now() y la base
--     está viva (el 25-09 pasó de 2 a 7 ventas mientras se medía). Al guardar un resultado,
--     anota la fecha y la hora; la 01 la trae en su columna `foto`.
--
-- PROHIBIDO usarlo como LÍNEA BASE antes de 6 semanas desde el arranque de cada sede (esa fecha
--   todavía no existe en el ERP; mientras no exista, nada de esto es línea base). Las cifras
--   «Hoy:» de abajo son una foto del 25-09-2026 con 7 ventas, todas de TRU y en su 2.º día: sirven
--   para reconocer la forma del resultado, no para compararse contra ellas.
--
-- RUTINA DE LOS LUNES (Felipe, ~10 minutos).
--   1. En Alegra, anota el NÚMERO de comprobantes de venta (boletas, y facturas si hubo; sin las
--      anuladas) por sede y por día de la semana anterior, lunes a domingo.
--   2. Corre la consulta 01 (con semanas_atras = 1) y pon al lado, por sede y día, su columna
--      `ventas_en_erp`. Cada tienda sale con sus 7 días; un día sin ventas en el ERP sale con 0.
--   3. Alegra menos `ventas_en_erp` = la parte de la tienda que el ERP no ve. Se comparan CONTEOS,
--      no montos: una boleta es una venta en los dos sistemas, y la pregunta es cuántas ventas se
--      le escapan al ERP, no cuánta plata. Es una sola cifra por sede y día a propósito: si la
--      rutina pesa, se abandona, y con ella se pierde la señal más importante del plan.
--   4. Después, las que dicen «Cuándo: Cada lunes»: de la 02 a la 07 y, desde el arranque de cada
--      sede, también la 10 (la métrica de éxito se mira cada semana de la carrera). Una vez al mes,
--      la 08, la 09, la 10 y la 11. La 12, antes y después de pegar una migración de Frescura.
--   Por qué contra `ventas_en_erp` y no contra `ventas_emite_alegra`: hoy la pantalla de Vender no
--   le dice a la base quién emite (apps/web/components/PuntoDeVenta.tsx:926-958 arma los
--   parámetros de `registrar_venta` sin `p_emisor`, y ningún archivo de apps/web lo manda),
--   así que toda venta cae en el valor por
--   defecto 'retail' (docs/adr/0153-contrato-de-venta-ampliado-asesora-emisor-descuento-y-cola-sunat.md:60-69).
--   Mientras sea así, `emisor` no dice quién le dio la boleta a la clienta. Cuando el mostrador
--   ofrezca «La emite Alegra / La emite retail» (D-56), la resta pasa a ser: Alegra menos
--   `ventas_emite_alegra`.
--
-- SOBRE LA BAJADA (almacén → piso). Las consultas 02, 04, 05 y 07 reconocen una bajada por
--   motivo = 'movimiento_interno' con DESTINO el piso de venta (un retiro del piso va al revés y no
--   es bajada), tal como corrieron en producción. El motor de
--   Frescura (retail.fn_ledger_puntos) usa otra condición, estructural: retail.fn_es_traslado_interno,
--   un traslado cuyo origen y destino son la misma sede
--   (supabase/migrations/20260924030000_ledger_fuente_unica.sql:78-84). Hoy dan lo mismo: los 23
--   traslados de producción cumplen las dos (verificado el 25-09 a las 21:52 UTC). Si algún día
--   difieren, manda el motor, y estas cuatro consultas se corrigen para usar la función.
--
-- ORIGEN. Plan «Frescura del piso», tarea 1 (aprobada por Felipe el 25-09-2026). VERBATIM = la
--   consulta de la fase 1 del análisis, sin cambios; AJUSTADA = dice qué se le cambió. Las 12 se
--   verificaron en producción el 25-09-2026 entre las 21:51 y las 21:56 UTC: primero `explain`
--   (compila) y después la consulta tal cual.
--   REVISIÓN del mismo día. Se corrigieron la 01 y la 02 (no servían para la rutina: sin semana, sin
--   sede, sin ceros, y la 02 contaba devoluciones y cambios como ropa colgada sin bajada), la 05 (no medía
--   «Por colgar»), la 08 y la 09 (contaban la «Prenda sin registrar»; la 08, además, se cortaba en 50
--   filas), la 10 (ventana en hora UTC y con el mes más viejo a medias) y la 12 (no distinguía el
--   libro único). Cada «Origen» dice qué cambió. Las siete se volvieron a correr en producción entre
--   las 22:16 y las 22:19 UTC, con la transacción en solo lectura, y sus «Hoy:» dicen lo que dieron.
-- ============================================================================

-- ======================================================================
-- 01.
-- ¿Cuánto de cada tienda pasa por el ERP? Muestra, por sede y día (hora de Lima):
-- - las ventas y quién las emite (Alegra o retail);
-- - las unidades de catálogo;
-- - las que se cobraron como «Prenda sin registrar», que es catálogo que falta cargar
--   (variante centinela 22222222-…, la misma de apps/web/lib/cargo-especial.ts:16; ADR-0179);
-- - los soles.
-- Se compara con el número de comprobantes de Alegra de ese día (ver RUTINA DE LOS LUNES).
-- Cada tienda activa sale con TODOS los días de la semana, también los que el ERP no vio ninguna
-- venta: ese 0 es justo lo que la rutina busca («Alegra 12, ERP 0»). Si faltara la fila, no se
-- sabría si el ERP no vio nada o si la consulta falló.
-- Origen: NUEVA, no está en fase 1. Se armó con las columnas que fase 1 leyó (precio-completo #0 y #18).
-- Revisión del 25-09: antes partía de las ventas, así que un día sin ventas en el ERP no salía con 0,
-- simplemente no salía; y no tenía semana, así que con los meses devolvía todo el historial. Ahora
-- arma el calendario de la semana (`semanas_atras`) por tienda y cuelga de él las ventas.
-- Cuándo: Cada lunes, con semanas_atras = 1. También antes de marcar el arranque de cada sede.
-- Hoy: 25-09 (viernes), 22:16 UTC, con semanas_atras = 0 (del lunes 21-09 a hoy): 15 filas, 3 tiendas × 5 días.
-- Hoy: - Tienda TRU, 24-09: 1 venta, emitida por retail, 1 u., S/ 39,90;
-- Hoy: - Tienda TRU, 25-09: 6 ventas, las 6 emitidas por retail (0 por Alegra, 0 con número de boleta Alegra), 33 u., S/ 2 270,60;
-- Hoy: - TRU del 21 al 23-09, y los 5 días de AQP y de LIM: 0 ventas en el ERP.
-- Hoy: 0 prendas sin registrar. Con semanas_atras = 1 (14 a 20-09) salen 21 filas (3 tiendas × 7 días), todas en 0.
-- Hoy: Por qué 0 por Alegra aunque D-56 ponga «La emite Alegra» por defecto: la pantalla no manda
-- Hoy: `p_emisor` y la base usa su default 'retail' (ver RUTINA DE LOS LUNES). De esas 7 ventas, 2 tienen
-- Hoy: boleta aceptada en el entorno sandbox (no es SUNAT real) y 5 una nota de venta interna.
-- ======================================================================
WITH params AS (
  -- 1 = la semana pasada, de lunes a domingo (la de la rutina). 0 = la semana en curso, hasta hoy.
  SELECT 1 AS semanas_atras
), semana AS (
  SELECT (date_trunc('week', now() AT TIME ZONE 'America/Lima') - make_interval(weeks => p.semanas_atras))::date AS lunes,
         (now() AT TIME ZONE 'America/Lima')::date AS hoy
  FROM params p
), dias AS (
  SELECT d::date AS dia_lima
  FROM semana s,
       generate_series(s.lunes::timestamp, least(s.lunes + 6, s.hoy)::timestamp, interval '1 day') AS d
), v AS (
  SELECT v.id, v.ubicacion_id, (v.created_at AT TIME ZONE 'America/Lima')::date AS dia_lima, v.emisor, v.boleta_alegra_numero
  FROM retail.ventas v
  WHERE v.es_prueba = false AND v.estado = 'completada'
    AND (v.created_at AT TIME ZONE 'America/Lima')::date IN (SELECT dia_lima FROM dias)
), sedes AS (
  -- Toda tienda activa, haya vendido o no. Y cualquier otra ubicación que sí haya vendido esa semana
  -- (el taller, por ejemplo), para que ninguna venta se quede fuera de la cuenta.
  SELECT u.id, u.nombre
  FROM retail.ubicaciones u
  WHERE (u.tipo = 'tienda' AND u.activo) OR u.id IN (SELECT ubicacion_id FROM v)
)
SELECT s.nombre AS sede, d.dia_lima,
       count(DISTINCT v.id) AS ventas_en_erp,
       count(DISTINCT v.id) FILTER (WHERE v.emisor = 'alegra') AS ventas_emite_alegra,
       count(DISTINCT v.id) FILTER (WHERE v.boleta_alegra_numero IS NOT NULL) AS con_numero_boleta_alegra,
       count(DISTINCT v.id) FILTER (WHERE v.emisor = 'retail') AS ventas_emite_retail,
       coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id <> '22222222-2222-4222-8222-222222222222'), 0) AS unidades_de_catalogo,
       coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id = '22222222-2222-4222-8222-222222222222'), 0) AS unidades_prenda_sin_registrar,
       round(100.0 * coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id = '22222222-2222-4222-8222-222222222222'), 0) / nullif(sum(vi.cantidad), 0), 1) AS pct_prenda_sin_registrar,
       coalesce(round(sum((vi.precio_unitario - vi.descuento_unitario) * vi.cantidad), 2), 0) AS soles_cobrados,
       now() AS foto
FROM sedes s
CROSS JOIN dias d
LEFT JOIN v ON v.ubicacion_id = s.id AND v.dia_lima = d.dia_lima
LEFT JOIN retail.venta_items vi ON vi.venta_id = v.id
GROUP BY s.nombre, d.dia_lima
ORDER BY s.nombre, d.dia_lima;

-- ======================================================================
-- 02.
-- ¿El piso se llena por bajada o por ajuste directo? Por tienda y por semana, da el % de unidades que entraron al piso sin pasar por una bajada. Mide cuánto del piso se sigue cargando por ajuste en vez de por bajada.
-- Tres vías de entrada al piso, y solo dos cuentan en el porcentaje:
-- - bajada: traslado almacén → piso;
-- - sin bajada: ajustes positivos y entradas directas al piso. `uds_sin_bajada_por_motivo` las abre por
--   tipo:motivo, así que cada motivo sale con su propio nombre (p.ej. 'conteo_fisico' separado de
--   'reposicion'), sin que esta consulta tenga que adivinar los que se agreguen después;
-- - reingreso de una venta: la prenda vuelve al piso porque la clienta la devolvió o la cambió, o porque
--   se anuló la venta. Es un flujo correcto, no ropa colgada sin registrar: aprobar_devolucion y
--   registrar_cambio la graban como 'entrada' en el piso de venta
--   (supabase/migrations/20260922235000_candado_dinero_caja_cambios_devoluciones.sql:323-334 y
--   20260923110500_cambios_sin_candado_de_lider.sql:122,143-145) y anular_venta la devuelve a la
--   sububicación de donde salió (20260922151500_comprobantes_cola_de_reintento.sql:304-306). Por eso sale
--   en su propia columna y NO entra al porcentaje: si entrara, cada devolución subiría la cifra sola.
-- `pct_sin_bajada_desde_el_inicio` es la misma cuenta sobre toda la historia de la tienda: queda solo
-- como referencia, porque arrastra para siempre los ajustes viejos y no deja ver el cambio de una semana.
-- Diferencia con la 07: esa cuenta solo los ajustes al piso; esta suma también las entradas directas
-- (una recepción que llegara al piso). Hoy son lo mismo: ninguna entrada llega directo al piso.
-- Origen: AJUSTADA de fase 1 (registro-y-relojes #17), con tres cambios: 1) sale por tienda; 2) mira una
-- semana (`semanas_atras`) y deja la cifra acumulada como columna aparte; 3) separa el reingreso de una
-- venta y abre lo que entró sin bajada por motivo. Reconoce la bajada por el motivo
-- 'movimiento_interno'; el motor usa fn_es_traslado_interno, y hoy dan lo mismo (ver SOBRE LA BAJADA).
-- Cuándo: Cada lunes (semanas_atras = 1), y antes y después de cualquier cambio al ajuste o a la bajada al piso.
-- Hoy: 25-09, 22:17 UTC, con semanas_atras = 0 (semana del 21-09):
-- Hoy: - TRU: 22 variantes solo por bajada (100 u.), 14 solo sin bajada (92 u., las 92 «ajuste:reposicion»),
-- Hoy:   0 mixtas y 0 u. de reingreso. El 47,9 % del piso entró sin bajada, igual que desde el inicio, porque
-- Hoy:   toda la historia de piso de TRU cae en esta semana;
-- Hoy: - AQP y LIM: todo en 0 y el porcentaje vacío (no hubo nada que dividir).
-- Hoy: A las 15:16 UTC del 25-09 era 62,2 %: bajó porque ese día se registraron 14 bajadas más, no porque
-- Hoy: se corrigieran los 14 ajustes (siguen siendo los de la terminal «Almacén Trujillo» del 24-09, entre
-- Hoy: las 16:23 y las 16:29 UTC).
-- ======================================================================
with params as (
  -- 1 = la semana pasada, de lunes a domingo (la de la rutina). 0 = la semana en curso, hasta ahora.
  select 1 as semanas_atras
), semana as (
  -- Lunes 00:00 y el lunes siguiente 00:00, en hora de Lima.
  select (date_trunc('week', now() at time zone 'America/Lima') - make_interval(weeks => p.semanas_atras)) at time zone 'America/Lima' as desde,
         (date_trunc('week', now() at time zone 'America/Lima') - make_interval(weeks => p.semanas_atras - 1)) at time zone 'America/Lima' as hasta
  from params p
), entradas_piso as (
  -- Todo lo que sumó unidades al piso de venta, con la vía por la que llegó (ver arriba).
  select m.ubicacion_id, m.variante_id, m.tipo, m.motivo, m.cantidad, m.created_at,
         case when m.tipo = 'traslado' then 'bajada'
              when m.tipo = 'entrada' and m.motivo in ('devolucion', 'cambio', 'anulacion_venta') then 'reingreso'
              else 'sin_bajada' end as via
  from retail.movimientos m
  join retail.sububicaciones s
    on s.tipo = 'piso_venta'
   and s.id = case when m.tipo = 'traslado' then m.sububicacion_destino_id else m.sububicacion_id end
  where (m.tipo = 'traslado' and m.motivo = 'movimiento_interno')
     or (m.tipo in ('ajuste', 'entrada') and m.cantidad > 0)
), de_la_semana as (
  select e.* from entradas_piso e, semana w
  where e.created_at >= w.desde and e.created_at < w.hasta
), por_variante as (
  select ubicacion_id, variante_id,
         coalesce(sum(cantidad) filter (where via = 'bajada'), 0) as bajada,
         coalesce(sum(cantidad) filter (where via = 'sin_bajada'), 0) as sin_bajada
  from de_la_semana group by 1, 2
), por_sede as (
  select ubicacion_id,
         count(*) filter (where bajada > 0 and sin_bajada = 0) as variantes_solo_por_bajada,
         count(*) filter (where bajada = 0 and sin_bajada > 0) as variantes_solo_sin_bajada,
         count(*) filter (where bajada > 0 and sin_bajada > 0) as variantes_mixtas,
         sum(bajada) as uds_por_bajada,
         sum(sin_bajada) as uds_sin_bajada
  from por_variante group by 1
), por_motivo as (
  select ubicacion_id, string_agg(tipo || ':' || coalesce(motivo, '-') || ' = ' || uds, ', ' order by uds desc, tipo, motivo) as detalle
  from (select ubicacion_id, tipo, motivo, sum(cantidad) as uds from de_la_semana where via = 'sin_bajada' group by 1, 2, 3) x
  group by 1
), reingreso as (
  select ubicacion_id, sum(cantidad) as uds from de_la_semana where via = 'reingreso' group by 1
), acumulado as (
  select ubicacion_id,
         round(100.0 * coalesce(sum(cantidad) filter (where via = 'sin_bajada'), 0)
               / nullif(sum(cantidad) filter (where via in ('bajada', 'sin_bajada')), 0), 1) as pct
  from entradas_piso group by 1
)
select u.nombre as sede,
       (select (desde at time zone 'America/Lima')::date from semana) as semana_del_lunes,
       coalesce(ps.variantes_solo_por_bajada, 0) as variantes_solo_por_bajada,
       coalesce(ps.variantes_solo_sin_bajada, 0) as variantes_solo_sin_bajada,
       coalesce(ps.variantes_mixtas, 0) as variantes_mixtas,
       coalesce(ps.uds_por_bajada, 0) as uds_por_bajada,
       coalesce(ps.uds_sin_bajada, 0) as uds_sin_bajada,
       pm.detalle as uds_sin_bajada_por_motivo,
       coalesce(r.uds, 0) as uds_reingreso_de_venta,
       round(100.0 * ps.uds_sin_bajada / nullif(ps.uds_por_bajada + ps.uds_sin_bajada, 0), 1) as pct_piso_sin_bajada,
       ac.pct as pct_sin_bajada_desde_el_inicio,
       now() as foto
from retail.ubicaciones u
left join por_sede ps on ps.ubicacion_id = u.id
left join por_motivo pm on pm.ubicacion_id = u.id
left join reingreso r on r.ubicacion_id = u.id
left join acumulado ac on ac.ubicacion_id = u.id
where u.tipo = 'tienda' and u.activo
order by u.nombre;

-- ======================================================================
-- 03.
-- El termómetro del libro. Por día (Lima), sede, tipo, motivo, origen y destino muestra filas, unidades, variantes, firmantes, cuántas llevan terminal y cuántas tienen nota. Ahí se ven los retiros (hoy 0), los ajustes al piso y quién firma.
-- Origen: VERBATIM de fase 1 (registro-y-relojes #8).
-- Cuándo: Cada lunes.
-- Hoy: 25-09, 21:52 UTC. Solo TRU, 100 filas en el libro:
-- Hoy: - 22-09 (Lima): 15 ajustes por conteo físico al almacén (35 u., 8 variantes, los 15 con terminal);
-- Hoy: - 23-09: 3 entradas por recepción al almacén (50 u.);
-- Hoy: - 24-09: 9 bajadas (54 u., 8 variantes, 2 firmantes), 14 ajustes de reposición al piso (92 u., los 14 con terminal) y 1 salida por venta;
-- Hoy: - 25-09: 20 ajustes de reposición al almacén (60 u., los 20 con la nota «dasdasd»), 14 bajadas (46 u., 14 variantes, 1 firmante) y 24 salidas por venta (33 u., 3 firmantes).
-- Hoy: Retiros del piso al almacén: 0. Filas negativas: 0.
-- ======================================================================
select (m.created_at at time zone 'America/Lima')::date as dia_lima, u.nombre as sede, m.tipo, m.motivo,
       coalesce(so.tipo,'-') as sub_origen, coalesce(sd.tipo,'-') as sub_destino,
       count(*) as filas, sum(m.cantidad) as unidades,
       count(*) filter (where m.cantidad < 0) as filas_negativas,
       count(distinct m.variante_id) as variantes,
       count(distinct m.usuario_id) as firmantes, count(m.terminal_id) as con_terminal,
       count(*) filter (where m.nota is not null) as con_nota
from retail.movimientos m
join retail.ubicaciones u on u.id = m.ubicacion_id
left join retail.sububicaciones so on so.id = m.sububicacion_id
left join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id
group by 1,2,3,4,5,6
order by 1,2,3,4;

-- ======================================================================
-- 04.
-- Casos sospechosos de ropa colgada sin registrar: ventas desde el piso con una bajada de la misma talla 10, 30 o 60 minutos antes. Sirve para mirar casos, nunca como indicador de disciplina, porque castigaría a quien trae una talla para una clienta.
-- Ojo al leerla: `ventas_desde_piso` cuenta SALIDAS del libro (una por línea de venta), no ventas.
-- Origen: VERBATIM de fase 1 (registro-y-relojes #12). Reconoce la bajada por el motivo 'movimiento_interno' (ver SOBRE LA BAJADA).
-- Cuándo: Cada lunes: se miran los casos, no el porcentaje.
-- Hoy: 25-09, 21:53 UTC, TRU: 25 salidas desde el piso; 1 tardía en los tres cortes (4,0 %), con una bajada
-- Hoy: 2 min 35 s antes; 10 sin ninguna bajada previa (esa talla llegó al piso por ajuste directo). La tardía
-- Hoy: fue una prueba de flujo según fase 1 (ajuste → bajada → venta en 4 minutos). Con este n no dice nada.
-- ======================================================================
with ventas_piso as (
  select m.id, m.created_at, m.variante_id, m.ubicacion_id, vt.es_prueba
  from retail.movimientos m
  join retail.sububicaciones s on s.id = m.sububicacion_id and s.tipo = 'piso_venta'
  join retail.venta_items vi on vi.id = m.venta_item_id
  join retail.ventas vt on vt.id = vi.venta_id
  where m.tipo = 'salida' and m.motivo = 'venta' and vt.estado <> 'anulada'
), con_bajada as (
  select vp.*,
    (select min(vp.created_at - b.created_at) from retail.movimientos b
       join retail.sububicaciones sd on sd.id = b.sububicacion_destino_id and sd.tipo = 'piso_venta'
      where b.tipo = 'traslado' and b.motivo = 'movimiento_interno'
        and b.variante_id = vp.variante_id and b.ubicacion_id = vp.ubicacion_id
        and b.created_at <= vp.created_at) as desde_ultima_bajada
  from ventas_piso vp
)
select u.nombre as sede, c.es_prueba, count(*) as ventas_desde_piso,
  count(*) filter (where c.desde_ultima_bajada <= interval '10 minutes') as tardias_10m,
  count(*) filter (where c.desde_ultima_bajada <= interval '30 minutes') as tardias_30m,
  count(*) filter (where c.desde_ultima_bajada <= interval '60 minutes') as tardias_60m,
  round(100.0 * count(*) filter (where c.desde_ultima_bajada <= interval '10 minutes') / nullif(count(*),0), 1) as pct_10m,
  round(100.0 * count(*) filter (where c.desde_ultima_bajada <= interval '30 minutes') / nullif(count(*),0), 1) as pct_30m,
  round(100.0 * count(*) filter (where c.desde_ultima_bajada <= interval '60 minutes') / nullif(count(*),0), 1) as pct_60m,
  count(*) filter (where c.desde_ultima_bajada is null) as sin_ninguna_bajada_previa,
  min(c.desde_ultima_bajada) as menor_distancia, max(c.desde_ultima_bajada) as mayor_distancia,
  min(c.created_at) as primera_venta, max(c.created_at) as ultima_venta
from con_bajada c join retail.ubicaciones u on u.id = c.ubicacion_id
group by 1,2;

-- ======================================================================
-- 05.
-- La ropa guardada en el almacén, por tienda, según lo que HOY hay colgado de esa talla, y cuántos días lleva esperando. Es la base de «Por colgar» (Existencias).
-- «Por colgar» es la misma pregunta que el filtro «Por colgar» de Existencias: almacén disponible > 0 y piso disponible = 0
-- en la sede (disponible = cantidad − apartada, la cuenta de sumarCantidades, apps/web/lib/inventario-reglas.ts:262-309).
-- Se mira el stock de hoy y no la historia: una talla que bajó el martes, se vendió entera y tiene 3 en el almacén
-- está por colgar aunque «ya bajó alguna vez»; y una que llegó al piso por ajuste directo ya está colgada aunque
-- «nunca bajó». `de_esas_ya_bajaron_alguna_vez` queda solo como dato.
-- Origen: AJUSTADA de fase 1 (registro-y-relojes #16), con tres cambios: 1) clasifica por el piso disponible de hoy,
-- no por si alguna vez hubo bajada; 2) una bajada es un traslado con DESTINO el piso (así, un retiro del piso, que va
-- del piso al almacén, no cuenta como bajada); 3) sale por tienda. Reconoce la bajada por el
-- motivo 'movimiento_interno' (ver SOBRE LA BAJADA).
-- Ojo desde «Retirar del piso» (bloque 2 de ADR-0208, 25-09): «por colgar» incluye también lo que se retiró del piso
-- A PROPÓSITO (fin de temporada, cambio de exhibición), porque ni esta consulta ni Existencias tienen cómo distinguirlo
-- hasta que exista la marca de «retirada de la venta» (decisión de Felipe, bloque 3). Y `dias_max_esperando` cuenta
-- desde la primera llegada al almacén, no desde el retiro. Leer el conteo de «por colgar» como «ropa que nadie bajó»
-- exagera en cuanto haya retiros; Movimientos los muestra como «Retiro del piso».
-- Cuándo: Cada lunes, y para verificar el filtro «Por colgar» de Existencias (sus conteos tienen que cuadrar con «por colgar: nada colgado»).
-- Hoy: 25-09, 22:18 UTC, TRU, 45 u. en el almacén, ninguna apartada:
-- Hoy: - por colgar: 3 variantes y 8 u. del conteo del 22-09 (3,0 días esperando), más 6 variantes y 12 u. del ajuste de reposición del 25-09 (0,3 días);
-- Hoy: - ya hay colgado: 3 variantes y 13 u. (conteo), 1 variante y 2 u. (ajuste del 25-09) y 2 variantes y 10 u. (recepción del 23-09).
-- Hoy: En total, 20 u. de 9 variantes por colgar. Hoy coincide con la versión anterior («nunca bajó»): las 9 nunca
-- Hoy: bajaron y las 6 con algo colgado sí bajaron alguna vez. Dejará de coincidir en cuanto una talla se venda entera en el piso.
-- ======================================================================
with stock_sede as (
  -- Lo que hay HOY por talla y tienda, piso y almacén juntos en una fila.
  select st.variante_id, st.ubicacion_id,
         coalesce(sum(st.cantidad) filter (where s.tipo = 'almacen_tienda'), 0) as almacen,
         coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where s.tipo = 'almacen_tienda'), 0) as almacen_disponible,
         coalesce(sum(st.cantidad - st.cantidad_apartada) filter (where s.tipo = 'piso_venta'), 0) as piso_disponible
  from retail.stock st join retail.sububicaciones s on s.id = st.sububicacion_id
  where s.tipo in ('almacen_tienda', 'piso_venta')
  group by 1, 2
), llegada as (
  select m.variante_id, m.ubicacion_id, min(m.created_at) as llego,
         string_agg(distinct m.tipo || ':' || coalesce(m.motivo,'-'), ', ') as como_llego
  from retail.movimientos m join retail.sububicaciones s on s.id = m.sububicacion_id and s.tipo = 'almacen_tienda'
  where m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0)
  group by 1,2
), bajo as (
  select distinct m.variante_id, m.ubicacion_id
  from retail.movimientos m
  join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id and sd.tipo = 'piso_venta'
  where m.tipo = 'traslado' and m.motivo = 'movimiento_interno'
)
select u.nombre as sede,
       case when a.almacen_disponible > 0 and a.piso_disponible <= 0 then 'por colgar: nada colgado'
            when a.piso_disponible > 0 then 'ya hay colgado'
            else 'lo del almacén está apartado' end as estado,
       l.como_llego,
       count(*) as variantes,
       sum(a.almacen) as unidades_en_almacen,
       sum(a.almacen_disponible) as disponibles_en_almacen,
       count(b.variante_id) as de_esas_ya_bajaron_alguna_vez,
       min(l.llego) as llegada_mas_antigua, max(l.llego) as llegada_mas_reciente,
       round(max(extract(epoch from now() - l.llego)/86400)::numeric, 1) as dias_max_esperando
from stock_sede a
join retail.ubicaciones u on u.id = a.ubicacion_id
left join llegada l using (variante_id, ubicacion_id)
left join bajo b using (variante_id, ubicacion_id)
where a.almacen > 0
group by 1, 2, 3 order by 1, 2, 3;

-- ======================================================================
-- 06.
-- Comprueba que el stock sale entero del libro. Si alguna fila se descuadra, hay algo que escribe stock sin pasar por movimientos, y Frescura leería mal.
-- Origen: VERBATIM de fase 1 (registro-y-relojes #20).
-- Cuándo: Cada lunes, y después de pegar cualquier migración que escriba stock (por ejemplo, el candado de mover_interno o la bajada declarada en la caja; equivalencias con los bloques de ADR-0208 en docs/BACKLOG.md).
-- Hoy: 25-09, 21:53 UTC, TRU: almacén 45 = 45 según el libro y piso 158 = 158. 0 filas descuadradas y 0 negativas.
-- ======================================================================
with libro as (
  select variante_id, ubicacion_id, sububicacion_id, case tipo when 'entrada' then cantidad when 'salida' then -cantidad when 'ajuste' then cantidad when 'traslado' then -cantidad else 0 end as delta
  from retail.movimientos where tipo in ('entrada','salida','ajuste','traslado')
  union all
  select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from retail.movimientos where tipo = 'traslado'
), libro_sum as (
  select variante_id, ubicacion_id, sububicacion_id, sum(delta) as segun_libro from libro group by 1,2,3
), foto as (
  select variante_id, ubicacion_id, sububicacion_id, cantidad as segun_stock, cantidad_apartada from retail.stock
)
select u.nombre as sede, coalesce(s.tipo,'(sin sub)') as sub,
       count(*) as filas_stock_o_libro,
       sum(coalesce(f.segun_stock,0)) as unidades_stock,
       sum(coalesce(l.segun_libro,0)) as unidades_libro,
       count(*) filter (where coalesce(f.segun_stock,0) <> coalesce(l.segun_libro,0)) as filas_descuadradas,
       count(*) filter (where f.segun_stock < 0) as filas_stock_negativo,
       min(f.segun_stock) as min_stock
from foto f full join libro_sum l using (variante_id, ubicacion_id, sububicacion_id)
join retail.ubicaciones u on u.id = coalesce(f.ubicacion_id, l.ubicacion_id)
left join retail.sububicaciones s on s.id = coalesce(f.sububicacion_id, l.sububicacion_id)
group by 1,2 order by 1,2;

-- ======================================================================
-- 07.
-- Desde cuándo tiene historia de piso cada sede, y cuánto entró por bajada y cuánto por ajuste. Dice cuánto falta para las 8 semanas de la carrera; una vez que exista la fecha de arranque, se cuenta desde ella.
-- Origen: VERBATIM de fase 1 (volumen-y-evidencia #20). Reconoce la bajada por el motivo 'movimiento_interno' (ver SOBRE LA BAJADA).
-- Cuándo: Cada lunes, y antes de encender la carrera de cada categoría (el semáforo de Frescura).
-- Hoy: 25-09, 21:54 UTC. TRU: primer evento de piso el 24-09 a las 14:39 UTC (1,3 días de historia),
-- Hoy: 23 bajadas (100 u.) y 92 u. al piso por ajuste. AQP y LIM: sin eventos de piso.
-- ======================================================================
select u.nombre as sede,
  min(m.created_at) filter (where sd.tipo = 'piso_venta' or so.tipo = 'piso_venta') as primer_evento_piso,
  round(extract(epoch from now() - min(m.created_at) filter (where sd.tipo = 'piso_venta' or so.tipo = 'piso_venta'))/86400.0, 1) as dias_de_historia_piso,
  count(*) filter (where m.motivo = 'movimiento_interno' and sd.tipo = 'piso_venta') as bajadas_registradas,
  coalesce(sum(m.cantidad) filter (where m.motivo = 'movimiento_interno' and sd.tipo = 'piso_venta'),0) as unidades_bajadas,
  coalesce(sum(m.cantidad) filter (where m.tipo = 'ajuste' and so.tipo = 'piso_venta' and m.cantidad > 0),0) as unidades_al_piso_por_ajuste
from retail.ubicaciones u
left join retail.movimientos m on m.ubicacion_id = u.id
left join retail.sububicaciones so on so.id = m.sububicacion_id
left join retail.sububicaciones sd on sd.id = m.sububicacion_destino_id
where u.tipo = 'tienda'
group by u.nombre order by u.nombre;

-- ======================================================================
-- 08.
-- ¿Cada categoría tiene muestra suficiente para su vara, en la sede o juntando las 3 sedes? El mínimo del diseño es 20 modelo+color o 30 u. en 8 semanas.
-- Origen: AJUSTADA de fase 1 (volumen-y-evidencia #12), con dos cambios: 1) deja fuera la «Prenda sin
-- registrar» (variante centinela 22222222-…, la de la 01): su producto no tiene categoría, y cada una que se
-- cobra sumaría a una fila de categoría vacía que parece tener muestra cuando lo que falta es catálogo;
-- 2) sin `limit 50`: con 13 categorías vendidas en las 3 tiendas el resultado pasa de 50 filas, y el corte
-- se comía sin aviso las de Tienda TRU, que van al final. El resultado ya está acotado por categorías × sedes.
-- Cuándo: Una vez al mes, y antes de encender el semáforo de Frescura.
-- Hoy: 25-09, 21:54 UTC, con 7 ventas (34 u.), todas de TRU, así que «por sede» y «3 sedes» dan lo mismo:
-- Hoy: - Tops: 2 modelo+color y 15 u.; Camisas y Blusas: 2 y 10 u.; Polos: 2 y 5 u.;
-- Hoy: - Jeans: 1 y 3 u.; Blazers: 1 y 1 u.
-- Hoy: Ninguna categoría cumple el mínimo. Corrida otra vez tras la revisión (22:19 UTC): lo mismo, 10 filas.
-- ======================================================================
with base as (
  select ve.ubicacion_id, p.categoria_id, va.producto_id, va.color_codigo, vi.cantidad
  from retail.ventas ve
  join retail.venta_items vi on vi.venta_id = ve.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos p on p.id = va.producto_id
  where ve.estado = 'completada' and not ve.es_prueba and not p.es_prueba
    and vi.variante_id <> '22222222-2222-4222-8222-222222222222'
    and ve.created_at >= now() - interval '8 weeks'
), por_sede as (
  select ubicacion_id, categoria_id, count(distinct (producto_id, color_codigo)) as modelo_color, sum(cantidad) as unidades
  from base group by 1,2
), tres_sedes as (
  select categoria_id, count(distinct (producto_id, color_codigo)) as modelo_color, sum(cantidad) as unidades
  from base group by 1
)
select 'por sede' as nivel, u.nombre as sede, c.nombre as categoria, ps.modelo_color, ps.unidades,
       (ps.modelo_color >= 20 or ps.unidades >= 30) as cumple_minimo
from por_sede ps join retail.ubicaciones u on u.id = ps.ubicacion_id left join retail.categorias c on c.id = ps.categoria_id
union all
select '3 sedes', null, c.nombre, t.modelo_color, t.unidades, (t.modelo_color >= 20 or t.unidades >= 30)
from tres_sedes t left join retail.categorias c on c.id = t.categoria_id
order by 1, 2, 5 desc;

-- ======================================================================
-- 09.
-- Por modelo+color y sede, cuántos tienen muestra según los cortes del diseño: menos de 5 ventas (sin datos), de 5 a 15 (señal) o más de 15 (firme), en ventanas de 90 y 120 días. Deja a la vista que «firme» no se alcanza con una profundidad de 8 u.
-- Origen: AJUSTADA de fase 1 (volumen-y-evidencia #11): deja fuera la «Prenda sin registrar» (variante
-- centinela 22222222-…, la de la 01). Todas las que se cobran caen en un solo modelo+color, y con más de 15
-- saldría «firme» un modelo que no existe.
-- Cuándo: Una vez al mes.
-- Hoy: 25-09, 21:54 UTC. TRU: 17 modelo+color; 15 sin datos, 2 con señal y 0 firmes; 34 u. vendidas. Da lo mismo en 90 y en 120 días.
-- Hoy: Corrida otra vez tras la revisión (22:19 UTC): lo mismo (hoy no hay ninguna prenda sin registrar cobrada).
-- ======================================================================
with ventas_mc as (
  select w.ventana, ve.ubicacion_id, va.producto_id, va.color_codigo, sum(vi.cantidad) as unidades
  from retail.ventas ve
  join retail.venta_items vi on vi.venta_id = ve.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos p on p.id = va.producto_id
  cross join (values (90), (120)) as w(ventana)
  where ve.estado = 'completada' and not ve.es_prueba and not p.es_prueba
    and vi.variante_id <> '22222222-2222-4222-8222-222222222222'
    and ve.created_at >= now() - make_interval(days => w.ventana)
  group by 1,2,3,4
), universo as (
  -- todo modelo+color que tuvo stock (piso o almacén) en la sede, aunque no haya vendido
  select distinct w.ventana, s.ubicacion_id, va.producto_id, va.color_codigo
  from retail.stock s join retail.variantes va on va.id = s.variante_id
  cross join (values (90), (120)) as w(ventana)
  where s.cantidad > 0 and s.variante_id <> '22222222-2222-4222-8222-222222222222'
), todo as (
  select coalesce(u.ventana, v.ventana) as ventana, coalesce(u.ubicacion_id, v.ubicacion_id) as ubicacion_id,
         coalesce(v.unidades, 0) as unidades
  from universo u full join ventas_mc v using (ventana, ubicacion_id, producto_id, color_codigo)
)
select t.ventana, ub.nombre as sede,
  count(*) as modelo_color,
  count(*) filter (where unidades < 5) as sin_datos_menos_5,
  count(*) filter (where unidades between 5 and 15) as senal_5_a_15,
  count(*) filter (where unidades > 15) as firme_mas_15,
  sum(unidades) as unidades_vendidas
from todo t join retail.ubicaciones ub on ub.id = t.ubicacion_id
group by 1,2 order by 1,2;

-- ======================================================================
-- 10.
-- El % de unidades y de soles vendidos a precio completo, por sede y mes. Es la métrica de éxito de Frescura y un fundamental de D-71.
-- Origen: AJUSTADA de fase 1 (precio-completo-y-clienta #7), con dos cambios:
-- 1) resta las unidades devueltas con devolución aprobada;
-- 2) excluye las liquidaciones de prendas dañadas (motivo 'cuarentena_liquidada'), que graban su precio sin descuento.
-- Los cambios cuentan como venta al precio cobrado.
-- Revisión del 25-09: la ventana son los últimos 6 meses COMPLETOS desde el día 1, a medianoche de Lima. Antes
-- cortaba en el día del mes de hoy y a medianoche UTC (las 19:00 de Lima del día anterior): el mes más viejo
-- salía a medias y cambiaba de cifra según el día en que se corriera.
-- Cuándo: Cada lunes desde el arranque de cada sede, y una vez al mes. Nunca como línea base antes de 6 semanas por sede.
-- Hoy: 25-09, 21:55 UTC, TRU, septiembre de 2026:
-- Hoy: - 34 u.; S/ 2 310,50 cobrados sobre S/ 2 491,50 a precio de lista;
-- Hoy: - 24 u. a precio completo: 70,6 % de las unidades y 68,9 % de los soles;
-- Hoy: - 10 u. de campaña y 0 con descuento manual (la columna sale vacía cuando no hay ninguna).
-- Hoy: Es ruido: con 2 ventas daba 50 %, con 4 daba 75 %.
-- Hoy: Con la ventana corregida (22:19 UTC): lo mismo; el corte cae el 01-04-2026 a las 05:00 UTC, las 00:00 de Lima.
-- ======================================================================
WITH lineas AS (
  SELECT u.nombre AS sede,
         date_trunc('month', v.created_at AT TIME ZONE 'America/Lima')::date AS mes,
         n.cantidad,
         (vi.precio_unitario - vi.descuento_unitario) * n.cantidad AS soles_cobrados,
         vi.precio_unitario * n.cantidad AS soles_a_lista,
         (vi.descuento_unitario = 0 AND vi.motivo_descuento IS NULL AND vi.descuento_etiqueta_id IS NULL AND v.descuento_pct = 0) AS a_precio_completo,
         (vi.motivo_descuento = 'campana') AS por_campana,
         (vi.descuento_unitario > 0 AND vi.motivo_descuento IS DISTINCT FROM 'campana') AS por_descuento_manual
  FROM retail.ventas v
  JOIN retail.venta_items vi ON vi.venta_id = v.id
  JOIN retail.ubicaciones u ON u.id = v.ubicacion_id
  -- AJUSTE 1: unidades netas, restando lo devuelto con devolución aprobada
  CROSS JOIN LATERAL (
    SELECT vi.cantidad - coalesce((SELECT sum(di.cantidad) FROM retail.devolucion_items di
                                   JOIN retail.devoluciones d ON d.id = di.devolucion_id
                                   WHERE di.venta_item_id = vi.id AND d.estado = 'aprobada'), 0) AS cantidad
  ) n
  WHERE v.es_prueba = false
    AND v.estado = 'completada'
    AND vi.variante_id <> '22222222-2222-4222-8222-222222222222'
    AND NOT EXISTS (SELECT 1 FROM retail.venta_anulacion_items a WHERE a.venta_item_id = vi.id)
    -- AJUSTE 2: fuera la liquidación de prendas dañadas (su precio es el de liquidación, sin descuento)
    AND NOT EXISTS (SELECT 1 FROM retail.movimientos m WHERE m.venta_item_id = vi.id AND m.motivo = 'cuarentena_liquidada')
    -- Día 1 del mes de hace 5 meses, 00:00 de Lima: este mes y los 5 anteriores, enteros.
    AND v.created_at >= ((date_trunc('month', now() AT TIME ZONE 'America/Lima') - interval '5 months') AT TIME ZONE 'America/Lima')
)
SELECT sede, mes,
       sum(cantidad) AS unidades,
       round(sum(soles_cobrados), 2) AS soles_cobrados,
       round(sum(soles_a_lista), 2) AS soles_a_precio_lista,
       sum(cantidad) FILTER (WHERE a_precio_completo) AS unidades_precio_completo,
       round(100.0 * sum(cantidad) FILTER (WHERE a_precio_completo) / nullif(sum(cantidad), 0), 1) AS pct_unidades_precio_completo,
       round(100.0 * sum(soles_cobrados) FILTER (WHERE a_precio_completo) / nullif(sum(soles_cobrados), 0), 1) AS pct_soles_precio_completo,
       sum(cantidad) FILTER (WHERE por_campana) AS unidades_campana,
       sum(cantidad) FILTER (WHERE por_descuento_manual) AS unidades_descuento_manual
FROM lineas
GROUP BY sede, mes
ORDER BY sede, mes;

-- ======================================================================
-- 11.
-- Detecta rebajas hechas bajando el precio del catálogo. La línea de venta las registra como precio completo, así que solo se ven con el historial de cambios.
-- Origen: VERBATIM de fase 1 (precio-completo-y-clienta #8).
-- Cuándo: Una vez al mes, junto con la consulta 10.
-- Hoy: 25-09, 21:55 UTC: 25 líneas de venta; 0 de variantes con cambio de precio, 0 bajo el precio original y
-- Hoy: 0 cambios de precio registrados en el historial. El disparador variantes_registrar_cambio está activo en producción.
-- ======================================================================
WITH precio_original AS (
  SELECT DISTINCT ON (h.entidad_id) h.entidad_id AS variante_id, h.valor_anterior::numeric AS precio_original, h.created_at AS primer_cambio
  FROM retail.historial_producto_cambios h
  WHERE h.entidad = 'variante' AND h.campo = 'precio' AND h.valor_anterior ~ '^[0-9]+(\.[0-9]+)?$'
  ORDER BY h.entidad_id, h.created_at
)
SELECT count(*) AS lineas,
       count(*) FILTER (WHERE po.variante_id IS NOT NULL) AS lineas_de_variantes_con_precio_cambiado,
       count(*) FILTER (WHERE vi.precio_unitario < coalesce(po.precio_original, vi.precio_unitario)) AS lineas_bajo_precio_original,
       (SELECT count(*) FROM precio_original) AS variantes_con_cambio_de_precio_registrado
FROM retail.venta_items vi JOIN retail.ventas v ON v.id = vi.venta_id
LEFT JOIN precio_original po ON po.variante_id = vi.variante_id
WHERE v.es_prueba = false AND v.estado = 'completada';

-- ======================================================================
-- 12.
-- Detecta diferencias entre el repo y producción en las funciones de lectura de Frescura y en mover_interno. Por cada una trae:
-- - la huella md5 de pg_get_functiondef, para compararla con la del Postgres local después de migrar;
-- - si delega en el libro único (columna `delega_en_libro_unico`: el cuerpo llama a fn_ledger_puntos). Es la
--   marca que distingue la versión de 20260924030000_ledger_fuente_unica.sql, donde fn_resumen_comparacion y
--   fn_ledger_timeline dejan de reconstruir el piso por su cuenta;
-- - `version_rama_paralela` (busca la clave esMovimientoInterno): true = la versión de 20260924010700 o una
--   posterior, NO «libro único». La 010700 ya armaba esa clave dentro de fn_resumen_comparacion
--   (supabase/migrations/20260924010700_analisis_comercial_piso_almacen.sql:389) reconociendo la bajada por
--   motivo; si alguien re-pegara esa migración vieja, esta columna seguiría en true y solo
--   `delega_en_libro_unico` avisaría;
-- - si usa la definición única de venta;
-- - si abre a Análisis;
-- - si es security definer.
-- Origen: AJUSTADA de fase 1 (registro-y-relojes #25). Se agregaron la huella md5, fn_puede_analizar() y prosecdef, y a la lista se sumaron fn_es_traslado_interno, fn_resumen_variantes y mover_interno.
-- Revisión del 25-09: se agregó `delega_en_libro_unico`, porque `version_rama_paralela` no distingue el libro
-- único de la versión 010700.
-- Cuándo: Antes y después de pegar una migración que toque mover_interno o las lecturas de Frescura (el candado de mover_interno, la fecha de arranque por sede, el bloque 3 de ADR-0208), y una vez al mes. Equivalencias entre las «tareas» del plan y los bloques: docs/BACKLOG.md.
-- Hoy: 25-09, 21:55 UTC, y otra vez a las 22:19 UTC con la columna nueva (las cinco huellas que fase 1 anotó a las 16:1x UTC siguen iguales):
-- Hoy: - fn_resumen_comparacion: md5 a126d7c8…; delega en el libro único (delega_en_libro_unico = true), usa fn_es_venta_de_stock y abre a Análisis (el #405 ya está pegado);
-- Hoy: - fn_ledger_puntos: md5 64d71eea…; usa fn_es_venta_de_stock (es el libro único: no se llama a sí misma, así que su delega_en_libro_unico sale false);
-- Hoy: - fn_ledger_timeline: md5 0aafdebd…; delega en el libro único y abre a Análisis;
-- Hoy: - fn_resumen_variantes: md5 629da755…; abre a Análisis;
-- Hoy: - mover_interno: md5 a4011704…; security definer;
-- Hoy: - fn_es_traslado_interno: md5 a83eb0fc…; fn_es_venta_de_stock: md5 d7c259ec…; fn_resumen_comparacion_json: md5 1c815fab….
-- Hoy: El #397 y el #405 están fusionados en main.
-- ======================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, length(p.prosrc) as largo,
       md5(pg_get_functiondef(p.oid)) as huella_md5,
       p.prosrc ilike '%fn_ledger_puntos%' as delega_en_libro_unico,
       p.prosrc ilike '%esMovimientoInterno%' as version_rama_paralela,
       p.prosrc ilike '%fn_es_venta_de_stock%' as usa_es_venta_de_stock,
       p.prosrc ilike '%fn_puede_analizar()%' as abre_a_analisis,
       p.prosecdef as security_definer,
       obj_description(p.oid, 'pg_proc') is not null as tiene_comentario
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname in ('fn_resumen_comparacion','fn_ledger_puntos','fn_ledger_timeline','fn_es_venta_de_stock','fn_es_traslado_interno','fn_resumen_comparacion_json','fn_resumen_variantes','mover_interno')
order by 1;
