-- Categoría de gasto «Gastos del CEO» (Felipe 2026-11-27).
--
-- El problema: las comidas, viajes y demás consumos del CEO que paga CAYLA se anotaban como «Viaje de compra», así que esa cifra decía que
-- viajar a comprar cuesta mucho más de lo que cuesta. Y un gasto en «Viaje de compra» ya no se puede recategorizar (`corregir_gasto` lo
-- rechaza): hay que anularlo y volver a anotarlo.
--
-- La decisión: una categoría propia en una subcuenta propia, 6393 · Gastos del CEO. Con la 639 a secas el Estado de resultados los mostraba como
-- «Comisiones bancarias» (agrupa por cuenta, no por categoría). Ni la 62/625 (no es planilla ni atención al equipo) ni la 631 (no todo es
-- transporte). El contador puede pedir otro código: se cambia en estas dos filas sin tocar los gastos.
--
-- Qué NO toca: `no_requiere_papel` queda en false, así que un consumo sin comprobante no resta en el sustento de la renta, que es lo correcto.
-- Sin fila en `gasto_reparto_claure`: la parte de CLAURE es 0 %.
--
-- Una sola parte: dos filas de catálogos (sin `alter`, sin políticas, sin disparadores). Idempotente: se puede pegar dos veces.
--
-- Verificación en producción (debe devolver UNA fila: QUEDÓ BIEN): la última sentencia de este archivo.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('6393', 'Gastos del CEO', 'gasto', 'gastos_operacion', 51)
on conflict (codigo) do nothing;

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden)
values ('gastos_ceo', 'Gastos del CEO', 'Comidas, viajes y consumos del CEO', '6393', true, 24)
on conflict (codigo) do nothing;

select case
         when not exists (select 1 from retail.categorias_gasto where codigo = 'gastos_ceo' and cuenta_pcge = '6393' and activo)
           then 'REVISAR: falta «Gastos del CEO» (cuenta 6393) o está inactiva'
         when exists (select 1 from retail.categorias_gasto where activo group by orden having count(*) > 1)
           then 'AVISO (la migración quedó bien): otra categoría repite un orden'
         else 'QUEDÓ BIEN'
       end as resultado;
