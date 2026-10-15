-- ============================================================================
-- CARGA DE ACTIVOS FIJOS — Taller de Confección de Lima (sede LIM)
--
-- ⚠️ SE PEGA EN EL SQL EDITOR DEL PROYECTO cayla-DYNAMIC.
--
-- QUÉ PROMETE
--   Deja cargados 21 bienes del taller: los 8 que constan en el Anexo IV del
--   contrato de la encargada del taller (01-jul-2026) y los 13 que solo están
--   en la hoja de gastos SINATRA 2026 LIM, orientados a IME.
--
-- DE DÓNDE SALE CADA DATO, Y POR QUÉ IMPORTA
--   Son dos fuentes distintas y no dicen lo mismo:
--     · El ANEXO IV da el bien, su número de serie y su valor declarado. Es lo
--       que la persona firmó tener bajo custodia.
--     · La HOJA DE GASTOS da la FECHA DE COMPRA, que el anexo no trae (una
--       constancia de custodia dice quién responde por el bien, no cuándo se
--       compró). Sin fecha no hay depreciación posible.
--   Se cruzaron por monto. Siete de los ocho bienes del anexo tienen su fila
--   exacta en la hoja; el octavo (la Mac Mini) no cuadra y está anotado abajo.
--
--   El cruce que cierra el caso: la fila de S/ 8,784.00 del 07-08-2025
--   —«Maquinas de coser Remalladora mellicera, recta computarizada y recta
--   industrial - JUKI»— es exactamente la suma de tres bienes del anexo:
--   3,744.00 + 3,492.00 + 1,548.00. La hoja las compró juntas y el anexo las
--   desglosó. Por eso las tres llevan esa misma fecha.
--
-- LO QUE QUEDA CON UNA DUDA ANOTADA (decisiones de Felipe, 2026-08-11)
--   · MAC MINI: se carga con los S/ 3,500 del anexo firmado, no con los
--     S/ 2,499 de la hoja. La fecha sí sale de la hoja (21-08-2025), que es la
--     única compra de una Mac Mini registrada en Lima. La diferencia de
--     S/ 1,001 queda escrita en la nota del bien, no escondida en el total.
--   · OVERLOCK SIRUBA: la hoja lo registra como «Remalladora (2) Industrial de
--     5 hilos». Se carga UNA máquina, que es lo que dice el anexo, con la duda
--     anotada: si en el taller hay dos, falta un activo y falta una custodia.
--   · LOS 13 DE LA HOJA no tienen constancia firmada. Se cargan igual —el
--     registro de activos refleja lo que la empresa tiene, no solo lo que
--     alguien firmó— y su nota dice de qué fila salieron. Tres de ellos
--     («Cámara y tarjeta», «Oficina Lima», «Infraestructura Lima») tienen una
--     descripción genérica: entran con el nombre que traía la hoja y marcados
--     como pendientes de identificar.
--
-- ⚠️ DOS SALVEDADES SOBRE ESOS 13, QUE NO APLICAN A LOS 8 DEL ANEXO
--   1. Su costo sale de la hoja de gastos, y la hoja lleva el valor que Felipe
--      YA venía depreciando — no el precio de compra. Como todos son de agosto
--      de 2025 en adelante, el desgaste aplicado ahí es chico, pero su valor
--      neto queda algo por debajo de lo real: se les descuenta dos veces un
--      pedazo del mismo desgaste. Se corrige el día que aparezcan las facturas.
--      Los 8 del anexo NO tienen este problema: su costo viene del anexo.
--   2. Ninguno llega a 1/4 de UIT (el mayor es S/ 979). Con el criterio que se
--      fijó después para Trujillo y Arequipa —capitalizar solo por encima de
--      ese umbral— estos 13 irían a gasto del ejercicio y no acá. Se cargan
--      porque así se decidió para el taller antes de fijar el umbral; si se
--      prefiere la regla pareja para las tres sedes, salen todos juntos con:
--        delete from retail.activos_fijos where nota like 'Hoja de gastos%';
--
-- CRITERIO (el de `0022_activos_fijos.sql`, línea recta desde la compra)
--     · 333 Maquinaria y equipo  — 10 años, residual 10 %, tasa 10 %.
--     · 335 Muebles y enseres    — 10 años, residual 10 %, tasa 10 %.
--     · 336 Equipos de cómputo   —  4 años, residual  5 %, tasa 25 %.
--   Acá la fecha de compra es REAL y distinta por bien, así que la
--   depreciación acumulada se calcula fila por fila hasta el corte del
--   31-07-2026, contando el mes de compra completo.
--
-- IDEMPOTENTE: se puede pegar dos veces. No inserta un bien que ya exista con
-- el mismo nombre en la misma unidad.
--
-- CÓMO SE REVIERTE
--   delete from retail.activos_fijos
--    where unidad_id = (select id from public.sedes where codigo = 'LIM')
--      and (nota like 'Anexo IV%' or nota like 'Hoja de gastos%');
-- ============================================================================

with corte as (
  select date '2026-07-31' as hasta
),
datos (nombre, serie, cuenta, costo, fecha, nota) as (
  values
    -- ── Los 8 del Anexo IV (con constancia de custodia firmada) ─────────────
    ('Mac Mini chip M4 / 16 GB («Lim Production»)', 'C37NKGQNH0', '336', 3500.00, date '2025-08-21',
     'Anexo IV del contrato, 01-jul-2026. Valor del anexo (S/ 3,500); la hoja de gastos registra S/ 2,499 el 21-08-2025 — diferencia de S/ 1,001 por revisar.'),
    ('Aspiradora Xiaomi G20 Max', '57806 / BWAGPF5RW00035', '335', 1044.00, date '2026-01-14',
     'Anexo IV del contrato, 01-jul-2026. Fecha y monto cuadran con la hoja de gastos (fila 26).'),
    ('Máquina recta JUKI DDL-8000C (computarizada IA)', '4D0TM01611', '333', 3744.00, date '2025-08-07',
     'Anexo IV del contrato, 01-jul-2026. Comprada dentro de la fila de S/ 8,784.00 del 07-08-2025 (tres JUKI juntas).'),
    ('Máquina recta Siruba DL8000-BM1-16Q', '925T010120', '333', 1680.00, date '2025-12-03',
     'Anexo IV del contrato, 01-jul-2026. Fecha y monto cuadran con la hoja de gastos (fila 19).'),
    ('Máquina recta JUKI DDL-8700 (4D0UD00888)', '4D0UD00888', '333', 1668.50, date '2025-08-27',
     'Anexo IV del contrato, 01-jul-2026. Fecha y monto cuadran con la hoja de gastos (fila 27).'),
    ('Máquina recta JUKI DDL-8700 (4D0UD00812)', '4D0UD00812', '333', 1548.00, date '2025-08-07',
     'Anexo IV del contrato, 01-jul-2026. Comprada dentro de la fila de S/ 8,784.00 del 07-08-2025 (tres JUKI juntas).'),
    ('Remalladora JUKI MO-6714DA (BE6-40H)', '8M0UD03299', '333', 3492.00, date '2025-08-07',
     'Anexo IV del contrato, 01-jul-2026. Comprada dentro de la fila de S/ 8,784.00 del 07-08-2025 (tres JUKI juntas).'),
    ('Overlock Siruba 757L-516M-3-35', '125L011862', '333', 2675.40, date '2025-10-13',
     'Anexo IV del contrato, 01-jul-2026. ⚠ La hoja de gastos (fila 13) lo registra como «Remalladora (2) Industrial de 5 hilos»: verificar en el taller si son DOS máquinas. Si lo son, falta cargar la segunda y falta su constancia de custodia.'),

    -- ── Los 13 que solo están en la hoja de gastos (sin custodia firmada) ───
    ('Cortadora de tela',                         null, '333',  519.20, date '2026-06-15',
     'Hoja de gastos SINATRA 2026 LIM, fila 103. Sin constancia de custodia firmada.'),
    ('Cortadora Jack',                            null, '333',  950.00, date '2025-10-17',
     'Hoja de gastos SINATRA 2026 LIM, fila 15. Sin constancia de custodia firmada.'),
    ('Plancha industrial Silver Star',            null, '333',  230.00, date '2025-08-31',
     'Hoja de gastos SINATRA 2026 LIM, fila 7. Sin constancia de custodia firmada.'),
    ('Monitor de diseño',                         null, '336',  979.00, date '2025-08-22',
     'Hoja de gastos SINATRA 2026 LIM, fila 3. Sin constancia de custodia firmada. Comprado un día después de la Mac Mini: revisar si son un mismo puesto de trabajo.'),
    ('Cámara y tarjeta de memoria',               null, '336',  170.20, date '2025-10-11',
     'Hoja de gastos SINATRA 2026 LIM, fila 12. Descripción genérica en la hoja: falta identificar marca y modelo. Sin constancia de custodia firmada.'),
    ('Maniquí',                                   null, '335',  920.00, date '2026-01-19',
     'Hoja de gastos SINATRA 2026 LIM, fila 34. Sin constancia de custodia firmada.'),
    ('Sillas del taller',                         null, '335',  420.00, date '2025-10-30',
     'Hoja de gastos SINATRA 2026 LIM, fila 16. Sin constancia de custodia firmada.'),
    ('Mesa de corte de melamine + caballetes',    null, '335',  330.00, date '2025-09-03',
     'Hoja de gastos SINATRA 2026 LIM, fila 9. Sin constancia de custodia firmada.'),
    ('Ventilador',                                null, '335',  259.67, date '2026-02-11',
     'Hoja de gastos SINATRA 2026 LIM, fila 48. Sin constancia de custodia firmada.'),
    ('Planchador',                                null, '335',  170.00, date '2025-08-31',
     'Hoja de gastos SINATRA 2026 LIM, fila 8. Sin constancia de custodia firmada.'),
    ('Mesa plegable',                             null, '335',  139.50, date '2026-01-16',
     'Hoja de gastos SINATRA 2026 LIM, fila 30. Sin constancia de custodia firmada.'),
    ('Infraestructura Lima (por identificar)',    null, '335',  312.00, date '2025-10-13',
     'Hoja de gastos SINATRA 2026 LIM, fila 14. ⚠ La hoja no dice qué se compró: hay que identificar el bien o reclasificarlo a gasto.'),
    ('Oficina Lima (por identificar)',            null, '335',  269.70, date '2025-10-11',
     'Hoja de gastos SINATRA 2026 LIM, fila 11. ⚠ La hoja no dice qué se compró: hay que identificar el bien o reclasificarlo a gasto.')
),
-- La vida útil, el residual y la tasa se derivan de la cuenta contable, no se
-- escriben bien por bien: así no puede haber una fila con 4 años y 10 % de
-- residual por un error de dedo al copiar.
reglas (cuenta, vida_meses, tasa, residual_pct) as (
  values ('333', 120, 0.1000, 0.10),
         ('335', 120, 0.1000, 0.10),
         ('336',  48, 0.2500, 0.05)
)
insert into retail.activos_fijos
  (unidad_id, nombre, serie, cuenta_codigo, costo, valor_residual,
   vida_util_meses, tasa_anual, fecha_adquisicion, depreciacion_apertura, nota)
select
  s.id,
  d.nombre,
  d.serie,
  d.cuenta,
  d.costo,
  round(d.costo * r.residual_pct, 2),
  r.vida_meses,
  r.tasa,
  d.fecha,
  -- Meses corridos de ESTE bien, contando el de compra completo, y la
  -- acumulada topada a la depreciable por si el corte superara la vida útil.
  least(
    round(d.costo * (1 - r.residual_pct) / r.vida_meses
          * ((extract(year from c.hasta) - extract(year from d.fecha)) * 12
             + (extract(month from c.hasta) - extract(month from d.fecha)) + 1), 2),
    round(d.costo * (1 - r.residual_pct), 2)),
  d.nota
from datos d
join reglas r       on r.cuenta = d.cuenta
cross join corte c
join public.sedes s on s.codigo = 'LIM'
where not exists (
  select 1 from retail.activos_fijos a
   where a.unidad_id = s.id and a.nombre = d.nombre
);

-- Control: qué quedó cargado en el taller, separando lo firmado de lo que no.
select case when a.nota like 'Anexo IV%' then 'Anexo IV (con custodia firmada)'
            else 'Solo en la hoja de gastos' end   as origen,
       count(*)                                    as bienes,
       sum(a.costo)                                as costo_total,
       sum(a.depreciacion_apertura)                as depreciacion_acumulada,
       sum(a.costo - a.depreciacion_apertura)      as valor_neto
from retail.activos_fijos a
join public.sedes s on s.id = a.unidad_id
where s.codigo = 'LIM'
group by 1
order by 1;
