# Formidable · Inventario ▸ Bajar al piso y Cuadrar el piso: el aviso «Ya está en la lista · ¿Sumar otra?»   (`/inventario/bajar`, `/inventario/cuadrar`, ADR-0562)

- **Fecha / SHA:** 2026-10-29 · `06e7d4516` (cambios sin commit) · **Dispositivo que manda:** escritorio con pistola; la cámara del celular es el segundo camino
- **Pregunta que debería resolver (1 frase):** «Esta prenda ya la escaneé: ¿la sumo otra vez o fue la misma lectura?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s y se contesta con un toque; le falta cerrar dos agujeros que dejan un conteo mal sin que nadie lo vea.»
- **Qué se hizo:** medición propia a 1440 y 375 px sobre una página temporal con datos inventados (la cámara real y la pistola real NO se probaron: el panel bloquea la cámara); ciega (Sonnet, sobre 4 capturas); revisor de leyes (Sonnet, código + capturas); escéptico (Sonnet, contra el código y `git show HEAD`). **Real: sin probar.**

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s entendió «ya estaba, ¿sumo otra?» y llegó a «1 → 2»; dudó en «No» (¿no sumar o no es esta?) y en «Cantidad total» (¿de qué?) · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 8 | [Observado en código] una pregunta, Sumar y No pesan igual a propósito |
| 3 Simplicidad profunda | 8 | «1 → 2» es un veredicto, no un cálculo |
| 4 Lenguaje de tienda | 7 | «Sumar» y «No» bien; «Cantidad total» sin su «de qué»; el chip «Varias iguales» ya no dice lo mismo que el botón «Cambiar cantidad» |
| 5 Contenido primero | 6 | [Medido] a 375 px en la franja el nombre se corta («Blusa Emma · M · Be…»); a 1440 px la tarjeta mide 1366 px y deja el nombre a ~1000 px de los botones |
| 6 Lo difícil, a un toque | 6 | «Escanear otra prenda cuenta como No» vive en un párrafo de 3 frases a 12 px, siempre abierto |
| 7 Perdonar antes que preguntar | 6 | [Observado en código] el −/+ de la cámara sigue activo con la pregunta abierta y puede dejar +2 (ver cambio 1) |
| 8 Quitar antes de agregar | 9 | [Observado en el diff] salieron el triángulo, la caja del contador, la píldora y el «Esc =» |
| 9 De punta a punta | 6 | [Medido] nombre cortado a 375 px; sin foto bien resuelto; **sin probar:** concurrencia, caída de red, cámara y pistola reales |
| **Leyes (promedio)** | **7,0 (provisional)** | 8 de 9 con evidencia; la ley 1 no pasa de 8 sin colaboradora real |
| **Oficio visual** | **8** | [Medido] a 1440 px: 0 fallas (blancos de 44 px, contraste ≥ 5,6:1, sin filas desiguales). A 375 px: 1 falla (nombre cortado). 1024 px y oscuro: sin medir |

## Los 3 cambios de mayor impacto
1. **Con la pregunta abierta, la bandeja de la cámara no se toca.** *Antes:* el velo tapa el visor pero el −/+ de abajo sigue vivo; tocar «+» y luego «Sumar» suma 2, y en Cuadrar el −/+ actúa sobre la prenda de arriba aunque la pregunta sea por otra. *Después:* mientras `pregunta` está abierta, la bandeja muestra solo «Listo» (sin −/+) y su prenda es la preguntada. *Ley:* 7 y 2. *Verifica:* en la página de prueba y a 375 px. *Esfuerzo:* S. **Lo introduce este cambio** (antes el aviso reemplazaba la bandeja). *Quién decide:* presentación, tu OK; no cambia ninguna regla de conteo.
2. **El nombre se ve entero, y en escritorio la tarjeta no se estira.** *Antes:* 375 px: «Blusa Emma · M · Be…»; 1440 px: tarjeta de 1366 px y «Cambiar cantidad» en una fila aparte. *Después:* el nombre pasa a dos líneas si no cabe; en escritorio la tarjeta se topa en ~48 rem y «Cambiar cantidad» va en la misma línea de Sumar y No. *Ley:* 5 y 9. *Verifica:* medir a 375, 1024 y 1440 px. *Esfuerzo:* S. *Quién decide:* presentación, tu OK.
3. **Dejar rastro cuando otra prenda cierra la pregunta como «No».** *Antes:* con la pistola, escanear otra prenda con la tarjeta abierta la descarta sin una palabra (quien mira el rack no lo ve). *Después:* un aviso corto «No se sumó: Blusa Emma · M · Beige» con su «Deshacer» que reabre la pregunta. *Ley:* 7 y 9. *Esfuerzo:* M. **Ya existía antes de este cambio**, y el escéptico lo matiza (es diseño aprobado en ADR-0562, punto 5); lo propongo porque es el único faltante que nadie ve. *Quién decide:* presentación, tu OK.

## Lo que sobra (ley 8)
- La fila propia de «Cambiar cantidad» en escritorio (cabe en la misma línea).
- Una de las tres frases de ayuda bajo el campo: dejar «Si se repite, te pregunto antes de sumarla» y que el «No» de otra prenda se vea en el aviso del cambio 3.

## Lo que no pediste y importa más
Las lecturas repetidas de la misma etiqueta mientras se pregunta se ignoran **en silencio** con la pistola (ni sonido ni cifra: antes, al menos, se veía «N lecturas ignoradas»). Con 4 iguales en la mano la 3.ª y la 4.ª se pierden sin que nadie lo note. Es decisión tuya (la píldora salió en esta ronda), pero antes de darlo por bueno hay que contar con la pistola real cuántas preguntas salen en una bajada de 20 prendas con pilas mezcladas, y decidir si «en toda repetición» aguanta o hace falta un umbral de tiempo.

## Lista aparte (no se ejecuta)
- «No» podría leerse como «no es esta prenda» (ciega): probar «No sumar».
- «Cantidad total» → «Cantidad total de esta prenda».
- Chip «Varias iguales» → «Cantidad fijada», para que diga lo mismo que el botón.
- En cámara, si «Sumar» no logra sumar (tope del almacén tras un cambio de stock), el motivo queda detrás de la hoja (preexistente: `responderSi` no se tocó).
- «Listo» en la cámara con la pregunta sin contestar la deja pendiente y reaparece como franja bajo el campo (preexistente).
- Cinco tamaños de texto en la tarjeta (12, 13,5, 14, 15, 24); criterio de opinión, no un candado.
- Cuadrar: la miniatura no pasa `categoriaDe` (percha genérica; ADR-0333 lo tolera).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | En parte: entendió «ya estaba, ¿sumo otra?», no qué pasa al tocar cada botón |
| Primer intento | Sí en 3 de 4 tareas; en la de la cámara, no |
| Pasos | 6 toques en total (A 0, B 1, C 5, D 0) |
| Dudas | 14 (12 elementos distintos): «1 → 2», «No», «Cantidad total», «Guardar 2», «−» apagado… |
| Palabras no entendidas | «Contar», «3/3», «Volver a escanear la misma», «1 → 2» (a medias), «Cantidad total» (a medias) |
| Errores evitables | tocar «Sumar» por el ✓; tocar «Listo» con la pregunta sin contestar |

**Lo que NO cuenta (era de mi página de prueba, no del producto):** «Contar · cada lectura suma 1» (la pantalla real dice «Bajar · si se repite, te pregunto»), el botón «Volver a escanear la misma», la bandeja vacía «Lo que escanees aparece aquí», el aviso pálido de la captura 2 (estaba a media animación) y el «Guardar 2» gris. Quedan válidos los que no dependen de eso.

## Escéptico (veredictos)
| Hallazgo | Veredicto |
|---|---|
| H1 lecturas ignoradas en silencio | MATIZADO (el silencio ya existía; lo nuevo es que la píldora salió) |
| H2 «otra prenda = No» sin rastro | MATIZADO (diseño aprobado; cambió dónde se explica) |
| H3 «Guardar N» choca con «Guardar» | **REFUTADO** (el botón de la bajada es «Confirmar bajada · N prendas»; en Cuadrar, «Cuadrar el piso») |
| H4 −/+ activo con la pregunta | **CONFIRMADO**, y peor en Cuadrar (puede tocar otra prenda). Lo introduce este cambio |
| H5 tarjeta de 1366 px | MATIZADO (opinión de diseño, medida real) |
| H6 nombre cortado a 375 px | **CONFIRMADO** por código y medido. Lo introduce este cambio |
| H7 párrafo de ayuda largo | MATIZADO (existía; creció un paréntesis) |
| H8 chip y motivo tapado en cámara | MATIZADO (el chip es menor; el motivo tapado ya existía) |
| H9 «No» y «Cantidad total» | MATIZADO (opinión de la ciega; «Listo» deja la pregunta pendiente) |
| H10 cinco tamaños de texto | CONFIRMADO como opinión (criterio de la skill, no candado) |

## Antes de decir «listo»
- **Concurrencia:** sin probar (dos personas en la misma bajada; `/chaos` pendiente).
- **Caída externa:** sin probar; la pregunta vive en el navegador y no toca la base.
- **Persona sin contexto:** la ciega (capturas) lo respondió con las salvedades de arriba · colaboradora real: sin probar.

## Cambios hechos (con el OK de Felipe, 2026-10-29) [Medido en el navegador, página temporal con datos inventados]
1. **Bandeja de la cámara con la pregunta abierta:** ya no tiene −/+; dice «Responde arriba para seguir.» (`EscanerConteo`, comprobado: no existen los botones «Una menos» / «Una más»).
2. **Nombre entero y tarjeta topada:** el nombre pasa a dos líneas (`line-clamp-2`; a 375 px, sin corte y sin scroll horizontal); en escritorio la tarjeta mide 768×74 en vez de 1366×119 y «Cambiar cantidad» queda en la línea de Sumar y No (los tres botones a la misma altura, 44 px).
3. **Rastro del «No»:** escanear otra prenda con la pregunta abierta deja «No se sumó: Blusa Emma · M · Beige» con «Deshacer»; «Deshacer» vuelve a abrir la pregunta (comprobado). Se agregó `avisarNoSumo` en `AvisoRepetida.tsx`, usado por Bajar y Cuadrar. Además se acortó la ayuda bajo el campo: ya no repite que «otra prenda cuenta como No».
`/chaos` corrido el mismo día en la pantalla real (banco propio): 0 hallazgos, ver `docs/chaos/README.md`. Falta: repetir la ciega sobre esto y la cámara y la pistola reales.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-29 | `06e7d4516` | 7,0 (provisional) | 8 | 0 de 3 (esperan OK) |
| 2026-10-29 (b) | `06e7d4516` + cambios sin commit | sin recalificar | 8 (a 1440 px; a 375 px la falla del nombre cortado se cerró) | **3 de 3 con el OK de Felipe**, vistos en el navegador (ver abajo) |
