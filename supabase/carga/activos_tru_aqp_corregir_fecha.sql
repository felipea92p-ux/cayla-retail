-- ============================================================================
-- CORRECCIÓN — la fecha de compra de los activos de Trujillo y Arequipa
--
-- ⚠️ SE PEGA EN EL SQL EDITOR DEL PROYECTO cayla-DYNAMIC.
--
-- POR QUÉ EXISTE
--   La carga original (`activos_tru_aqp.sql`) entró con fecha de compra
--   01-ene-2025 y 19 meses de depreciación corrida. Felipe corrigió después que
--   la gran mayoría de los equipos se adquirió en 2026. Volver a pegar la carga
--   con la fecha nueva NO arregla nada: el script salta los bienes que ya
--   existen —esa es justamente su garantía de no duplicar—, así que las filas
--   viejas se quedan como estaban. Hace falta corregirlas.
--
-- QUÉ HACE
--   Mueve la fecha de compra a 01-ene-2026 y recalcula la depreciación
--   acumulada al mismo corte (31-jul-2026): 7 meses en vez de 19.
--
--   El recálculo NO vuelve a leer la lista de bienes: usa el costo, el valor
--   residual y la vida útil que ya están guardados en cada fila. Así no puede
--   pasar que la lista y la base digan cosas distintas.
--
-- A QUIÉN TOCA
--   Solo a las filas que cargó ese script —las que llevan la nota «Anexo IV…»—
--   y solo en TRU y AQP. Si mañana se recuperan los activos de Lima, esto no
--   los mira.
--
-- QUÉ TIENE QUE DEVOLVER
--   UPDATE 17, y después el control:
--     AQP · 8 bienes · 18818.00 · 2442.07 · 16375.93
--     TRU · 9 bienes · 20938.00 · 2626.50 · 18311.50
--
-- SE PUEDE PEGAR DOS VECES: la segunda deja los mismos valores.
--
-- CÓMO SE REVIERTE
--   Volver a correr esto cambiando la fecha del CTE `corte` a 2025-01-01.
-- ============================================================================

with corte as (
  select date '2026-01-01' as adquisicion,
         date '2026-07-31' as hasta
),
meses as (
  -- Meses corridos contando el de compra como mes completo: ene-2026 … jul-2026.
  select *, ((extract(year from hasta) - extract(year from adquisicion)) * 12
             + (extract(month from hasta) - extract(month from adquisicion)) + 1)::int as n
  from corte
)
update retail.activos_fijos a
   set fecha_adquisicion = m.adquisicion,
       -- (costo − residual) / vida × meses, topado a la depreciable.
       depreciacion_apertura = least(
         round((a.costo - a.valor_residual) / a.vida_util_meses * m.n, 2),
         a.costo - a.valor_residual),
       nota = 'Anexo IV del contrato, 01-jul-2026. Fecha de compra supuesta: ene-2026.'
  from meses m
 where a.nota like 'Anexo IV%'
   and a.unidad_id in (select id from public.sedes where codigo in ('TRU', 'AQP'));

-- Control: cómo quedó.
select s.codigo                               as sede,
       count(*)                               as bienes,
       min(a.fecha_adquisicion)               as fecha_compra,
       sum(a.costo)                           as costo_total,
       sum(a.depreciacion_apertura)           as depreciacion_acumulada,
       sum(a.costo - a.depreciacion_apertura) as valor_neto
from retail.activos_fijos a
join public.sedes s on s.id = a.unidad_id
where s.codigo in ('TRU', 'AQP')
group by s.codigo
order by s.codigo;
