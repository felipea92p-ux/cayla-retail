# Auditoría al milímetro — Vender en el celular: «Venta registrada» y el ticket acostado · 2026-11-24 · `claude/mobile-sales-flow-31a365`

Medido: la hoja «Venta registrada» (`VentaRegistradaModal.tsx`) a 375 × 812 claro y quieto, a 1440 × 900 claro y vivo, y a 1440 oscuro; la hoja
del ticket (`PuntoDeVentaTicket.tsx` en `<Modal variante="ticket">`) a 844 × 390. Medidores del repo cargados enteros en la página
(`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos` de `.claude/skills/*/referencia/medir.js`), con la hoja marcada como raíz
donde el medidor lo admite. Servidor de la rama (`movil.localhost:3093`) contra un banco Supabase propio con el seed, cuenta Líder en Tienda Lima,
ventas reales hechas en ese banco.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** · 2 heredados anotados abajo (el interruptor apagado y los montos sin espacio).

## Lo que cambió y cómo se midió

1. **«Venta registrada» ya no abre bajada.** Antes, a 375 px, la hoja abría desplazada 344 px (la primera venta) y 266 px (la segunda): el título, el
   total y «Entregar vuelto» quedaban fuera de la vista. Después: desplazamiento 0, título a 106 px del borde y «Entregar vuelto S/100.10» a 356 px,
   con el foco en «Imprimir y nueva venta» (Enter imprime igual). En 1440 × 900 la hoja cabe entera, como antes, y el foco sigue en el mismo botón.
2. **El ticket acostado ya llega al pie.** Antes, a 844 × 390, «Confirmar cobro» empezaba en el píxel 442 de una pantalla de 390 y la hoja no se
   desplazaba. Después la hoja corre entera (357 px a la vista de 530 a 1069 de contenido) y «Cobrar» y «Confirmar cobro» quedan alcanzables
   (`elementFromPoint` sobre el centro del botón devuelve el botón). Una venta completa con Yape se registró así.

## Lo que dijeron los medidores

- **Estados (`/milimetro`), en la hoja:** 0 apagados, 0 errores, 0 etiquetas faltantes, 0 ocupados que se pulsan, 0 bucles; con `foco: true`,
  5 controles medidos, 0 sin anillo, 0 tapados. En el ticket acostado marca el «−» de la cantidad apagado (contraste 1,54): con cantidad 1 es un
  tope (`LineaDelTicket.tsx:99`, `deshabilitado: linea.cantidad <= 1`), no algo que falte; WCAG exime al control apagado. No es hallazgo.
- **Espacio:** 0 blancos bajo 24 px, 0 bajo 44 px con el dedo (375 px), 0 valores fuera de escala, 0 grupos con la proximidad rota, en la hoja y en
  el ticket acostado.
- **Tipografía:** 0 lecturas bajo 14 px en la hoja. Un interlineado de 1,38 en la nota de SUNAT (`leading-snug`, heredado, no lo toca esta rama).
  En el ticket, el chip «Admin · queda a tu nombre» a 13 px: es el escalón de chips de la escala (ADR-0691), no es hallazgo.
- **Color (claro y oscuro):** 23 textos medidos, 0 bajo 4,5:1, 0 débiles para APCA.
- **Movimiento:** la rama no agrega ni cambia animaciones (11 en la página, 0 bucles).

## Heredados (no son de esta rama)

- **El interruptor apagado se ve poco** (`/color`): «Imprimir en la caja» e «Imprimir solo al cobrar», apagados, tienen 1,11:1 de relleno y 0 de
  borde contra la hoja, en claro y en oscuro (WCAG 1.4.11 pide 3:1 a un control). Es la pieza decidida `<Interruptor>`: va a `/unificar` o `/color`.
- **Montos sin espacio** (`/textos`, «montoMal»): «S/149.90», «S/50.10» y otros de la página de atrás (catálogo, ticket) se escriben sin el espacio
  que no se parte de ADR-0413. Ninguno lo escribe esta rama.

## Sin medir

- Safari de un iPhone real con la barra de direcciones a la vista: se midió en Chrome emulado.
- El teclado del teléfono abierto sobre el cobro acostado.
