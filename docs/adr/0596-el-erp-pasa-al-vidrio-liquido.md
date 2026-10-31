# ADR-0596 — El ERP pasa al vidrio líquido, componente por componente (2026-10-31)

DECIDÍ (Felipe, 2026-10-31): todo el ERP se rediseña con la estética de vidrio de «Mi perfil» («A · Cristal líquido», ADR-0136
act. 2026-10-31), en su versión **Serena**: la hoja es vidrio esmerilado más opaco (70 %), con su borde de luz, su sombra larga, radio de
32 px y la entrada que se enfoca; **sin** el filo ni el brillo que siguen al mouse (eso queda solo en Mi perfil). Se hace componente por
componente: cada pieza se audita, se dibujan 2 o 3 caras en una maqueta tocable, Felipe elige mirando, y recién ahí se lleva al código.
El avance vive en el tablero `docs/vidrio/README.md`.

Lo que ya eligió Felipe sobre 9 modales de muestra (`docs/maquetas/modales-vidrio-2026-10/`):

| Pieza | Cara elegida | En una línea |
|---|---|---|
| La hoja | Serena | vidrio al 70 %, sin luz que sigue al mouse; tablas sobre lámina casi papel; con botón rojo, papel |
| Campos de texto | A · Hundido | un pozo tallado en el vidrio; al escribir sube como la gota, sin volverse sólido |
| Botones | A · Gota | píldora; secundario = la gota; primario = vidrio ahumado de tinta (72 → 93 %); rojo = vidrio rojo |
| Notas | A · Placa | lámina de vidrio con la «i» en su lente |
| Combo | A · Pozo y gota | cuerpo hundido, la flecha es una gota; la lista también es vidrio |
| Aviso | B · Lente | sin franja: lente ámbar y borde ámbar tenue |
| Planilla de tallas | A · Celdas vivas | números sin cajas, diferencia por talla, total por color, movimiento de Ajustar stock |
| Barra de pagos | A · Tubo de vidrio | pozo con tramos de vidrio de color y cada medio con su monto y su parte |
| Lista de prendas | B · Lámina de vidrio | una placa, ícono de categoría sobre el color, talla como insignia |

El idioma que ordena todo: **lo hundido espera tu dato; lo que sobresale es lo que haces; lo que explica es plano.**

DESCARTÉ: «Completa» para todo el ERP (el filo y el brillo en 275 hojas son ruido, y Mi perfil deja de ser especial); llevarlo de un
salto (un PR que cambie todas las piezas no se puede revisar ni mirar); y que la skill de diseño decida colores o piezas (CLAUDE.md, «Skills
de diseño de afuera»): todo sale de los tokens de `globals.css` y `estilos/tema.css`.

SE ROMPE SI: un texto o el borde de un control deja de pasar su contraste porque detrás del vidrio hay una prenda oscura (el fondo ya no
es fijo); si el desenfoque traba el Mac mini de la tienda con varias capas abiertas; o si una pieza se migra sin que Felipe la haya
elegido mirando.

- **Reglas que cambia** (cada una se reescribe cuando su pieza se lleve al código, no antes): la cara única de hoja de ADR-0358 ronda 12
  («papel, borde fino, sin sombra»), la excepción de vidrio de ADR-0136 (pasa a ser la regla de las hojas), el movimiento de «Ajustar
  stock» (ADR-0494) para toda planilla en una hoja, y la familia `modal` de `lib/unificar.test.ts`.
- **Pendiente de decidir por Felipe:** que en «Celdas vivas» el − y el + se vean recién al apuntar (ley 6 de Formidable y el borde de
  control de ADR-0516 piden lo contrario).
- **Antes de llevar la primera pieza al código:** medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás
  (Existencias), y el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez (tres capas de `backdrop-filter`). Respetar
  `prefers-reduced-transparency` (vuelve a papel).
- **Cómo entra al código:** por `/unificar` (familia por familia, módulo por módulo, con el OK de Felipe), sin cambiar qué hace ninguna
  pieza. Lo de diseño propio (vista rápida, Insignias, Ajustar stock, Observatorio, la persiana de Caja, el telar de Finanzas) no se toca
  sin que Felipe lo diga.
