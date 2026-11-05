# Maqueta · La tabla de «Ajustar stock» (2026-10-26)

**Estado: tres propuestas para que Felipe elija mirando. Nada construido.** Abrir `index.html` (doble clic).

## El pedido

Felipe, 2026-10-26, sobre una captura de «Ajustar stock» en el modal de la Blusa Becky (Existencias, ADR-0494, ronda 3 de
`docs/maquetas/existencias-ajustar-stock-2026-10/`): el número se ve muy lejos, hay scroll innecesario, el foco deja un color seleccionado
cuando muchas veces hay que cambiar los demás, y las opciones de arriba no se notan.

## Por qué pasa (leído en el código)

| Problema | Causa |
|---|---|
| El número queda lejos | `.ajuste-tabla { width: 100% }` (`app/estilos/ajuste-modelo.css:64`) y la columna del color sin ancho (`<col />`, `AjusteDelModelo.tsx:223`): con una sola talla, el color se queda con todo el ancho |
| Scroll de más | El anillo del foco (`inset: -7px`, sombra de 28 px, `:163-169`) se sale de una caja con `overflow-x: auto` (`:59`); y cada fila mide ~90 px |
| El foco apaga el resto | Todo lo demás baja a `opacity: 0.28` (`:200`) hasta tocar «Ver todo el modelo» o Escape |
| Lo de arriba no se nota | Motivos en `pildora-cayla` de 13 px con borde arena; «Dónde contaste» con la cara de pestañas, arriba a la derecha |

De paso: el aviso de la carga inicial dice «Encontré prendas» (`lib/ajuste-reglas.ts:325`) y el botón se llama «Encontré unidades»
(`lib/existencias-ajuste-modelo.ts:52`). La maqueta usa el nombre del botón.

## Las tres

- **A · Lista pegada.** Lo de hoy, arreglado: con una talla, los colores en dos columnas con el paso al lado del nombre; con varias, la tabla
  mide lo que necesita. Dónde y qué pasó en tarjetas con ícono y lo que hace cada motivo.
- **B · Mosaico.** Una carta por color (franja de color, número grande con − y +), y tres pasos numerados con fichas grandes que llevan el
  signo de cada motivo (±, +, −).
- **C · Planilla rápida (recomendada).** Hoy · Contaste · Cambio en columnas justas, Enter pasa al siguiente color, «Revisaste 3 de 7»; − y +
  aparecen al pasar el mouse o con el cursor; dónde y qué pasó en una lista al costado de la tabla.

**En las tres el foco ya no apaga nada:** el color del que se viene dice «Empiezas aquí» y tiene el cursor, y los demás se tocan igual.
Las reglas no cambian: una sola llamada a `ajustar_inventario`, un lugar por vez, «Encontré unidades» solo suma y no va en el piso, «No
aparece» y «Uso interno» solo restan.

## Medido en el navegador (cuánto le sobra al modal, en px)

| | 1280 × 800, 1 talla | 1280 × 800, 4 tallas | 1024 × 768, 1 talla | 1024 × 768, 4 tallas |
|---|---|---|---|---|
| A | 1 | 114 | 33 | 146 |
| B | 8 | 204 | 40 | 236 |
| C | 0 | 49 | 0 | 81 |

Sin scroll horizontal en escritorio en ninguna. A 375 px las tres apilan (Existencias es de escritorio; con 4 tallas, la tabla de A y C se
desliza dentro de su caja con el color fijo). Revisada en claro y oscuro; suma, resta, escribir, Enter, cambiar motivo y lugar, y guardar
funcionan, sin errores en la consola.

## Datos

Blusa Becky (7 colores, talla Estándar) y Vestido Lía (4 colores × 4 tallas): cantidades inventadas. Colores: los tokens de
`apps/web/app/globals.css` y `estilos/tema.css`; el color de cada prenda es dato.

## Ronda 2 (2026-10-26): la C, con lo que pidió Felipe — `ronda-2.html`

Felipe eligió **C · Planilla rápida** y pidió: que «Dónde» y «Qué pasó» no cambien de lugar; que la tabla no se confunda con el fondo;
que en el celular la columna del color no se transparente al deslizar; la franja de color al inicio de la fila, como la matriz de Catálogo;
un alto fijo para la tabla, para no perder de vista lo importante, y un aviso que se note (el de «tienes cambios en piso y pasas a almacén»).

- **El modal no se desliza.** Cabecera (una sola: la flecha, la prenda y «Ajustar stock · Empiezas por…»), la banda con Dónde y Qué pasó
  (siempre arriba, con una talla o con muchas), el aviso y el pie quedan fijos; **solo la tabla se desliza por dentro**, con la cabecera y
  el total fijos. El talón de la izquierda se desliza solo él.
- **La tabla, una bandeja:** hueso con borde, filas en papel alternadas, la franja de 6 px con filo interior (como `MatrizStockFicha.tsx:372`).
  La última columna (lo del otro lugar) llena el ancho, así el número queda junto al color y la fila no se corta.
- **La columna del color fija y opaca:** cada fila pinta un fondo mezclado con papel (nunca semitransparente) y, al deslizar, la columna
  marca su borde con una sombra. La matriz de Catálogo tiene el mismo problema: `bg-hueso/40` en su columna fija (`MatrizStockFicha.tsx:365`).
- **El aviso:** entre la banda y la tabla, fuera de lo que se desliza; ámbar con borde, ícono y un destello una vez; el botón de lugar que
  tocaste queda marcado. Con cambios sin guardar ofrece **«Guardar y pasar a almacén»**, «Descartar y pasar» o «Seguir en piso» (propuesta
  de la maqueta: guardar sigue siendo un toque explícito, y la regla de un lugar por vez no cambia). Los avisos de reglas («solo resta»)
  salen en el mismo lugar.
- **Celular:** la foto y el talón se van; «Qué pasó» va en una fila que se desliza (el elegido queda a la vista); «Hoy» va bajo el nombre
  y la columna del otro lugar se esconde, para que una talla no necesite deslizar.

Medido (alto de la tabla / lo que necesita, en px): Blusa Becky 357/357 a 1280 × 800 (entra entera), 297/349 a 1024 × 768 y 318/396 a
375; con 4 y 5 tallas se desliza por dentro y la página nunca. Revisada en claro y oscuro; el aviso, «Guardar y pasar», Enter y el
deslizado lateral con la columna fija, sin errores en la consola.

**Ajustes de Felipe sobre la ronda 2 (mismo día):** solo se enciende en ámbar la cantidad que cambió (no la fila entera); en el celular la
columna del color mide lo que el nombre más largo; «Color» va centrado como los demás títulos; y **se quitó la etiqueta «Empiezas aquí»**
(«abultada y no sirve de mucho»): el punto de partida lo dicen la cabecera («Empiezas por Arena»), el cursor y el filo de su celda.
