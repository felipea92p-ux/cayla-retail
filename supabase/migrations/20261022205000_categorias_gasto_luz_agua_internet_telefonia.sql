-- Categorías de gasto «Luz», «Agua», «Internet», «Telefonía» y «Software y suscripciones» (ADR-0477, Felipe 2026-10-22).
--
-- El problema: «Servicios básicos» (636) juntaba luz, agua, internet y teléfono en una sola categoría. Para saber cuánto se va en luz
-- había que leer la descripción de cada gasto, que decía a mano si era luz, agua o teléfono, y cada servicio pide cosas distintas (la
-- luz y el agua, un N.º de suministro; el celular, el número de la línea).
--
-- La decisión: cuatro categorías propias, las cuatro con la MISMA cuenta 636 · Servicios básicos. Para el contador nada cambia (el
-- Estado de resultados y el Presupuesto agrupan por cuenta, no por categoría); lo que sí cambia es que la lista de Gastos, sus totales
-- por categoría y la ficha del gasto fijo ya hablan de «Luz» o de «Agua». «Servicios básicos» queda para lo que no es ninguno de los
-- cuatro (el baño, el gas, la vigilancia): conserva su código Y su nombre —cambiarle el nombre rompía una prueba del CI y hacía que el
-- gasto rápido de Caja dijera «Va a Otros servicios básicos» al tocar «Luz»—, y solo se corrigen sus ejemplos para que ya no prometan
-- luz, agua, teléfono ni internet. Lo ya registrado (los gastos de baño y los fijos cargados) sigue apuntando a la misma categoría.
--
-- «Software y suscripciones» (Adobe, Google Workspace, ChatGPT, el dominio web, Shopify) va en la cuenta 639 · Otros servicios de terceros,
-- provisional hasta que el contador la confirme. Esa cuenta se llamaba «Otros servicios de terceros (bancarios)» porque la usaban solo las
-- comisiones del banco y del POS; con el software al lado el paréntesis en el Estado de resultados mentiría, así que se quita.
--
-- Qué NO toca: el gasto rápido de Caja (sus botones «Agua», «Luz» e «Internet y celular» siguen guardando en `servicios_basicos`: en
-- Caja «Agua» es la botella o el bidón de S/ 3 a S/ 12, no el recibo del agua, y el recibo entra por los gastos fijos) ni ningún gasto
-- ya registrado.
--
-- Una sola parte: solo filas de un catálogo (sin `alter`, sin políticas, sin disparadores). Idempotente: se puede pegar dos veces.
-- El `orden` se fija con una lista literal para que pegarla de nuevo no corra los números otra vez; mantiene el orden relativo de
-- todo lo que ya existía y deja las nuevas junto a «Servicios básicos».
--
-- Verificación en producción (debe devolver UNA fila: QUEDÓ BIEN): la última sentencia de este archivo.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, orden)
values
  ('luz',       'Luz',       'Recibo de la luz de la tienda, el almacén o el taller',  '636', 2),
  ('agua',      'Agua',      'Recibo del agua de la tienda, el almacén o el taller',   '636', 3),
  ('internet',  'Internet',  'Internet del local, con o sin teléfono fijo',            '636', 4),
  ('telefonia', 'Telefonía', 'Celular o plan móvil de la tienda o del equipo',         '636', 5),
  ('software',  'Software y suscripciones', 'Adobe, Google Workspace, ChatGPT, dominio web, Shopify', '639', 6)
on conflict (codigo) do nothing;

-- La cuenta 639 deja de decir «(bancarios)»: ahora también cobija el software. Solo cambia su nombre, no su código ni lo que suma.
update retail.cuentas
   set nombre = 'Otros servicios de terceros'
 where codigo = '639' and nombre = 'Otros servicios de terceros (bancarios)';

-- «Servicios básicos» pasa a ser lo que no es luz, agua, internet ni teléfono: solo cambian sus ejemplos.
update retail.categorias_gasto
   set ejemplos = 'Baño, gas, vigilancia u otro servicio del local'
 where codigo = 'servicios_basicos'
   and ejemplos is distinct from 'Baño, gas, vigilancia u otro servicio del local';

-- Orden de la lista: Alquileres, Luz, Agua, Internet, Telefonía, Software, Servicios básicos y el resto como estaba.
update retail.categorias_gasto c
   set orden = v.orden
  from (values
    ('alquileres',        1),
    ('luz',               2),
    ('agua',              3),
    ('internet',          4),
    ('telefonia',         5),
    ('software',          6),
    ('servicios_basicos', 7),
    ('transporte',        8),
    ('suministros',       9),
    ('mantenimiento',    10),
    ('publicidad',       11),
    ('asesoria',         12),
    ('gastos_bancarios', 13),
    ('tributos',         14),
    ('seguros',          15),
    ('atencion_personal',16),
    ('traer_mercaderia', 17),
    ('viaje_compra',     18)
  ) as v(codigo, orden)
 where c.codigo = v.codigo
   and c.orden is distinct from v.orden;

-- Tres respuestas distintas, para que un REVISAR diga qué revisar. Un orden repetido de una categoría ajena a esta lista no es un
-- error de esta migración: es un aviso.
select case
         when (select count(*) from retail.categorias_gasto
                where activo and ((codigo in ('luz', 'agua', 'internet', 'telefonia') and cuenta_pcge = '636')
                               or (codigo = 'software' and cuenta_pcge = '639'))) <> 5
           then 'REVISAR: faltan Luz, Agua, Internet, Telefonía (cuenta 636) o Software y suscripciones (cuenta 639), activas'
         when (select ejemplos from retail.categorias_gasto where codigo = 'servicios_basicos')
              is distinct from 'Baño, gas, vigilancia u otro servicio del local'
           then 'REVISAR: Servicios básicos no quedó con sus ejemplos nuevos'
         when exists (select 1 from retail.categorias_gasto where activo group by orden having count(*) > 1)
           then 'AVISO (la migración quedó bien): otra categoría repite un orden: '
                || (select string_agg(orden || ' = ' || cods, ' · ' order by orden)
                      from (select orden, string_agg(codigo, ', ' order by codigo) as cods
                              from retail.categorias_gasto where activo group by orden having count(*) > 1) d)
         else 'QUEDÓ BIEN'
       end as resultado;
