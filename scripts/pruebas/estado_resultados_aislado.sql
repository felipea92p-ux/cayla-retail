-- ============================================================================
-- Prueba AISLADA del Estado de Resultados — CAYLA V2 (ADR-0109 / ADR-0120)
--
-- QUÉ PRUEBA. `20260918195000_cuentas_y_parametros_tributarios.sql`, `20260918196000_fn_asientos.sql` y
-- `20260918197000_fn_estado_resultados.sql`: cada regla de posteo (venta, anulación, devolución, cambio,
-- merma, gasto), que las fronteras de mes se cuentan en HORA DE LIMA, que el IGV sale de la tasa
-- vigente y redondea como el comprobante, que un mes ya pasado no cambia cuando cambia la tasa, que el
-- consolidado suma todo (incluida «De la empresa»), y que los avisos (sin costo, descuadres) avisan.
--
-- POR QUÉ ES "AISLADA". Tablas mínimas con los mismos nombres y columnas que las migraciones reales y
-- stubs de `fn_es_lider` / `fn_hoy_lima`. LO QUE NO PRUEBA: la `fn_es_lider` verdadera, ni datos reales
-- (esa verificación es de Felipe: elegir un mes con ventas y cuadrar contra la suma de cierres de caja).
--
-- LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (ver el bloque «Datos»), no salen de la función: una
-- prueba que compara el código con el propio código no prueba nada.
--
-- CÓMO SE CORRE: `node scripts/pruebas/estado_resultados_aislado.mjs` (Postgres efímero + mutantes). A mano,
-- sobre una base vacía y desechable (BORRA el schema `retail`):
--   psql -X -v ON_ERROR_STOP=1 -v m1=supabase/migrations/20260918195000_cuentas_y_parametros_tributarios.sql \
--        -v m2=supabase/migrations/20260918196000_fn_asientos.sql -v m3=supabase/migrations/20260918197000_fn_estado_resultados.sql \
--        -d prueba -f scripts/pruebas/estado_resultados_aislado.sql
-- ============================================================================

-- (El preludio —zona UTC, tablas mínimas, stubs y las tres migraciones— vive en estado_resultados_preludio.sql.)
\i scripts/pruebas/estado_resultados_preludio.sql

-- ============================================================================
-- Datos. Mes de la prueba: SEPTIEMBRE 2026 (hora de Lima). Precios CON IGV al 18 %.
-- (IGV = total − round(total − total/1.18, 2); neta = total − IGV)
--   S1 200 → IGV 30.51, neta 169.49 · S2 90 → 13.73 / 76.27 · S3 150 → 22.88 / 127.12 · 100 → 15.25 / 84.75
-- ============================================================================
create function public.u(n integer) returns uuid language sql immutable as $$ select ('aaaaaaaa-0000-4000-8000-00000000000' || n)::uuid $$;
create function public.k(prefijo text, n integer) returns uuid language sql immutable
as $$ select (prefijo || '-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
-- TRU = u(1), AQP = u(2), Taller = u(3), Tienda vieja inactiva = u(4)
insert into retail.ubicaciones (id, nombre, tipo, activo) values
  (public.u(1), 'Tienda TRU', 'tienda', true), (public.u(2), 'Tienda AQP', 'tienda', true),
  (public.u(3), 'Taller', 'taller', true), (public.u(4), 'Tienda vieja', 'tienda', false);

-- Variantes: vA costo actual 50 (subió el 5-sep de 40 a 50) · vB sin costo · vN costo 60 · vM «Monto manual»
insert into retail.variantes (id, costo) values
  (public.k('bbbbbbbb', 1), 50), (public.k('bbbbbbbb', 2), 0), (public.k('bbbbbbbb', 3), 60),
  ('22222222-2222-4222-8222-222222222222', 0);
insert into retail.costo_historial (variante_id, costo_anterior, costo_resultante, created_at)
  values (public.k('bbbbbbbb', 1), 40, 50, '2026-09-05 12:00:00-05');

create function public.venta(n integer, ubic uuid, cuando timestamptz, estado text default 'completada', anulada timestamptz default null)
returns void language sql as $$
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, created_at)
  values (public.k('cccccccc', n), ubic, estado, anulada, cuando)
$$;
create function public.item(n integer, venta integer, variante integer, cant integer, precio numeric, desc_ numeric, costo numeric)
returns void language sql as $$
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (public.k('dddddddd', n), public.k('cccccccc', venta), public.k('bbbbbbbb', variante), cant, precio, desc_, costo)
$$;
create function public.pago(venta integer, metodo text, monto numeric) returns void language sql as $$
  insert into retail.venta_pagos (venta_id, metodo, monto) values (public.k('cccccccc', venta), metodo, monto)
$$;

-- S1  TRU 10-sep   vA×2 a 100 (costo 40)                      pago efectivo 200
select public.venta(1, public.u(1), '2026-09-10 12:00:00-05'); select public.item(1, 1, 1, 2, 100, 0, 40); select public.pago(1, 'efectivo', 200);
-- S2  TRU 11-sep   vA×1 a 100 con 10 de descuento (costo 40)  pago tarjeta 50 + yape 40
select public.venta(2, public.u(1), '2026-09-11 12:00:00-05'); select public.item(2, 2, 1, 1, 100, 10, 40); select public.pago(2, 'tarjeta', 50); select public.pago(2, 'yape', 40);
-- S3  AQP 12-sep   vB×3 a 50 (SIN costo)                       pago transferencia 150
select public.venta(3, public.u(2), '2026-09-12 12:00:00-05'); select public.item(3, 3, 2, 3, 50, 0, 0); select public.pago(3, 'transferencia', 150);
-- S4  TRU 30-sep 23:30 LIMA (= 1-oct 04:30 UTC)   vA×1 a 100    pago efectivo 100  → cuenta en SEPTIEMBRE
select public.venta(4, public.u(1), '2026-09-30 23:30:00-05'); select public.item(4, 4, 1, 1, 100, 0, 40); select public.pago(4, 'efectivo', 100);
-- S5  TRU 1-oct 00:10 LIMA → OCTUBRE, no septiembre
select public.venta(5, public.u(1), '2026-10-01 00:10:00-05'); select public.item(5, 5, 1, 1, 100, 0, 40); select public.pago(5, 'efectivo', 100);
-- S6  TRU 31-ago 23:50 LIMA (= 1-sep 04:50 UTC) → AGOSTO, no septiembre
select public.venta(6, public.u(1), '2026-08-31 23:50:00-05'); select public.item(6, 6, 1, 1, 100, 0, 40); select public.pago(6, 'efectivo', 100);
-- S7  TRU 15-sep, ANULADA el 20-sep (vendible): la venta y su reversa caen en septiembre → neto 0
select public.venta(7, public.u(1), '2026-09-15 12:00:00-05', 'anulada', '2026-09-20 12:00:00-05'); select public.item(7, 7, 1, 1, 100, 0, 40); select public.pago(7, 'efectivo', 100);
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (public.k('cccccccc', 7), public.k('dddddddd', 7), 'vendible');
-- S8  AQP 16-sep, ANULADA el 22-sep con prenda NO vendible: reversa del ingreso y el costo pasa a MERMA (40)
select public.venta(8, public.u(2), '2026-09-16 12:00:00-05', 'anulada', '2026-09-22 12:00:00-05'); select public.item(8, 8, 1, 1, 100, 0, 40); select public.pago(8, 'efectivo', 100);
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (public.k('cccccccc', 8), public.k('dddddddd', 8), 'danada_donar');
-- S9  TRU vendida en AGOSTO (20-ago), ANULADA el 5-sep (vendible): la venta NO está en septiembre, su reversa SÍ
select public.venta(9, public.u(1), '2026-08-20 12:00:00-05', 'anulada', '2026-09-05 12:00:00-05'); select public.item(9, 9, 1, 1, 100, 0, 40); select public.pago(9, 'efectivo', 100);
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (public.k('cccccccc', 9), public.k('dddddddd', 9), 'vendible');

-- Devoluciones sobre S1 (línea 1: 100 c/u, costo 40): D1 aprobada 14-sep 1 unidad efectivo · D2 pendiente · D3 rechazada
insert into retail.devoluciones (id, venta_id, estado, reembolso_monto, reembolso_metodo, aprobado_en) values
  (public.k('eeeeeeee', 1), public.k('cccccccc', 1), 'aprobada', null, 'efectivo', '2026-09-14 10:00:00-05'),   -- reembolso_monto NULL: se valora por la línea
  (public.k('eeeeeeee', 2), public.k('cccccccc', 1), 'pendiente', null, null, null),
  (public.k('eeeeeeee', 3), public.k('cccccccc', 1), 'rechazada', 100, 'efectivo', '2026-09-14 11:00:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad) values
  (public.k('eeeeeeee', 1), public.k('dddddddd', 1), 1), (public.k('eeeeeeee', 2), public.k('dddddddd', 1), 1), (public.k('eeeeeeee', 3), public.k('dddddddd', 1), 1);

-- Cambio sobre S2 (100 − 10 = 90, costo 40) por vN (costo 60): diferencia +30 en efectivo el 13-sep
insert into retail.cambios (venta_item_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, created_at)
  values (public.k('dddddddd', 2), public.k('bbbbbbbb', 3), 1, 30, 'efectivo', '2026-09-13 12:00:00-05');

-- Mermas y otros movimientos
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values
  (public.k('bbbbbbbb', 1), public.u(1), 'ajuste', -2, 'merma',                          '2026-09-03 12:00:00-05'),  -- ANTES del cambio de costo: 2 × 40 = 80
  (public.k('bbbbbbbb', 1), public.u(2), 'salida',  1, 'cuarentena_se_boto',             '2026-09-08 12:00:00-05'),  -- después: 50 (AQP)
  (public.k('bbbbbbbb', 1), public.u(1), 'salida',  1, 'cuarentena_donada',              '2026-09-09 12:00:00-05'),  -- 50
  (public.k('bbbbbbbb', 1), public.u(1), 'salida',  1, 'cuarentena_devuelta_proveedor',  '2026-09-09 13:00:00-05'),  -- NO es merma
  (public.k('bbbbbbbb', 1), public.u(1), 'ajuste', -1, 'conteo',                         '2026-09-20 12:00:00-05'),  -- faltante de conteo: 50
  (public.k('bbbbbbbb', 1), public.u(1), 'ajuste',  3, 'conteo',                         '2026-09-20 12:05:00-05'),  -- sobrante: no se reconoce
  (public.k('bbbbbbbb', 2), public.u(1), 'ajuste', -2, 'merma',                          '2026-09-21 12:00:00-05'),  -- sin costo: 0 y se AVISA (2 u.)
  (public.k('bbbbbbbb', 1), public.u(1), 'ajuste', -1, 'reposicion',                     '2026-09-21 13:00:00-05');  -- no es merma

-- Gastos: G1 TRU factura de alquiler 1180 (base 1000 + IGV 180) · G2 «de la empresa» 300 efectivo · G3 anulado · G4 de octubre
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado) values
  (public.u(1), 'alquileres', 'Alquiler TRU', '2026-09-10', 1180, 180, 'transferencia', 'vigente'),
  (null, 'servicios_basicos', 'Internet oficina', '2026-09-15', 300, 0, 'efectivo', 'vigente'),
  (public.u(1), 'alquileres', 'Anulado', '2026-09-16', 999, 0, 'yape', 'anulado'),
  (public.u(1), 'alquileres', 'De octubre', '2026-10-02', 500, 0, 'yape', 'vigente');

create temp table er as select * from retail.fn_estado_resultados('2026-09-15');   -- cualquier fecha del mes

-- ============================================================================
-- E1. Plan de cuentas y tasa
-- ============================================================================
select public.t_ok((select count(*) from retail.cuentas) = 26, 'E1 el plan de cuentas tiene las 26 cuentas del manual');
select public.t_ok(retail.fn_tasa_igv('2026-09-15') = 0.18, 'E1 la tasa de IGV de septiembre es 18 %');
select public.t_falla($$select retail.fn_tasa_igv('2010-01-01')$$, 'No hay tasa de IGV');
select public.t_falla($$insert into retail.categorias_gasto values ('otros', 'Otros', '999')$$, 'categorias_gasto_cuenta_fkey');

-- ============================================================================
-- E2. Estado de Resultados de septiembre — TRU (esperado a mano)
--   ventas netas 186.43  = S1 169.49 + S2 76.27 + S4 84.75 + S7 84.75 − S7 84.75 − S9 84.75 − D1 84.75 + cambio 25.42
--   IGV 33.57            ; brutas 220.00 (= 200+90+100+100−100−100−100+30)
--   costo 100            = 80+40+40+40 −40 −40 −40 +20 (S1,S2,S4,S7, reversa S7, reversa S9, D1, ajuste del cambio)
--   mermas 180           = 80 (2×40 antes del cambio de costo) + 50 (donada) + 50 (faltante de conteo) + 0 (sin costo)
--   margen −93.57 ; gastos 1000 (la factura sin su IGV) ; utilidad −1093.57
-- ============================================================================
select public.t_ok((select ventas_netas = 186.43 from er where ubicacion_id = public.u(1)), 'E2 TRU ventas netas = 186.43 (frontera de mes en hora de Lima, anulaciones en el mes del hecho)');
select public.t_ok((select igv_ventas = 33.57 and ventas_brutas = 220.00 from er where ubicacion_id = public.u(1)), 'E2 TRU IGV = 33.57 y ventas con IGV = 220.00');
select public.t_ok((select costo_ventas = 100 from er where ubicacion_id = public.u(1)), 'E2 TRU costo de ventas = 100 (sale el costo sellado; la reversa de S9 cae en septiembre)');
select public.t_ok((select mermas = 180 from er where ubicacion_id = public.u(1)), 'E2 TRU mermas = 180 (costo de la fecha: 2×40 antes del cambio; devuelta a proveedor y sobrantes NO)');
select public.t_ok((select margen_bruto = -93.57 from er where ubicacion_id = public.u(1)), 'E2 TRU margen bruto = −93.57');
select public.t_ok((select gastos_operacion = 1000 and utilidad_operativa = -1093.57 from er where ubicacion_id = public.u(1)), 'E2 TRU gastos = 1000 (sin el IGV de la factura) y utilidad = −1093.57');
select public.t_ok((select fletes = 0 from er where ubicacion_id = public.u(1)), 'E2 fletes = 0 (aún sin fuente)');
select public.t_ok((select mermas_sin_costo = 2 and unidades_sin_costo = 0 from er where ubicacion_id = public.u(1)), 'E2 TRU avisa 2 unidades de merma sin costo');

-- ============================================================================
-- E3. AQP: ventas 127.12 (S3 + S8 − reversa S8) · mermas 90 (S8 no vendible 40 + botada 50) · sin costo 3
-- ============================================================================
select public.t_ok((select ventas_netas = 127.12 and igv_ventas = 22.88 from er where ubicacion_id = public.u(2)), 'E3 AQP ventas netas = 127.12 e IGV = 22.88');
select public.t_ok((select costo_ventas = 0 from er where ubicacion_id = public.u(2)), 'E3 AQP costo de ventas = 0 (el costo de S8 se reversa y pasa a merma)');
select public.t_ok((select mermas = 90 and margen_bruto = 37.12 and utilidad_operativa = 37.12 from er where ubicacion_id = public.u(2)), 'E3 AQP mermas = 90 (anulación no vendible + botada), margen = utilidad = 37.12');
select public.t_ok((select unidades_sin_costo = 3 from er where ubicacion_id = public.u(2)), 'E3 AQP avisa 3 unidades vendidas sin costo cargado (el margen está inflado)');

-- ============================================================================
-- E4. Taller, «De la empresa», sede inactiva y consolidado
-- ============================================================================
select public.t_ok((select ventas_netas = 0 and utilidad_operativa = 0 from er where ubicacion_id = public.u(3)), 'E4 el Taller sin actividad aparece en cero');
select public.t_ok(not exists (select 1 from er where ubicacion_id = public.u(4)), 'E4 la sede inactiva sin movimientos no aparece');
select public.t_ok((select ventas_netas = 0 and gastos_operacion = 300 and utilidad_operativa = -300 from er where ubicacion_id is null and not es_consolidado),
  'E4 «De la empresa» solo tiene gastos: 300');
select public.t_ok((select count(*) = 5 from er), 'E4 cinco filas: TRU, AQP, Taller, De la empresa y Consolidado');
select public.t_ok((select ventas_netas = 313.55 and igv_ventas = 56.45 and ventas_brutas = 370.00 from er where es_consolidado), 'E4 consolidado: ventas netas 313.55, IGV 56.45, con IGV 370.00');
select public.t_ok((select costo_ventas = 100 and mermas = 270 and margen_bruto = -56.45 from er where es_consolidado), 'E4 consolidado: costo 100, mermas 270, margen −56.45');
select public.t_ok((select gastos_operacion = 1300 and utilidad_operativa = -1356.45 from er where es_consolidado), 'E4 consolidado incluye los gastos de la empresa: 1300 y utilidad −1356.45');
select public.t_ok((select unidades_sin_costo = 3 and mermas_sin_costo = 2 and asientos_descuadrados = 0 from er where es_consolidado), 'E4 consolidado: avisos 3 / 2 / 0 descuadres');
select public.t_ok((select sum(ventas_netas) from er where not es_consolidado) = (select ventas_netas from er where es_consolidado), 'E4 la suma de las sedes es exactamente el consolidado');
select public.t_ok((select detalle_gastos -> 0 ->> 'cuenta' = '635' and (detalle_gastos -> 0 ->> 'monto')::numeric = 1000 from er where ubicacion_id = public.u(1)), 'E4 el detalle de gastos trae cuenta 635 con 1000');
select public.t_ok((select jsonb_array_length(detalle_mermas) = 3 from er where ubicacion_id = public.u(1)), 'E4 el detalle de mermas de TRU separa 3 orígenes (merma, cuarentena, conteo)');

-- ============================================================================
-- E5. El diario: cuadra, y concilia contra las fuentes con OTRO cálculo
-- ============================================================================
select public.t_ok((select round(sum(debe), 2) = round(sum(haber), 2) from retail.fn_asientos('2026-09-01', '2026-09-30')), 'E5 todo el diario de septiembre cuadra (debe = haber)');
select public.t_ok((select count(*) = 0 from retail.fn_asientos_descuadrados('2026-09-01', '2026-09-30')), 'E5 no hay asientos descuadrados');
select public.t_ok((select sum(debe) from retail.fn_asientos('2026-09-01', '2026-09-30') where regla = 'venta' and cuenta in ('101', '104', '105'))
                 = (select sum(vp.monto) from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
                     where v.created_at >= '2026-09-01 00:00:00-05' and v.created_at < '2026-10-01 00:00:00-05'),
  'E5 lo cobrado en el diario = suma de venta_pagos de las ventas de septiembre (740)');
select public.t_ok((select sum(debe) from retail.fn_asientos('2026-09-01', '2026-09-30') where regla = 'venta' and cuenta = '101') = 500, 'E5 efectivo a la 101 = 500 (S1 200 + S4 100 + S7 100 + S8 100)');
select public.t_ok((select sum(debe) from retail.fn_asientos('2026-09-01', '2026-09-30') where regla = 'venta' and cuenta = '105') = 50, 'E5 la tarjeta va a 105 (en tránsito)');
select public.t_ok((select sum(debe) from retail.fn_asientos('2026-09-01', '2026-09-30') where regla = 'venta' and cuenta = '104') = 190, 'E5 yape y transferencia van directo a 104 (banco): 40 + 150');
select public.t_ok((select count(*) = 0 from retail.fn_asientos('2026-09-01', '2026-09-30') where origen_id = public.k('cccccccc', 5) or origen_id = public.k('cccccccc', 6) and regla = 'venta'),
  'E5 la venta de las 00:10 de octubre y la de las 23:50 de agosto no están en septiembre');
select public.t_ok((select count(*) = 0 from retail.fn_asientos('2026-09-01', '2026-09-30') where origen_id in (select id from retail.devoluciones where estado <> 'aprobada')),
  'E5 una devolución pendiente o rechazada no asienta nada');
select public.t_ok((select count(*) = 0 from retail.fn_asientos('2026-09-01', '2026-09-30') where origen_tabla = 'gastos' and glosa in ('Anulado', 'De octubre')),
  'E5 un gasto anulado o de otro mes no asienta');
select public.t_ok((select count(*) = 0 from retail.fn_asientos('2026-09-01', '2026-09-30', public.u(1)) where ubicacion_id is distinct from public.u(1)),
  'E5 pedir una sede devuelve solo esa sede');

-- ============================================================================
-- E6. Un descuadre en una fuente se AVISA (no se traga)
-- ============================================================================
update retail.venta_pagos set monto = 190 where venta_id = public.k('cccccccc', 1);   -- cobró 190 de una venta de 200
select public.t_ok((select asientos_descuadrados = 1 from retail.fn_estado_resultados('2026-09-01') where es_consolidado), 'E6 el Estado de Resultados avisa 1 asiento descuadrado');
select public.t_ok((select count(*) = 1 and bool_and(diferencia = -10) from retail.fn_asientos_descuadrados('2026-09-01', '2026-09-30')), 'E6 y dice cuál y por cuánto (−10)');
update retail.venta_pagos set monto = 200 where venta_id = public.k('cccccccc', 1);

-- ============================================================================
-- E7. Permisos: solo el líder ve; nadie escribe desde la app
-- ============================================================================
select set_config('test.lider', 'false', false);
select public.t_falla($$select * from retail.fn_asientos('2026-09-01', '2026-09-30')$$, 'Solo un líder');
-- El mensaje propio de la función (no el del diario que ella llama por dentro): así se prueba que CADA capa exige líder.
select public.t_falla($$select * from retail.fn_estado_resultados('2026-09-01')$$, 'ver el Estado de Resultados');
select public.t_falla($$select * from retail.fn_asientos_descuadrados('2026-09-01', '2026-09-30')$$, 'Solo un líder');
set role authenticated;
select public.t_ok((select count(*) from retail.cuentas) = 0, 'E7 una colaboradora no ve el plan de cuentas (RLS)');
select set_config('test.lider', 'true', false);
select public.t_ok((select count(*) from retail.cuentas) = 26, 'E7 un líder lo ve');
select public.t_falla($$insert into retail.cuentas (codigo, nombre, tipo, orden) values ('999', 'X', 'activo', 99)$$, 'permission denied');
select public.t_falla($$update retail.cuentas set nombre = 'X'$$, 'permission denied');
select public.t_falla($$insert into retail.parametros_tributarios values ('igv', '2027-01-01', 0.5)$$, 'permission denied');
reset role;

-- ============================================================================
-- E8. La tasa cambia: octubre usa la nueva, septiembre NO se mueve (un mes pasado no cambia)
-- ============================================================================
select public.t_falla($$update retail.parametros_tributarios set valor = 0.2$$, 'no se edita ni se borra');
select public.t_falla($$delete from retail.parametros_tributarios$$, 'no se edita ni se borra');
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, nota) values ('igv', '2026-10-01', 0.20, 'prueba');
select public.t_ok(retail.fn_tasa_igv('2026-09-30') = 0.18 and retail.fn_tasa_igv('2026-10-01') = 0.20, 'E8 la tasa nueva rige desde su fecha, no antes');
select public.t_ok((select ventas_netas = 186.43 from retail.fn_estado_resultados('2026-09-10') where ubicacion_id = public.u(1)), 'E8 septiembre NO cambió al cambiar la tasa (sigue 186.43)');
-- S5 (1-oct, 100 a 20 %): IGV = 100 − 100/1.2 = 16.67 ; neta 83.33
select public.t_ok((select ventas_netas = 83.33 and igv_ventas = 16.67 from retail.fn_estado_resultados('2026-10-15') where ubicacion_id = public.u(1)), 'E8 octubre usa el 20 %: neta 83.33, IGV 16.67');
select public.t_ok((select gastos_operacion = 500 from retail.fn_estado_resultados('2026-10-15') where ubicacion_id = public.u(1)), 'E8 octubre: el gasto de octubre (500) cae en octubre');

select 'TOTAL DE VERIFICACIONES OK: ' || n as resultado from public.t_cuenta;
