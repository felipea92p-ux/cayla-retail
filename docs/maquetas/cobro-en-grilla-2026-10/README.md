# Spike · El cobro sale del ticket y ocupa la grilla (2026-10-01)

> **Estado: en revisión con Felipe.** Sin aplicar. No toca `PuntoDeVenta.tsx`, `PuntoDeVentaTicket.tsx` ni
> `PuntoDeVentaCatalogo.tsx`: es HTML/CSS/JS autocontenido con datos inventados.

`cobro-en-grilla.html`: un solo archivo, ábrelo en el navegador (necesita internet solo para las fuentes). La barra negra
de arriba no existe en el ERP: cambia entre las **tres propuestas**, entre **1 y 3 prendas** en el ticket, reinicia y
tiene **▶ Ver demo**, que cobra sola de punta a punta. Solo escritorio (1380 × 820 escalado al ancho).

## Qué se mueve
Hoy, al tocar «Cobrar», el ticket de la derecha se llena con: Cómo pagó la clienta (5 medios, F1–F5), el monto por
medio, Recibido + billetes + Exacto + Vuelto (efectivo), Nº de operación (Yape/Plin/transferencia), Comprobante
(boleta / factura / nota de venta), documento (DNI, carné, pasaporte o RUC con consulta de padrón), Responsable y
«Confirmar cobro».

En las tres propuestas **todo eso pasa a la zona grande donde estaban las prendas**, y el ticket queda a la derecha,
a la vista: sus líneas se compactan (foto + cantidad), y el pie sigue mostrando subtotal/IGV/total, la mezcla de
medios que se va armando y el botón «Confirmar cobro» con su motivo si está apagado. «← Seguir armando» (o Esc) vuelve.
La tira «1 Cómo pagó · 2 Comprobante · 3 Confirmar» arriba cumple la regla de Guía de foco (ADR-0284).

| | Idea | Para quién es |
|---|---|---|
| **A · Mesa de cobro** | Las prendas se abanican arriba junto al total gigante; cinco fichas grandes de medio; detalle y comprobante en dos tarjetas. | La más cercana a hoy; la más rápida de aprender. |
| **B · Anillo** | El total es un anillo que se llena con el color de cada medio; los medios son órbitas; el vuelto dibuja un segundo aro. | La que más se *siente*: se ve a ojo cuánto falta. |
| **C · Recibo vivo** | A la izquierda el comprobante se imprime mientras se cobra; a la derecha, consola de caja con pantalla y teclas. Sello «PAGADO». | La que mejor explica qué se lleva la clienta. |

Las tres cierran con «Venta registrada» (número, vuelto grande, medios, «Imprimir y nueva venta» con Enter), que hoy es
`VentaRegistradaModal`: aquí vive en la misma zona, sin modal encima del ticket.

## Movimiento (todo con `--ease-cayla`, sin rebote; se apaga con `prefers-reduced-motion`)
Cascada de entrada de la zona de cobro y recogida de las prendas; fichas/órbitas/teclas que se tiñen con ondulación al
tocarlas; luz de espera que recorre los cinco medios mientras no hay ninguno; cifras que cuentan (total, falta,
vuelto); billetes que vuelan hasta «Recibido»; barra y anillo que se llenan; nombre de la clienta que se escribe letra a
letra tras la consulta; píldora que se desliza entre boleta/factura/nota; «visto» que se dibuja al cerrar la venta.

## Decisiones abiertas para Felipe
1. ¿Cuál de las tres? (o A como base con el sello/recibo de C en el cierre).
2. El vuelto en A sube al encabezado y en B al centro del anillo; hoy vive dentro del bloque de efectivo.
3. ¿«Confirmar cobro» se queda en el ticket (como aquí) o también en la zona grande?
4. Celular (375 px): no está resuelto; en C el recibo y la consola irían en pasos. PL-105 exige probarlo antes de construir.
5. Antes de aplicar: declarar la pantalla en `lib/guia-de-foco-pantallas.ts` y pasar `/sugerir` (el «Ej. 01234567» es fijo).
