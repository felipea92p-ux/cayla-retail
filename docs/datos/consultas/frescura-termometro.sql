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
--   · SQL Editor del proyecto cayla-dynamic, UNA consulta a la vez: pégala sola (o resáltala)
--     desde su primera línea sin «--» hasta su punto y coma, y córrela. Todas nombran sus tablas
--     con `retail.`, así que no hace falta `set search_path`. También sirven tal cual con el MCP
--     de Supabase (execute_sql).
--   · Ninguna escribe: las 12 empiezan por SELECT o WITH. Si alguna vez una empieza por otra
--     cosa, alguien la cambió: no la corras.
--   · Todo día y todo mes se calcula en HORA DE LIMA (`AT TIME ZONE 'America/Lima'`). Las horas
--     sueltas (primer evento, llegadas, `foto`) el SQL Editor las muestra en UTC: réstales 5 horas.
--   · Cada resultado es una FOTO del momento en que la corres: se cuenta contra now() y la base
--     está viva (el 25-09 pasó de 2 a 7 ventas mientras se medía). Al guardar un resultado,
--     anota la fecha y la hora; la 01 la trae en su columna `foto`.
--
-- PROHIBIDO usarlo como LÍNEA BASE antes de 6 semanas desde el arranque de cada sede (la fecha de
--   arranque la fija la tarea 8; mientras no exista, nada de esto es línea base). Las cifras
--   «Hoy:» de abajo son una foto del 25-09-2026 con 7 ventas, todas de TRU y en su 2.º día: sirven
--   para reconocer la forma del resultado, no para compararse contra ellas.
--
-- RUTINA DE LOS LUNES (Felipe, ~10 minutos).
--   1. En Alegra, anota el NÚMERO de comprobantes de venta (boletas, y facturas si hubo; sin las
--      anuladas) por sede y por día de la semana anterior, lunes a domingo.
--   2. Corre la consulta 01 y pon al lado, por sede y día, su columna `ventas_en_erp`.
--   3. Alegra menos `ventas_en_erp` = la parte de la tienda que el ERP no ve. Se comparan CONTEOS,
--      no montos: una boleta es una venta en los dos sistemas, y la pregunta es cuántas ventas se
--      le escapan al ERP, no cuánta plata. Es una sola cifra por sede y día a propósito: si la
--      rutina pesa, se abandona, y con ella se pierde la señal más importante del plan.
--   4. Después, las que dicen «Cuándo: Cada lunes» (02 a 07). La 08 a la 11, una vez al mes. La
--      12, antes y después de pegar una migración de Frescura.
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
--   motivo = 'movimiento_interno' y así quedan, tal como corrieron en producción. El motor de
--   Frescura (retail.fn_ledger_puntos) usa otra condición, estructural: retail.fn_es_traslado_interno,
--   un traslado cuyo origen y destino son la misma sede
--   (supabase/migrations/20260924030000_ledger_fuente_unica.sql:78-84). Hoy dan lo mismo: los 23
--   traslados de producción cumplen las dos (verificado el 25-09 a las 21:52 UTC). Si algún día
--   difieren, manda el motor, y estas cuatro consultas se corrigen para usar la función.
--
-- ORIGEN. Plan «Frescura del piso», tarea 1 (aprobada por Felipe el 25-09-2026). VERBATIM = la
--   consulta de la fase 1 del análisis, sin cambios; AJUSTADA = dice qué se le cambió. Las 12 se
--   verificaron en producción el 25-09-2026 entre las 21:51 y las 21:56 UTC: primero `explain`
--   (compila) y después la consulta tal cual. Ninguna necesitó corrección.
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
-- Origen: NUEVA, no está en fase 1. Se armó con las columnas que fase 1 leyó (precio-completo #0 y #18).
-- Cuándo: Cada lunes, por los 7 días anteriores. También antes de marcar el arranque de cada sede (tarea 8).
-- Hoy: 25-09, 21:51 UTC, solo Tienda TRU:
-- Hoy: - 24-09: 1 venta, emitida por retail, 1 u., S/ 39,90;
-- Hoy: - 25-09: 6 ventas, las 6 emitidas por retail (0 por Alegra, 0 con número de boleta Alegra), 33 u., S/ 2 270,60.
-- Hoy: 0 prendas sin registrar. AQP y LIM no tienen filas.
-- Hoy: Por qué 0 por Alegra aunque D-56 ponga «La emite Alegra» por defecto: la pantalla no manda
-- Hoy: `p_emisor` y la base usa su default 'retail' (ver RUTINA DE LOS LUNES). De esas 7 ventas, 2 tienen
-- Hoy: boleta aceptada en el entorno sandbox (no es SUNAT real) y 5 una nota de venta interna.
-- ======================================================================
WITH v AS (
  SELECT v.id, u.nombre AS sede, (v.created_at AT TIME ZONE 'America/Lima')::date AS dia_lima, v.emisor, v.boleta_alegra_numero
  FROM retail.ventas v
  JOIN retail.ubicaciones u ON u.id = v.ubicacion_id
  WHERE v.es_prueba = false AND v.estado = 'completada'
)
SELECT v.sede, v.dia_lima,
       count(DISTINCT v.id) AS ventas_en_erp,
       count(DISTINCT v.id) FILTER (WHERE v.emisor = 'alegra') AS ventas_emite_alegra,
       count(DISTINCT v.id) FILTER (WHERE v.boleta_alegra_numero IS NOT NULL) AS con_numero_boleta_alegra,
       count(DISTINCT v.id) FILTER (WHERE v.emisor = 'retail') AS ventas_emite_retail,
       coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id <> '22222222-2222-4222-8222-222222222222'), 0) AS unidades_de_catalogo,
       coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id = '22222222-2222-4222-8222-222222222222'), 0) AS unidades_prenda_sin_registrar,
       round(100.0 * coalesce(sum(vi.cantidad) FILTER (WHERE vi.variante_id = '22222222-2222-4222-8222-222222222222'), 0) / nullif(sum(vi.cantidad), 0), 1) AS pct_prenda_sin_registrar,
       round(sum((vi.precio_unitario - vi.descuento_unitario) * vi.cantidad), 2) AS soles_cobrados,
       now() AS foto
FROM v
JOIN retail.venta_items vi ON vi.venta_id = v.id
GROUP BY v.sede, v.dia_lima
ORDER BY v.sede, v.dia_lima;

-- ======================================================================
-- 02.
-- ¿El piso se llena por bajada o por ajuste directo? Da el % de unidades que entraron al piso sin pasar por una bajada. Mide la tarea 3.
-- Origen: VERBATIM de fase 1 (registro-y-relojes #17). Reconoce la bajada por el motivo 'movimiento_interno'; el motor usa fn_es_traslado_interno, y hoy dan lo mismo (ver SOBRE LA BAJADA).
-- Cuándo: Cada lunes, y antes y después de fusionar la tarea 3.
-- Hoy: 25-09, 21:52 UTC, TRU:
-- Hoy: - 22 variantes solo por bajada (100 u.);
-- Hoy: - 14 variantes solo por ajuste directo (92 u.);
-- Hoy: - 0 mixtas.
-- Hoy: El 47,9 % del piso entró sin bajada. A las 15:16 UTC era 62,2 %: bajó porque el 25-09 se registraron
-- Hoy: 14 bajadas más, no porque se corrigieran los 14 ajustes (siguen siendo los de la terminal «Almacén
-- Hoy: Trujillo» del 24-09, entre las 16:23 y las 16:29 UTC).
-- ======================================================================
with piso as (select id from retail.sububicaciones where tipo = 'piso_venta'),
entradas_piso as (
  select m.variante_id,
         sum(m.cantidad) filter (where m.tipo = 'traslado' and m.motivo = 'movimiento_interno' and m.sububicacion_destino_id in (select id from piso)) as por_bajada,
         sum(m.cantidad) filter (where m.tipo in ('ajuste','entrada') and m.cantidad > 0 and m.sububicacion_id in (select id from piso)) as por_ajuste_o_entrada_directa
  from retail.movimientos m group by 1
)
select count(*) filter (where coalesce(por_bajada,0) > 0 and coalesce(por_ajuste_o_entrada_directa,0) = 0) as variantes_solo_por_bajada,
       count(*) filter (where coalesce(por_bajada,0) = 0 and coalesce(por_ajuste_o_entrada_directa,0) > 0) as variantes_solo_por_ajuste_directo,
       count(*) filter (where coalesce(por_bajada,0) > 0 and coalesce(por_ajuste_o_entrada_directa,0) > 0) as variantes_mixtas,
       sum(coalesce(por_bajada,0)) as uds_llegadas_por_bajada,
       sum(coalesce(por_ajuste_o_entrada_directa,0)) as uds_llegadas_por_ajuste_directo,
       round(100.0 * sum(coalesce(por_ajuste_o_entrada_directa,0)) / nullif(sum(coalesce(por_bajada,0)) + sum(coalesce(por_ajuste_o_entrada_directa,0)),0), 1) as pct_piso_sin_bajada
from entradas_piso
where coalesce(por_bajada,0) + coalesce(por_ajuste_o_entrada_directa,0) > 0;

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
-- Casos sospechosos de ropa colgada sin registrar: ventas desde el piso con una bajada de la misma talla 10, 30 o 60 minutos antes. Sirve para mirar casos, nunca como indicador de disciplina, porque castigaría a quien trae una talla para una clienta. Desde la tarea 7 se cruza con bajadas_piso.contexto = 'caja'.
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
-- La ropa que está en el almacén y nunca bajó al piso, y cuántos días lleva esperando. Es la base de «Por colgar» (tarea 4).
-- Origen: VERBATIM de fase 1 (registro-y-relojes #16). Reconoce la bajada por el motivo 'movimiento_interno' (ver SOBRE LA BAJADA).
-- Cuándo: Cada lunes, y para verificar la tarea 4.
-- Hoy: 25-09, 21:53 UTC, TRU, 45 u. en el almacén:
-- Hoy: - nunca bajó: 3 variantes y 8 u. del conteo del 22-09 (3,0 días esperando), más 6 variantes y 12 u. del ajuste de reposición del 25-09 (0,3 días);
-- Hoy: - ya bajó alguna vez: 3 variantes y 13 u. (conteo), 1 variante y 2 u. (ajuste del 25-09) y 2 variantes y 10 u. (recepción del 23-09).
-- Hoy: En total, 20 u. de 9 variantes nunca pisaron el piso (a media tarde eran 66 u. de 22: las 14 bajadas del 25-09 se llevaron el resto).
-- ======================================================================
with alm as (
  select st.variante_id, st.ubicacion_id, st.cantidad
  from retail.stock st join retail.sububicaciones s on s.id = st.sububicacion_id and s.tipo = 'almacen_tienda'
  where st.cantidad > 0
), llegada as (
  select m.variante_id, m.ubicacion_id, min(m.created_at) as llego,
         string_agg(distinct m.tipo || ':' || coalesce(m.motivo,'-'), ', ') as como_llego
  from retail.movimientos m join retail.sububicaciones s on s.id = m.sububicacion_id and s.tipo = 'almacen_tienda'
  where m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0)
  group by 1,2
), bajo as (
  select distinct m.variante_id, m.ubicacion_id
  from retail.movimientos m where m.tipo = 'traslado' and m.motivo = 'movimiento_interno'
)
select case when b.variante_id is null then 'nunca bajó' else 'ya bajó alguna vez' end as estado,
       l.como_llego,
       count(*) as variantes, sum(a.cantidad) as unidades_en_almacen,
       min(l.llego) as llegada_mas_antigua, max(l.llego) as llegada_mas_reciente,
       round(max(extract(epoch from now() - l.llego)/86400)::numeric, 1) as dias_max_esperando
from alm a
left join llegada l using (variante_id, ubicacion_id)
left join bajo b using (variante_id, ubicacion_id)
group by 1,2 order by 1,2;

-- ======================================================================
-- 06.
-- Comprueba que el stock sale entero del libro. Si alguna fila se descuadra, hay algo que escribe stock sin pasar por movimientos, y Frescura leería mal.
-- Origen: VERBATIM de fase 1 (registro-y-relojes #20).
-- Cuándo: Cada lunes, y después de pegar cualquier migración que escriba stock (tareas 5 y 7).
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
-- Cuándo: Cada lunes, y antes de encender la carrera (tarea 12).
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
-- Origen: VERBATIM de fase 1 (volumen-y-evidencia #12).
-- Cuándo: Una vez al mes, y antes de la tarea 12.
-- Hoy: 25-09, 21:54 UTC, con 7 ventas (34 u.), todas de TRU, así que «por sede» y «3 sedes» dan lo mismo:
-- Hoy: - Tops: 2 modelo+color y 15 u.; Camisas y Blusas: 2 y 10 u.; Polos: 2 y 5 u.;
-- Hoy: - Jeans: 1 y 3 u.; Blazers: 1 y 1 u.
-- Hoy: Ninguna categoría cumple el mínimo.
-- ======================================================================
with base as (
  select ve.ubicacion_id, p.categoria_id, va.producto_id, va.color_codigo, vi.cantidad
  from retail.ventas ve
  join retail.venta_items vi on vi.venta_id = ve.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos p on p.id = va.producto_id
  where ve.estado = 'completada' and not ve.es_prueba and not p.es_prueba
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
order by 1, 2, 5 desc
limit 50;

-- ======================================================================
-- 09.
-- Por modelo+color y sede, cuántos tienen muestra según los cortes del diseño: menos de 5 ventas (sin datos), de 5 a 15 (señal) o más de 15 (firme), en ventanas de 90 y 120 días. Deja a la vista que «firme» no se alcanza con una profundidad de 8 u.
-- Origen: VERBATIM de fase 1 (volumen-y-evidencia #11).
-- Cuándo: Una vez al mes.
-- Hoy: 25-09, 21:54 UTC. TRU: 17 modelo+color; 15 sin datos, 2 con señal y 0 firmes; 34 u. vendidas. Da lo mismo en 90 y en 120 días.
-- ======================================================================
with ventas_mc as (
  select w.ventana, ve.ubicacion_id, va.producto_id, va.color_codigo, sum(vi.cantidad) as unidades
  from retail.ventas ve
  join retail.venta_items vi on vi.venta_id = ve.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos p on p.id = va.producto_id
  cross join (values (90), (120)) as w(ventana)
  where ve.estado = 'completada' and not ve.es_prueba and not p.es_prueba
    and ve.created_at >= now() - make_interval(days => w.ventana)
  group by 1,2,3,4
), universo as (
  -- todo modelo+color que tuvo stock (piso o almacén) en la sede, aunque no haya vendido
  select distinct w.ventana, s.ubicacion_id, va.producto_id, va.color_codigo
  from retail.stock s join retail.variantes va on va.id = s.variante_id
  cross join (values (90), (120)) as w(ventana)
  where s.cantidad > 0
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
-- Cuándo: Cada lunes desde el arranque de cada sede, y una vez al mes. Nunca como línea base antes de 6 semanas por sede.
-- Hoy: 25-09, 21:55 UTC, TRU, septiembre de 2026:
-- Hoy: - 34 u.; S/ 2 310,50 cobrados sobre S/ 2 491,50 a precio de lista;
-- Hoy: - 24 u. a precio completo: 70,6 % de las unidades y 68,9 % de los soles;
-- Hoy: - 10 u. de campaña y 0 con descuento manual (la columna sale vacía cuando no hay ninguna).
-- Hoy: Es ruido: con 2 ventas daba 50 %, con 4 daba 75 %.
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
    AND v.created_at >= (now() AT TIME ZONE 'America/Lima')::date - interval '6 months'
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
-- - si es la versión del libro único (columna `version_rama_paralela`: busca la clave esMovimientoInterno, que
--   solo trae la versión de 20260924030000_ledger_fuente_unica.sql; en fn_resumen_comparacion, true = libro único);
-- - si usa la definición única de venta;
-- - si abre a Análisis;
-- - si es security definer.
-- Origen: AJUSTADA de fase 1 (registro-y-relojes #25). Se agregaron la huella md5, fn_puede_analizar() y prosecdef, y a la lista se sumaron fn_es_traslado_interno, fn_resumen_variantes y mover_interno.
-- Cuándo: Antes y después de pegar las migraciones de las tareas 5, 8, 9 y 11, y una vez al mes.
-- Hoy: 25-09, 21:55 UTC (las cinco huellas que fase 1 anotó a las 16:1x UTC siguen iguales):
-- Hoy: - fn_resumen_comparacion: md5 a126d7c8…; libro único, usa fn_es_venta_de_stock y abre a Análisis (el #405 ya está pegado);
-- Hoy: - fn_ledger_puntos: md5 64d71eea…; usa fn_es_venta_de_stock;
-- Hoy: - fn_ledger_timeline: md5 0aafdebd…; abre a Análisis;
-- Hoy: - fn_resumen_variantes: md5 629da755…; abre a Análisis;
-- Hoy: - mover_interno: md5 a4011704…; security definer;
-- Hoy: - fn_es_traslado_interno: md5 a83eb0fc…; fn_es_venta_de_stock: md5 d7c259ec…; fn_resumen_comparacion_json: md5 1c815fab….
-- Hoy: El #397 y el #405 están fusionados en main.
-- ======================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, length(p.prosrc) as largo,
       md5(pg_get_functiondef(p.oid)) as huella_md5,
       p.prosrc ilike '%esMovimientoInterno%' as version_rama_paralela,
       p.prosrc ilike '%fn_es_venta_de_stock%' as usa_es_venta_de_stock,
       p.prosrc ilike '%fn_puede_analizar()%' as abre_a_analisis,
       p.prosecdef as security_definer,
       obj_description(p.oid, 'pg_proc') is not null as tiene_comentario
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname in ('fn_resumen_comparacion','fn_ledger_puntos','fn_ledger_timeline','fn_es_venta_de_stock','fn_es_traslado_interno','fn_resumen_comparacion_json','fn_resumen_variantes','mover_interno')
order by 1;
