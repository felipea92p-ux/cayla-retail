-- ============================================================================
-- IGV solo en factura — una boleta o una nota de venta no discriminan IGV
--
-- EL PROBLEMA (lo vio Felipe, 2026-09-14). `compras.igv` se calculaba con un
-- porcentaje libre que la pantalla mandaba en 18 por defecto, sin mirar el
-- tipo de documento. Nada impedía registrar una nota de venta con 18% de
-- IGV encima: el sistema decía que se le debía al proveedor un 18% más de lo
-- que dice el papel, y "Por pagar" mentía por ese margen.
--
-- LA REGLA (SUNAT, no CAYLA): solo la FACTURA discrimina el IGV y da crédito
-- fiscal. La boleta de venta y la nota de venta no lo desglosan — el precio
-- que figura ya es lo que se paga, y para efectos de costo el IGV va adentro
-- del costo (no se recupera). Por eso en esos documentos `igv` tiene que ser
-- cero, y el costo unitario que se tipea es el precio del papel, sin
-- "agregarle" nada.
--
-- POR QUÉ UN CHECK Y NO UN IF EN `registrar_compra`: la RPC ya calcula igv
-- desde `p_igv_porcentaje`, y la pantalla desde hoy manda 0 para boleta y
-- nota de venta. Pero una regla que vive solo en la pantalla o solo en una
-- función es una regla que el siguiente camino de escritura se olvida
-- (principio 2: si el inventario puede quedar en un estado imposible, el
-- diseño está mal). El check frena a la RPC de hoy, a la importación de
-- mañana y al SQL pegado a mano el viernes. El mensaje humano lo pone
-- `apps/web/lib/error-escritura.ts` por el nombre de la restricción.
--
-- AL APLICAR EN PRODUCCIÓN: falla si allá ya hay boletas o notas de venta
-- registradas con IGV > 0. Antes de pegar, mirar:
--   select tipo, count(*), sum(igv) from retail.compras
--   where tipo <> 'factura' and igv > 0 group by 1;
-- Si hay filas, la decisión es de Felipe: corregirlas a igv = 0 (y total =
-- subtotal) fila por fila con el papel a la vista, nunca relajar el candado.
-- ============================================================================

alter table retail.compras
  add constraint compras_igv_solo_factura check (tipo = 'factura' or igv = 0);

comment on constraint compras_igv_solo_factura on retail.compras is
  'Boleta y nota de venta no discriminan IGV: el precio del papel ya es el costo. Solo la factura lleva igv > 0.';
