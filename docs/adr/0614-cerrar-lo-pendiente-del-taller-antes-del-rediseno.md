# ADR-0614 · Cerrar lo pendiente del Taller antes de rediseñarlo

- **Fecha:** 2026-11-05 · **Estado:** en construcción, por actividades (`/construir`).
- **Decide:** Felipe, 2026-11-05: «cerremos todo lo pendiente, porque luego haré un rediseño general de todo ese módulo». Aprobó la lista de 16 actividades ese mismo día.
- **Toca:** ADR-0400, ADR-0551, ADR-0570, ADR-0587, ADR-0600 y las respuestas de `docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/13-respuestas-de-felipe.md`.

## El problema

El módulo tiene casi todas sus pantallas, pero en producción ninguna orden había llegado al stock al 2026-11-05, y varias decisiones ya tomadas seguían sin construir. Rediseñar encima de eso obligaría a tomar a la vez decisiones de pantalla y de negocio.

## Las cuatro decisiones de Felipe (2026-11-05)

1. **Lo puramente visual espera al rediseño:** nombres de botones y del menú, orden de la pantalla, guía de foco, cifras de Insumos. Lo que se construye ahora va con hojas funcionales y piezas del sistema.
2. **«Llegó una compra» se construye ahora, con hoja sencilla.** El rediseño la viste.
3. **El Taller como mayorista (ADR-0547) va después,** con órdenes cerradas y cotizaciones reales.
4. **La orden «de antes» (ADR-0551, actividad 2) se descarta.** El Chaleco se resuelve con «ya estaban registradas».

El freno de la orden sin tela sigue solo en pantalla, como Felipe eligió en ADR-0600.

## Actividad 1: revertir un cierre devuelve el costo de la prenda (migración `20261105213000`)

**El problema.** `cerrar_produccion` mete el costo de la orden en el promedio de la prenda (`variantes.costo`), y `revertir_produccion` sacaba las prendas del stock sin tocar ese promedio. Una orden mal cerrada dejaba mal el costo para siempre.

DECIDÍ: devolver el `costo_anterior` exacto del cierre, solo si ese cierre es lo último que movió el costo. Si después entró otra compra u otro cierre, se rechaza con `revertir_costo_mezclado`; en orden inverso sí se puede. Queda una fila `origen = 'reversion'` que apunta al cierre (`revierte_movimiento_id`), y el par sale de `fn_costo_historial_efectivo`. `orden` dice qué fila va después, porque `created_at` lo comparten las líneas de una misma compra.
DESCARTÉ: (1) deshacer el promedio con una fórmula cuando ya está mezclado: con ventas de por medio da costos inventados, incluso negativos, y ADR-0515 ya decidió que lo mezclado no se reescribe; (2) cambiar el costo sin dejar fila: rompería la cadena que vigila `cadena_rota`; (3) tabla aparte para la reversión: `fn_costo_variante_al` y el balance tendrían que leer dos lugares.
SE ROMPE SI: alguien lee `costo_historial` sin saber de las filas `reversion` y las suma como entradas; hoy lo hace solo `fn_bal_causas_mercaderia`, que ya las separa.

**Límite conocido:** una prenda con un cierre revertido sigue con su costo bloqueado a mano (`fn_variantes_con_costo_oficial` solo mira si tiene historial).

Prueba: `pnpm pruebas:produccion-revertir-costo`. **En producción desde el 2026-11-05,** con el OK de Felipe; sin ninguna orden cerrada todavía, no se ha revertido ningún cierre real.

## Actividad 3: lo que se le debe a un servicio llega a Por pagar (migración `20261105221000`)

**El problema.** La orden calculaba lo que se le debe a un servicio, pero Por pagar solo lee facturas: sin papel, no era deuda para nadie.

DECIDÍ: derivarla (`fn_servicios_por_pagar` = devengado − líneas de comprobante vigentes que apuntan a la fase con `fase_id`). Se cuenta sin IGV, porque la tarifa es sin IGV. El nombre de un servicio se registra también con la orden terminada, sin cambiar tarifa ni fijo, que ya entraron al costo.
DESCARTÉ: (1) crear una factura automática por vuelta: exigiría serie y proveedor que no se conocen, y al anular una vuelta habría que anular papeles; (2) una tabla propia de pagos a servicios: Finanzas, IGV, flujo y balance ya leen `comprobantes_produccion`, y habría que enseñarles otra.
SE ROMPE SI: alguien factura un servicio sin apuntar la línea a su fase: esa deuda se contaría dos veces. La actividad 4 hace que el pago desde Por pagar la apunte sola; la factura suelta sigue pudiendo hacerlo mal.

## Actividad 4: pagar a un servicio con el papel que dio (migración `20261105222000`)

**El problema.** Pagar un servicio exigía escribir la línea a mano en Facturas de insumos. Felipe decidió que un servicio da «una mezcla de papeles» (P-14), que sin factura se sigue, marcado (P-17), y que se paga al recibir (P-15).

DECIDÍ: `pagar_servicio_de_orden` arma un comprobante de una línea con `fase_id` y llama a `registrar_comprobante_produccion`. `comprobantes_produccion.tipo` suma `recibo_por_honorarios` (la misma palabra de Compras); Impuestos lo cuenta y deja fuera `sin_comprobante`.
DESCARTÉ: el pago automático desde BCP Operativa al anotar la vuelta (ADR-0551, decisión 7): la vuelta la anota la encargada, que no ve el dinero, y un descuento silencioso de un banco no se revisa. En su lugar, el aviso lleva a pagar y la hoja propone la cuenta del Taller.
SE ROMPE SI: alguien factura el servicio por «Facturas de insumos» sin apuntar a la fase: se contaría dos veces (la hoja de pago sí la apunta).

## Actividad 5: «Llegó una compra» (migración `20261105223000`)

**El problema.** La compra de una línea no servía para una factura con varios colores (la segunda vez la base la rechazaba por repetida) y pedía metros aunque la tela se compre por kilo.

DECIDÍ: `registrar_compra_de_insumos` con una lista de líneas, compuesta con `registrar_comprobante_produccion` y `recibir_comprobante_produccion`; `recibir_insumo_comprado` la llama. La conversión vive en la pantalla (`lineaAlLibro`): el rinde lo da la ficha o lo corrige quien midió, y queda en la nota del lote. En una factura, el total es el del papel (`p_total`): a 4 decimales, los metros pueden perder un centavo.
DESCARTÉ: (1) convertir en la base: tendría que conocer la ficha y lo medido, y el costo saldría igual; (2) repetir un insumo a dos precios en una misma compra: la recepción lo rechaza; se registran dos compras; (3) «solo el precio es obligatorio» (ADR-0570): el 2 de noviembre Felipe eligió pedir proveedor y papel (P03), con la salida «Todavía no tengo el papel».
SE ROMPE SI: una boleta por kilos difiere un centavo del papel: sin IGV, la base exige que el total sea la suma de las líneas. Se acepta: es un centavo y el saldo no queda mal.

## Actividades 6 y 7: regularizar lo que ya entró (migración `20261105225000`)

DECIDÍ: `ajustar_lote_usado` escribe una `merma` por lo que falta, sin tocar `cantidad_ingresada`; `asignar_proveedor_a_lote` solo escribe el nombre; `reemplazar_papel_provisional` cambia la cabecera del comprobante y el documento de sus lotes, sin tocar líneas ni pagos.
DESCARTÉ: (1) subir o bajar `cantidad_ingresada` en un lote usado: lo recibido de la factura se lee de ahí y mentiría; (2) ajustar hacia arriba: si hay más, es otra tela con su propio costo y se anota como «Saldo inicial»; (3) crear la deuda al completar un proveedor: no se sabe si esa compra se pagó.
SE ROMPE SI: una factura real trae otras cantidades o precios que el papel provisional: `reemplazar_papel_provisional` no cambia las líneas. Ahí se anula y se registra de nuevo, si nadie la recibió ni la pagó.

## Actividad 8: tope de corte (migración `20261105232000`)

DECIDÍ: el plan más 3 prendas por talla y color (P-22 y N-3), en `fn_produccion_entrada_variante`. SE ROMPE SI alguien corta más de 3 de más de verdad: se anota lo que quepa y se abre otra orden.

## Actividad 9: cerrar un paso incompleto

**No llevó código.** ADR-0570, actividad 2 ya deja anotar en «Terminé» las prendas perdidas, con su motivo, y el paso cierra (P-04). Lo cubren los casos B3 y B5 de `pruebas:produccion-termine-con-falla`.

## Actividad 10: anular con tela cortada (migración `20261105233000`)

**El problema.** Anular devolvía toda la tela al estante, aunque ya estuviera cortada.

DECIDÍ: `anular_produccion` frena con `anular_con_tela_cortada`, y `anular_orden_con_tela_cortada` pide destino y motivo. «Otra orden» escribe devolución aquí y consumo allá, del mismo lote; «liquidar» y «botar» dejan el consumo en la orden anulada. Una señal de transacción (`retail.anular_tela_decidida`) le dice a la puerta de siempre que ya se preguntó.
DESCARTÉ: (1) un parámetro nuevo en `anular_produccion`: obliga a soltar la firma vieja, y las suites y la web vieja la usan; (2) una tabla de retazos: nadie vende ni usa retazos desde el ERP (R-28: el retazo se bota, rara vez se rescata); (3) devolver lo no usado por talla: el libro no sabe qué parte de la tela se cortó.
SE ROMPE SI: se anula por la puerta de siempre una orden cuyo corte se anotó sin tela: no hay nada que decidir y todo sigue como antes. Y si el corte se hizo pero la tela se anotará después, «sin tela cortada» es correcto: no hay movimiento que mover.

## Actividades 11 y 12: datos al abrir y cambiar una orden abierta (migración `20261105234000`)

DECIDÍ: cuatro columnas opcionales en `producciones` y `cambiar_plan_de_orden`, que escribe en `produccion_lineas` y deja su fila en `produccion_cambios`. El piso de cada línea es lo ya hecho o enviado en la primera fase.
DESCARTÉ: (1) que la tienda destino arme el traslado: Felipe dejó abierto cómo conviven, y el destino real lo decide quien traslada; (2) que «urgente» ordene algo: P-35 dice que no hay prioridades automáticas; (3) recalcular la tela al cambiar el plan: el plan de tela es una promesa aparte, se corrige en «Editar».
SE ROMPE SI: alguien sube el plan y olvida la tela: «no alcanza» avisará al cortar, no al cambiar.

## Actividad 13: los avíos se descuentan solos al cerrar (migración `20261106003000`)

DECIDÍ: `fn_descontar_avios_al_cerrar`, antes de calcular el costo: consumo por prenda × buenas del color, menos lo ya anotado, por lote más antiguo. Si no alcanza, descuenta lo que hay y lo deja en la nota.
DESCARTÉ: (1) descontar al terminar cada paso, como decía ADR-0570: pide decir qué paso usa cada avío, un dato nuevo para cada modelo, por un resultado final igual; (2) frenar el cierre si falta: la prenda ya está hecha; (3) devolver al revertir: lo cosido sigue cosido.
SE ROMPE SI: una orden declara un avío de más y nadie lo corrige: se descuenta igual. Se corrige con «Devolver lo que sobró» mientras la orden esté abierta.

## Actividad 14: las tres etapas de una prenda (migración `20261106004000`)

DECIDÍ: `fn_productos_por_etapa` es la única definición. Productos la pregunta en `fn_productos_filtro`; la tienda web, en `fn_vitrina_por_que_no` (nuevo porqué, `no_llega_a_tienda`); Vender, Apartados, Cambios y Buscar la leen por `getCatalogoParaOfrecer`; Existencias quita solo `en_produccion` de «sin stock aquí». Análisis no cambia: su universo ya es lo que tiene stock, ventas o llegadas en la sede. Se agrega a ADR-0551 que **llegar a una tienda no tiene vuelta**: un modelo vendido hasta cero con una orden de reposición sigue visible.
DESCARTÉ: (1) guardar la etapa en una columna: dos fuentes de verdad; (2) esconder también en Recibir, Conteos y Traslados: tienen que ver lo que hay, y el traslado es justo el paso que la lleva a la tienda; (3) la regla tal cual de ADR-0551 («orden abierta y stock 0»): la reposición de un modelo agotado desaparecía de Productos.
SE ROMPE SI: alguien busca en Productos un modelo que sigue en el Taller para editarlo: no lo encuentra, se entra por su enlace o desde la orden. Es lo que decidió Felipe (ADR-0551, decisión 8); si estorba, el rediseño puede sumar el enlace.
