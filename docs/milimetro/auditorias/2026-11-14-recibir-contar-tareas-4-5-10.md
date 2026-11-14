# Al milímetro · Recibir ▸ Contar: el número listo, el teclado de la tabla y «Faltan tallas» — 2026-11-14

**Qué cambió a la vista:** un enlace nuevo en el pie del contador («Faltan tallas: <modelo>», la pieza `btn-cayla btn-enlace` que ya usa «Falta contar: …»), el nombre de una píldora del panel de filtros («Faltan tallas») y su número, y dónde cae el cursor (el número del Dial al elegir un modelo sin contar; la primera casilla al abrir la hoja de tallas; «Llevar al stock ahora» tras la última). Ninguna pieza nueva, ningún color, ninguna medida.

**Cómo se midió:** los seis medidores (`estados`, `espacio`, `tipografia`, `color`, `textos`, `movimiento`) corridos con el mismo guion en el código de `main` (puerto 3070) y en la rama (3110), sobre el mismo envío de prueba y en el mismo estado, a 1440 × 900 en claro; `color` también en oscuro. Tres alcances: la mesa de Contar con todo contado, el panel de filtros abierto y la hoja «Tallas y colores». Se compararon las cifras de las dos versiones.

**Resultado:** 251 cifras iguales en las dos versiones. Las 13 que difieren son conteos de lo medido, no fallas: un texto más de 13,5 px (el enlace nuevo), dos textos más en el panel, cuatro medios pasos menos en el panel (el nombre de la píldora es más corto) y un control de vidrio más en la hoja (la casilla con el cursor). Contraste: 82 textos medidos en la mesa, 0 fallas en claro y 0 en oscuro, igual que `main`. Textos: las mismas marcas que `main` (`tituloDeTitulo` en «Quitar <Nombre>», nombres propios).

**Hallazgos en lo cambiado:** 0 graves, 0 medias, 0 leves.

**Sin medir:** el anillo de foco del enlace nuevo (el medidor pide que el navegador esté en modo teclado con una tecla real); 375 × 812 (Recibir es de escritorio; el número no se abre solo con el dedo, a propósito); el modo quieto (no hay movimiento nuevo).

**Anotado, no tocado:** el aviso «Toca el número para escribirlo» sigue a la vista con el número ya abierto. Va al backlog de la rama para `/textos`.
