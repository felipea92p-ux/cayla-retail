# Auditoría al milímetro — letra y texto de Ventas · 2026-11-23 · `claude/letra-ventas`

Medido: 54 vistas de Ventas, 34 a 1440 × 900 y 20 a 375 × 812, en un Chrome de prueba contra el servidor de la rama (`localhost:3010`),
antes y después del cambio y con la misma base local. Para ver el cobro por dentro se abrió la caja de Tienda Lima y se cerró al
terminar; ninguna vista confirmó una venta, un pago ni un cierre. Las vistas: el punto de venta, la hoja de una prenda, el ticket, el
cobro (sin medio, con efectivo, con boleta), el descuento, el cliente, «Prenda sin registrar», «Más», Caja y sus hojas (gasto, ingreso,
historial de cierres, cerrar caja), Apartados y sus tres pestañas, Cambios y su flujo, Devoluciones, Historial y el detalle de una
venta, Comprobantes y sus cuatro pestañas, y Reportes con Ranking y Empresas. En cada una: el tamaño, el interlineado y el alto de cada
texto, los textos cortados, el desborde horizontal y el alto del documento. El «después» se repitió en oscuro. Aparte, la hoja de cobro
en ocho tamaños de ventana, de 1920 × 1080 a 360 × 800, y, con la caja ya cerrada, la persiana de Vender, la hoja «Abrir caja» y Caja.

Resumen: **0 graves · 0 medias · 3 leves** · en las 54 vistas los textos de menos de 13 px bajaron de 292 a 143, sin un texto cortado nuevo ni desborde; el cobro cabe entero en los ocho tamaños.

## Lo que se midió

| Medida | Antes | Con este cambio |
|---|---|---|
| Textos por debajo de 13 px, en las 54 vistas | 292 | 143 |
| De esos, rótulos de baldosa y el «?» (letra fija a propósito) | 121 | 122 (un «?» nuevo, en Comprobantes ▸ Por enviar) |
| De esos, ejes y cifras de gráficos (pendiente) | 21 | 21 |
| Textos cortados | 110 | 110 |
| Vistas con desborde horizontal | 0 | 0 |
| Vistas cuyo alto cambió | — | 13 de 54, entre −26 y +9 px |
| Textos cuyo interlineado cambió sin cambiar de tamaño | — | 2 (el total del día en Historial: 20,8 → 20 px) |
| Nombre de un medio de pago en el cobro | de 9,4 a 10,7 px | 13 px |
| El cobro en ocho tamaños de ventana: scroll del cuerpo | — | 0 en los ocho |
| «Confirmar cobro» a la vista en los ocho tamaños | — | sí |

El nombre más largo del cobro, «Transferencia», mide 115 px a 13 px con su espaciado y 105 sin él. La ficha mide 125 px a 1920, 119 a
1440, 97 a 1366, 88 a 1024, 104 a 375 y 99 a 360. Por eso pierde el espaciado bajo 132 px y pasa a «Transf.» bajo 112 px.

## Hallazgos

| # | Gravedad | Qué | Dónde | Estado |
|---|---|---|---|---|
| 1 | Leve | Con el sello a 13 px, la duración del turno se cortaba más («357 h …») | Caja ▸ Historial de cierres, el pie de cada ticket | Resuelto: el sello baja a su línea si no entran juntos |
| 2 | Leve | El billete «Otro» sale cortado («Otr») y «S/79.90» toca los bordes de su ficha | El cobro con efectivo, a 1440 × 900 | Abierto: ya estaba antes del cambio; va al backlog |
| 3 | Leve | El «0.00» del campo grande sale mucho más chico que su «S/» | Caja con la caja cerrada, a 375 px | Abierto: ya estaba; Caja es de escritorio |

## Sin medir

- El aviso de cierre de caja de la cabecera: ninguna tienda de la base local tiene hora de cierre, así que no sale. No se tocó.
- Los modales de un apartado, el detalle de un cierre de caja y la cola sin conexión: cambiaron de clase, no de tamaño; no se abrieron.
- Los visores de cámara: no hay cámara en el navegador de prueba. No se tocaron.
- El «antes» en oscuro: el cambio no toca colores; en oscuro se midió solo el «después» (54 vistas, 0 desbordes).
- Un teléfono de verdad y Safari: el celular es emulado.
- El papel: tickets, boletas y etiquetas no se tocaron.
