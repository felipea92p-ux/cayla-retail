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

## Actualización 2026-10-31 (b) — lo elegido entra al código, de forma modular

Felipe pidió llevar ya al sistema todo lo elegido, «de forma modular para solo tener que cambiar ese componente y que se aplique en todo».

DECIDÍ: una sola fuente de recetas, `apps/web/app/estilos/vidrio/recetas.css` (placa, gota, pozo, ahumado, lente, velo, con su oscuro), y
las piezas armadas con ellas en `app/estilos/vidrio/` (`hoja.css`, `campos-y-botones.css`, `notas-avisos-combos.css`,
`graficos-y-pasos.css`, `marco.css`), importadas al final de `globals.css` y SIN capa: le ganan a `components` y a las utilidades, así que
las ~275 hojas, los 14 cajones, todos los campos (`caja-cayla`), botones (`btn-cayla`), notas (`nota-cayla`), avisos (`aviso-linea`),
listas de combo (`lista-flotante`), segmentos de campo, barras apiladas y pasos de cantidad cambian sin tocar una pantalla. En TSX solo se
cambió la clase de la cara (`hoja-serena` en `Modal`, `cajon-serena` en `Cajon`), los ganchos del segmento (la gota que se estira) y la
forma «pastilla» del combo (`combo-pastilla`); el marco, en `AppShell`.

DESCARTÉ: el `backdrop-filter` en la hoja (como en la maqueta). Vuelve a la hoja el bloque contenedor de todo `position: fixed` de adentro,
y la hoja es la que hace scroll: la lista de cada combo (el Responsable con que se firma casi todo) quedaría recortada y se iría con el
scroll. El desenfoque lo pone el velo (12 px) y la hoja es vidrio translúcido encima: se ve esmerilado y ningún combo cambia de
comportamiento. También descarté que la gota de las listas «viaje» con JavaScript: es la misma `opcion-activa` de siempre (que sigue al
mouse y a las flechas), pintada como gota con un fundido corto; así la tienen todos los combos sin tocar ninguno.

SE ROMPE SI: alguien le pone `backdrop-filter` (o `transform`/`filter` permanentes) a `.hoja-serena` o a `.cajon-serena`; o si una pieza
nueva escribe su propio vidrio en vez de una receta.

## Actualización 2026-11-02 — la tarjeta de producto cambia tres reglas

Al llevar Catálogo ▸ Productos a «A · Catálogo de moda» (la foto al aire y tres renglones: nombre y precio, categoría y color, colores y
stock), Felipe aceptó tres cambios de regla que deshacen decisiones anteriores:

- **El stock de la tarjeta es el de toda la empresa** («34 en stock»); lo que hay para vender en la sede pasa al `title` del stock. Deshace
  la decisión 1 de ADR-0270 (lo de la sede en grande).
- **«Sin stock» va en rojo** (y «Quedan N», bajo su mínimo, en ámbar). Deshace la decisión 3 de `lib/productos-stock.ts` (2026-09-22: sin
  rojo para no llenar la grilla).
- **La tarjeta ya no muestra el chip ámbar de «falta la marca o el proveedor»** (ADR-0283): lo dice el `title` del stock y la vista rápida.

SE ROMPE SI: alguien vuelve a poner lo de la sede en grande en la tarjeta sin leer esto, o usa el rojo de «Sin stock» para algo que no sea
que no queda ninguna en toda la empresa.
