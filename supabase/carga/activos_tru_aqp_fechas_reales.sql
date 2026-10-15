-- ============================================================================
-- CORRECCIÓN — fechas reales de compra de los activos de Trujillo y Arequipa
--
-- ⚠️ SE PEGA EN EL SQL EDITOR DEL PROYECTO cayla-DYNAMIC.
--
-- POR QUÉ EXISTE
--   La carga inicial puso una fecha supuesta igual para todos, primero
--   ene-2025 y después ene-2026, porque los anexos son constancias de custodia
--   y no traen fecha de compra. Las hojas SINATRA 2026 TRU y AQP sí la traen:
--   este script pone la fecha REAL de cada bien y recalcula su depreciación.
--
--   Funciona salga de donde salga: fija fechas absolutas, así que da igual si
--   las filas quedaron en ene-2025 o en ene-2026.
--
-- DE DÓNDE SALE CADA FECHA
--   · Coincidencia exacta de monto entre el anexo y la hoja: los cuatro JBL.
--   · Compras cruzadas entre sedes, confirmadas por Felipe: la MacBook Air M5
--     y el iPhone 15 de Arequipa se pagaron con la contabilidad de Trujillo
--     (8 y 9 de mayo de 2026), y la Mac Mini de Arequipa es la cuarta de las
--     compradas en Trujillo en agosto de 2025 — de esas quedaron tres allá y
--     una viajó a Arequipa.
--   · Bienes anteriores al detalle de la hoja: iPhone 12 y cámara Canon, que
--     Felipe ubica en 2024. Se les pone enero de 2024 como fecha estimada.
--   · El Lenovo V14-IIL de Arequipa no aparece en ninguna de las dos hojas:
--     queda con enero de 2024, también estimada, y así anotado.
--
-- ⚠️ EL COSTO REGISTRADO ESTÁ REVALUADO, Y ES UNA DECISIÓN TOMADA
--   Los valores de los anexos son de reposición a precio de hoy, no lo que se
--   pagó. Verificado el 2026-08-12: la Mac Mini M4 de 16 GB se vende hoy en
--   Perú entre S/ 3,599 y S/ 4,099, y el anexo la declara a S/ 4,000; la hoja
--   de gastos —que Felipe viene depreciando— la tiene bastante más abajo.
--   Felipe decidió registrar el valor del anexo.
--
--   Consecuencia, para que no se pierda: la depreciación se calcula sobre el
--   costo computable (art. 41 de la LIR) y el mayor valor de una revaluación
--   voluntaria NO es deducible — hay que repararlo en la declaración anual.
--   Por eso cada bien afectado lo lleva escrito en su propia ficha: la
--   advertencia viaja con el dato, no en una conversación.
--
-- SE PUEDE PEGAR DOS VECES: la segunda deja exactamente los mismos valores.
--
-- CÓMO SE REVIERTE
--   No hace falta: volver a correr la carga original no toca estas filas.
--   Para deshacerlo, correr este mismo script con las fechas viejas.
-- ============================================================================

with corte as (
  select date '2026-07-31' as hasta
),
ajuste (sede, nombre, fecha, nota) as (
  values
    -- ── Trujillo ────────────────────────────────────────────────────────────
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024)',       date '2025-08-07',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 134 (07-08-2025, dos unidades). ⚠ Costo revaluado a precio de reposición (mercado 2026: S/ 3,599–4,099); el mayor valor sobre el costo de adquisición no es deducible.'),
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024) — 2.ª', date '2025-08-07',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 134 (07-08-2025, dos unidades). ⚠ Costo revaluado a precio de reposición; el mayor valor sobre el costo de adquisición no es deducible.'),
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024) — 3.ª', date '2025-08-18',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 136 (18-08-2025). De esa compra de dos unidades, una se quedó en Trujillo y la otra viajó a Arequipa. ⚠ Costo revaluado; el mayor valor no es deducible.'),
    ('TRU', 'iPhone 12',                             date '2024-01-01',
     'Anexo IV, 01-jul-2026. ⚠ No figura en la hoja de gastos: es anterior a su detalle. Fecha ESTIMADA (Felipe lo ubica en 2024) — corregir si aparece la factura.'),
    ('TRU', 'Smartphone Xiaomi Redmi Note 12',       date '2025-07-14',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 130 «Celular Xiaomi» (14-07-2025). Serie pendiente de completar.'),
    ('TRU', 'Laptop Lenovo Legion 5 15IMH-05',       date '2024-10-15',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 126 «Laptop Legion Lenovo» (15-10-2024). ⚠ El anexo la valoriza por encima de la hoja: costo revaluado, el mayor valor no es deducible.'),
    ('TRU', 'Parlante JBL Authentics 500',           date '2026-05-10',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 258 (10-05-2026), monto exacto S/ 1,899.00. Serie por verificar en la etiqueta: ...18698 o ...16698.'),
    ('TRU', 'Parlante JBL Authentics 300',           date '2026-05-11',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 259 (11-05-2026), monto exacto S/ 1,289.00.'),
    ('TRU', 'Cámara Canon EOS 80D + lentes',         date '2024-01-01',
     'Anexo IV, 01-jul-2026. ⚠ No figura en la hoja de gastos: es anterior a su detalle. Fecha ESTIMADA (Felipe lo ubica en 2024) — corregir si aparece la factura.'),

    -- ── Arequipa ────────────────────────────────────────────────────────────
    ('AQP', 'MacBook Air 13" chip M5',               date '2026-05-09',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 257 «MacBook M5» (09-05-2026) — se pagó con la contabilidad de Trujillo y el equipo se asignó a Arequipa.'),
    ('AQP', 'MacBook Air 13" (segunda unidad)',      date '2025-07-21',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA AQP fila 30 «MacBook Air M4» (21-07-2025).'),
    ('AQP', 'Mac Mini chip M4',                      date '2025-08-18',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 136 (18-08-2025) — es la cuarta de las Mac Mini compradas en Trujillo; tres se quedaron allá y esta se asignó a Arequipa. ⚠ Costo revaluado; el mayor valor no es deducible.'),
    ('AQP', 'iPhone 15 — 128 GB',                    date '2026-05-08',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA TRU fila 256 (08-05-2026) — se pagó con la contabilidad de Trujillo y el equipo se asignó a Arequipa.'),
    ('AQP', 'Smartphone Xiaomi Redmi 13X',           date '2024-04-24',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA AQP fila 22 «Xiaomi teléfono» (24-04-2024).'),
    ('AQP', 'Laptop Lenovo V14-IIL',                 date '2024-01-01',
     'Anexo IV, 01-jul-2026. ⚠ No figura en ninguna de las dos hojas de gastos. Fecha ESTIMADA en enero de 2024 — corregir si aparece la factura.'),
    ('AQP', 'Parlante JBL Authentics 200',           date '2026-05-19',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA AQP fila 323 «JBL Authentics 200 (2)» (19-05-2026), S/ 1,918.00 por las dos unidades = S/ 959.00 cada una.'),
    ('AQP', 'Parlante JBL Authentics 200 — 2.ª',     date '2026-05-19',
     'Anexo IV, 01-jul-2026. Compra: hoja SINATRA AQP fila 323 «JBL Authentics 200 (2)» (19-05-2026), S/ 1,918.00 por las dos unidades = S/ 959.00 cada una.')
)
update retail.activos_fijos a
   set fecha_adquisicion = j.fecha,
       depreciacion_apertura = least(
         round((a.costo - a.valor_residual) / a.vida_util_meses
               * ((extract(year from c.hasta) - extract(year from j.fecha)) * 12
                  + (extract(month from c.hasta) - extract(month from j.fecha)) + 1), 2),
         a.costo - a.valor_residual),
       nota = j.nota
  from ajuste j
  cross join corte c
  join public.sedes s on s.codigo = j.sede
 where a.unidad_id = s.id
   and a.nombre = j.nombre;


-- ── Lo único que faltaba por encima del umbral de 1/4 de UIT ────────────────
-- De las 188 filas IME de las dos hojas, el único bien que supera el umbral y
-- no está en ningún anexo. Los demás que lo superan resultaron ser los mismos
-- equipos de los anexos comprados desde otra sede. Queda una zona gris —
-- Pantallas S/ 1,273, Robot aspiradora S/ 1,095, Etiquetadora Brother S/ 926,
-- todos de 2025— que hoy figura debajo del umbral pero que a costo de
-- adquisición probablemente lo pasaba: la hoja ya no guarda ese costo, así que
-- no se puede decidir sin las facturas. No entran, y queda dicho acá.
insert into retail.activos_fijos
  (unidad_id, nombre, serie, cuenta_codigo, costo, valor_residual,
   vida_util_meses, tasa_anual, fecha_adquisicion, depreciacion_apertura, nota)
select s.id, 'Cafetera y molino', null, '335', 1419.00,
       round(1419.00 * 0.10, 2), 120, 0.1000, date '2026-05-13',
       round(1419.00 * 0.90 / 120 * 3, 2),
       'Hoja SINATRA AQP fila 314 (13-05-2026). Sin constancia de custodia firmada. Supera por poco 1/4 de UIT: si el contador prefiere mandarlo a gasto del ejercicio, se da de baja.'
from public.sedes s
where s.codigo = 'AQP'
  and not exists (select 1 from retail.activos_fijos a
                   where a.unidad_id = s.id and a.nombre = 'Cafetera y molino');


-- Control: cómo quedó cada bien, con su fecha real.
select s.codigo as sede, a.nombre, a.cuenta_codigo as cuenta,
       a.costo, a.fecha_adquisicion, a.depreciacion_apertura as depreciado,
       a.costo - a.depreciacion_apertura as neto
from retail.activos_fijos a
join public.sedes s on s.id = a.unidad_id
where s.codigo in ('TRU', 'AQP')
order by s.codigo, a.fecha_adquisicion, a.nombre;
