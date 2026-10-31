-- Categoría de gasto «Consumibles del Taller» (ADR-0594, Felipe 2026-10-31).
--
-- El problema: las agujas, el hilo general y el aceite de máquina entraban al estante de Insumos como avíos. Pero un consumible no pertenece
-- a ninguna orden de producción, y el libro de insumos exige una orden para todo «consumo» (`movimientos_insumo_produccion_segun_tipo`,
-- 20260917145000): lo único que le quedaba era salir como «merma», o quedarse en el estante contando como capital para siempre.
--
-- La decisión: un consumible es un GASTO del Taller, no un insumo con estante. Se anota en la sede Taller, con esta categoría, y cae en la
-- cuenta 656 · Suministros, la misma de «Suministros y útiles», «Limpieza» y «Bolsas y empaque». Para el contador nada cambia en el Estado
-- de resultados (agrupa por cuenta, no por categoría); lo que cambia es que Finanzas ▸ Gastos separa lo que el Taller gasta en agujas e hilo
-- de lo que se gasta en bolsas y útiles, que es lo que hace falta para decir, más adelante, cuánto consumible gasta el Taller por prenda.
--
-- Por qué una categoría propia y no los ejemplos de «Suministros y útiles»: esa categoría mezcla bolsas, papel y limpieza de las tres sedes;
-- sumar solo el consumible del Taller obligaría a leer la descripción de cada gasto escrita a mano (lo mismo que ADR-0477 resolvió con Luz y Agua).
--
-- Qué NO toca: el costo de la prenda (`variantes.costo`). El Taller se mide como una unidad aparte (P-31, ADR-0547): lo que el Taller gasta en sí mismo
-- queda fuera del costo de la prenda, y por eso NO se suma un monto fijo a la prenda —se contaría dos veces: al comprar y al vender—. Tampoco toca
-- `gasto_reparto_claure`: sin fila, la parte de CLAURE de esta categoría es 0 %, y el Taller es de CAYLA.
--
-- Una sola parte: una fila de un catálogo (sin `alter`, sin políticas, sin disparadores). Idempotente: se puede pegar dos veces.
-- Orden 21: las dos categorías anteriores más nuevas son `limpieza` (19) y `bolsas` (20), de 20261029044000.
--
-- Verificación en producción (debe devolver UNA fila: QUEDÓ BIEN): la última sentencia de este archivo.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden)
values ('consumibles_taller', 'Consumibles del Taller', 'Agujas, hilo general, aceite de máquina, tiza de sastre', '656', true, 21)
on conflict (codigo) do nothing;

-- Tres respuestas distintas, para que un REVISAR diga qué revisar. Un orden repetido de una categoría ajena no es un error de esta
-- migración: es un aviso.
select case
         when not exists (select 1 from retail.categorias_gasto
                           where codigo = 'consumibles_taller' and cuenta_pcge = '656' and activo)
           then 'REVISAR: falta «Consumibles del Taller» (cuenta 656) o está inactiva'
         when not exists (select 1 from retail.cuentas where codigo = '656')
           then 'REVISAR: no existe la cuenta 656 (Suministros) en el plan de cuentas'
         when exists (select 1 from retail.categorias_gasto where activo group by orden having count(*) > 1)
           then 'AVISO (la migración quedó bien): otra categoría repite un orden: '
                || (select string_agg(orden || ' = ' || cods, ' · ' order by orden)
                      from (select orden, string_agg(codigo, ', ' order by codigo) as cods
                              from retail.categorias_gasto where activo group by orden having count(*) > 1) d)
         else 'QUEDÓ BIEN'
       end as resultado;
