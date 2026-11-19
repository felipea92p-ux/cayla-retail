# Auditoría al milímetro — el pie pegado de una hoja con la reserva puesta · 2026-11-18 · `claude/affectionate-galileo-2f1d83` (5b46552b4)

Medido: 1440×900 claro quieto y vivo · 1440×900 oscuro · 375×812 claro con puntero táctil. Servidor: `localhost:3012` contra la base local, cuenta Admin en
Tienda Lima. Pieza: `.pie-hoja-fijo` de «Registrar gasto» (Finanzas ▸ Gastos), con la hoja corrida y «Factura» → «Sin comprobante» para que
`<PaginaEstable>` reserve (440 px a 1440×900; 149 px a 375×812). Medidores, con `window.__milimetro = { raiz: ".cascada-modal .pie-hoja-fijo" }`:
estados (`milimetro`, también con `{ foco: true }`), `espacio`, `movimiento` (`__mov.grabar` alrededor del clic) y `color`.
Alcance: solo lo que cambió el arreglo de ADR-0185 (act. 2026-11-18): dónde queda el pie y cómo llega ahí. Letra, textos y colores del pie no cambiaron.

Resumen: **0 graves · 0 medias · 0 leves** · con la reserva puesta el pie queda en el borde de abajo de la hoja (antes, 89 px arriba y encima del contenido), sin transición.

## Lo que se midió

| Vista | Pie | Borde de abajo de la hoja | Encima del contenido | Estados | Espacio | Movimiento |
|---|---|---|---|---|---|---|
| 1440×900 claro, quieto | 759..875 | 875 | 0 px | sin hallazgos; 4 controles con anillo de foco, ninguno tapado | 0 blancos bajo 24 px, 0 fuera de escala | 0 animaciones en el clic |
| 1440×900 claro, vivo | ..875 | 875 | 0 px | — | — | ninguna animación del pie ni del relleno de la hoja |
| 1440×900 oscuro | ..875 | 875 | 0 px | sin hallazgos | — | — |
| 375×812 claro, dedo | 644..811 | 811 | 0 px | sin hallazgos | 0 blancos bajo 44 px (los tres botones miden 44 de alto) | — |

Color, con la raíz en el pie: 0 textos bajo 4.5:1 en claro y en oscuro.

## Decidido a propósito

- **El pie baja de golpe, también con las animaciones encendidas** (`transition-property: none`). Es una corrección de posición, no un movimiento que
  comunique algo: el pie no cambia de lugar en la pantalla, y animarlo lo mostraría un instante a media hoja. Con las animaciones apagadas, la
  transición de 0,01 ms de `movimiento.css` lo dejaba un cuadro sin bajar (medido: `CSSTransition translate running t=0`).

## Heredado, fuera de la pieza

- El medidor de color, que mira también el resto de la hoja, marca en «Registrar gasto» un borde de `div.caja-cayla` a 2,35:1 en claro y dos textos «no
  concluyentes» (la etiqueta «Fecha», 4,14:1; «Eres admin…», 4,45:1). No son del pie ni de este cambio. Va a `/color`.
- «revisar» del medidor de estados: dos `:hover` de otras hojas de estilo (`.barra-t`, `.parecidas-punto`); `lib/hover-con-mouse.test.ts` pasa.

## Sin medir

- Safari y un iPhone real.
- Con el panel del navegador oculto las transiciones de 0,01 ms no avanzan: una primera pasada de color en oscuro dio contrastes falsos (texto a medio
  cambiar de tema). Se repitió terminando las transiciones pendientes antes de medir, y esas son las cifras de arriba.
- Los otros 139 componentes que usan `pie-hoja-fijo`: comparten la regla, pero solo se abrieron «Registrar gasto» y «Registrar proveedor».
