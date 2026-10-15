-- ============================================================================
-- CARGA DE ACTIVOS FIJOS — Tienda Trujillo y Tienda Arequipa
--
-- ⚠️ SE PEGA EN EL SQL EDITOR DEL PROYECTO cayla-DYNAMIC, no en uno de retail.
-- Desde la unificación, las 22 tablas de retail viven en el cajón `retail` de
-- esa base; la app las lee con `db: { schema: "retail" }`.
--
-- QUÉ PROMETE
--   Deja cargados los 17 bienes que constan en el Anexo IV de los contratos de
--   la encargada de Trujillo y del encargado de Arequipa (01-jul-2026), cada uno
--   con su cuenta contable, su vida útil, su valor residual y la depreciación ya
--   corrida hasta el cierre de julio 2026.
--
-- QUÉ ASUME  (lo que hay que revisar antes de pegar)
--   · FECHA DE COMPRA: 01-ene-2026 para todos. Los anexos son constancias de
--     custodia, no facturas: dicen quién responde por el bien, no cuándo se
--     compró. Felipe corrigió que la gran mayoría se adquirió este año, así que
--     se cuenta desde enero de 2026. Los que sean más viejos se corrigen fila
--     por fila cuando aparezca su factura: la fecha vive en un solo sitio (el
--     CTE `corte`) o, si difiere por bien, se le agrega una columna a la tabla
--     de datos. Nunca repartida por el script.
--   · CORTE: 31-jul-2026, el último mes cerrado. Son 7 meses contando el de
--     compra completo (ene-2026 … jul-2026).
--   · El fondo de caja de S/ 1,200 del anexo de Trujillo NO entra: es efectivo,
--     no activo fijo. Por eso el total de acá (S/ 20,938) no cuadra con los
--     S/ 22,138 del documento firmado, y está bien que no cuadre.
--   · «Otros activos del establecimiento» tampoco entra: sin serie y sin valor
--     no es un bien identificable; sumaría S/ 0.00 fingiendo que está
--     inventariado. Queda para cuando se levante ese detalle.
--
-- CRITERIO (no se inventa acá: es el de `0022_activos_fijos.sql`)
--   Línea recta desde la compra, metodología NIIF con tasas SUNAT.
--     · 336 Equipos de cómputo — 4 años (48 meses), residual 5 %, tasa 25 %.
--     · 335 Muebles y enseres  — 10 años (120 meses), residual 10 %, tasa 10 %.
--   La cámara Canon va en 336 porque el propio catálogo contable (`0020`)
--   describe esa cuenta como «Mac mini, monitor, cámara».
--   Los parlantes JBL van en 335 y NO en 336, aunque sean electrónicos: la tasa
--   del 25 % que SUNAT admite es para «equipos de procesamiento de datos», y un
--   parlante de ambiente no lo es. Cargarlos al 25 % deduciría más rápido de lo
--   que la tabla tributaria permite, y esa diferencia es reparable. Si el
--   contador prefiere 336, se cambian dos filas de la tabla de datos.
--
-- IDEMPOTENTE: se puede pegar dos veces. No inserta un bien que ya exista con
-- el mismo nombre en la misma unidad.
--
-- CÓMO SE REVIERTE
--   delete from retail.activos_fijos
--    where nota like 'Anexo IV%' and unidad_id in
--          (select id from public.sedes where codigo in ('TRU','AQP'));
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
),
datos (sede, nombre, serie, cuenta, costo) as (
  values
    -- ── Trujillo ────────────────────────────────────────────────────────────
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024)',            'XY7LDJ34J6',       '336', 4000.00),
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024) — 2.ª',      'KMHQNW753C',       '336', 4000.00),
    ('TRU', 'Mac Mini chip M4 (16 GB / 2024) — 3.ª',      'H7T6XQ4F5P',       '336', 4000.00),
    ('TRU', 'iPhone 12',                                  'DNPGQ6E70F0N',     '336', 1200.00),
    -- Serie pendiente: el anexo no la trae. Se carga igual para que el total
    -- sea el real desde el primer día; la serie se completa después.
    ('TRU', 'Smartphone Xiaomi Redmi Note 12',            null,               '336',  750.00),
    ('TRU', 'Laptop Lenovo Legion 5 15IMH-05',            'PF35R64F',         '336', 2000.00),
    -- El anexo advierte que la serie está pendiente de verificación física:
    -- GG1192-DP0018698 o GG1192-DP0016698. Se deja anotada la duda en la serie
    -- para que quien vaya a la tienda con la etiqueta sepa qué está mirando.
    ('TRU', 'Parlante JBL Authentics 500',                'GG1192-DP0018698 (o ...16698, por verificar)', '335', 1899.00),
    ('TRU', 'Parlante JBL Authentics 300',                'TL1528-LO0026546', '335', 1289.00),
    ('TRU', 'Cámara Canon EOS 80D + lentes',              '442026000337',     '336', 1800.00),

    -- ── Arequipa ────────────────────────────────────────────────────────────
    ('AQP', 'MacBook Air 13" chip M5',                    'CVVK6HGDJM',       '336', 4500.00),
    ('AQP', 'MacBook Air 13" (segunda unidad)',           'C74L6MFDV7',       '336', 4200.00),
    ('AQP', 'Mac Mini chip M4',                           'HWXW6FXHPK',       '336', 4000.00),
    ('AQP', 'iPhone 15 — 128 GB',                         'H9YGXH6XVJ',       '336', 2100.00),
    ('AQP', 'Smartphone Xiaomi Redmi 13X',                '66728/W5QU02203',  '336',  600.00),
    ('AQP', 'Laptop Lenovo V14-IIL',                      'PF1TN315',         '336', 1500.00),
    ('AQP', 'Parlante JBL Authentics 200',                'GT0255-LP0001460', '335',  959.00),
    ('AQP', 'Parlante JBL Authentics 200 — 2.ª',          'GT0255-LP0001303', '335',  959.00)
),
-- La vida útil, el residual y la tasa se derivan de la cuenta contable, no se
-- escriben bien por bien: así no puede haber una fila con 4 años y 10 % de
-- residual por un error de dedo al copiar.
reglas (cuenta, vida_meses, tasa, residual_pct) as (
  values ('336', 48, 0.2500, 0.05),
         ('335', 120, 0.1000, 0.10)
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
  m.adquisicion,
  -- Depreciación acumulada al corte: (costo − residual) / vida × meses corridos,
  -- topada a la depreciable por si algún día el corte supera la vida útil.
  least(round(d.costo * (1 - r.residual_pct) / r.vida_meses * m.n, 2),
        round(d.costo * (1 - r.residual_pct), 2)),
  'Anexo IV del contrato, 01-jul-2026. Fecha de compra supuesta: ene-2026.'
from datos d
join reglas r      on r.cuenta = d.cuenta
join public.sedes s on s.codigo = d.sede
cross join meses m
where not exists (
  select 1 from retail.activos_fijos a
   where a.unidad_id = s.id and a.nombre = d.nombre
);

-- Control: qué quedó cargado, por sede.
select s.codigo                              as sede,
       count(*)                              as bienes,
       sum(a.costo)                          as costo_total,
       sum(a.depreciacion_apertura)          as depreciacion_acumulada,
       sum(a.costo - a.depreciacion_apertura) as valor_neto
from retail.activos_fijos a
join public.sedes s on s.id = a.unidad_id
where s.codigo in ('TRU', 'AQP')
group by s.codigo
order by s.codigo;
