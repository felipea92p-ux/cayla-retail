# Formidable · Vender ▸ «Todo de la prenda» con «Combina bien con»   (`/vender`, la hoja que se abre al tocar una tarjeta)

- **Fecha / SHA:** 2026-10-10 · `0a1b1c04`   · **Dispositivo que manda:** escritorio (Mac mini); **375 px obligatorio** (PL-105)
- **Pregunta que debería resolver (1 frase):** «¿Lo tienes en otro color o talla?» (ADR-0323) y, desde hoy, «¿con qué lo combino y lo tienes aquí?» (ADR-0371)   · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s y la tarea sale en 4 toques, pero sumar desde la sugerencia no se ve, el porqué habla en código y los controles nuevos miden 20 px en una hoja de celular.»

Alcance: solo lo construido hoy en la hoja (la ficha del color, la frase y las tarjetas de prendas). Lo preexistente de la hoja se reporta aparte y no baja la nota. Costo: 4 agentes (medición a 3 anchos hecha por la sesión; ciego con Opus; revisor de leyes; escéptico), más `pnpm focus`, `pnpm sugerir` y `scripts/rendimiento/ui.mjs`.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: lectura de 5 s correcta («la caja para vender… tocar una prenda y cobrar»); tarea en 4 toques (el mínimo); dudó en «dos Combina bien con» y en «Negro · 5 aquí: ¿5 qué?»; el nombre de la tarjeta «pareció no hacer nada» (sin señal de que se toca). · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Medido] la hoja hace dos preguntas (color/talla y «¿qué más?»); las casillas de la prenda sugerida son idénticas a las de la prenda (`OpcionesDePrendaModal.tsx:166` y `:280`); la frase sigue al color mirado y las tarjetas al fijado (`:76-78`, decidido en ADR-0371 §D, pero nada lo dice) |
| 3 Simplicidad profunda | 6 | [Medido] la tarjeta (miniatura · nombre · color · «2 aquí») y la frase SON veredicto; el «¿Por qué?» expone la dirección de la ficha («Beige lista Negro», `combinar-reglas.ts:322-327`) y el de la ficha abre la descripción del color, que no explica los círculos |
| 4 Lenguaje de tienda | 4 | [Medido] `QUE_HACE[papel] + " a " + dicho` produce oraciones rotas en 4 de 5 casos del ancla más común («lo acompaña a una blusa», «lo calza a una blusa», `combinar-reglas.ts:333`); «lista»/«lleva» como verbos; «tono sobre tono». [Observado] «lista suena a adjetivo». Ninguna prueba recorre papel × motivo (ADR-0290) |
| 5 Contenido primero | 8 | [Medido] foto 240/96 px > miniatura 44 > círculos 20; sin foto, el ícono de la categoría sobre su color (ADR-0333). Resta: chip + «¿Por qué?» comprimen el nombre a ~113 px a 375 px |
| 6 Lo difícil, a un toque | 7 | [Medido] los dos «¿Por qué?» cerrados por defecto y son botones; el nombre del círculo sale con hover, foco, clic y Enter (no depende solo del hover). Falla: ninguno de los dos «¿Por qué?» explica los círculos |
| 7 Perdonar antes que preguntar | 5 | [Medido] tocar una talla sugerida es reversible y sin «¿Seguro?» (bien); pero la tarjeta se desmonta en el mismo render (`enTicket`, `PuntoDeVenta.tsx:571`), el ✓ de «recién» nunca se dibuja, no hay deshacer en la hoja. [Observado] «dudé si se agregó o se borró» |
| 8 Quitar antes de agregar | 5 | [Medido] «Combina bien con» dos veces con dos significados (colores y prendas); hasta cuatro «¿Por qué?»; el conteo tres veces (chip, porqué, casillas); «Negro · 5 aquí» responde otra pregunta (prendas negras de cualquier categoría) |
| 9 De punta a punta | 6 | [Medido] vacíos bien (sin ficha, sin frase, sin stock, catálogo viejo → nada, nunca «sin datos»); 375 px sin desborde; PERO círculos 20 px y «¿Por qué?» 15 px en una hoja obligatoria en celular; el foco inicial del modal cae en el primer círculo y lo enciende solo (`Modal.tsx:148`, `activeElement` medido); los círculos son `listitem` interactivos sin rol de botón y entran 6 veces al tabulador |
| **Leyes (promedio)** | **6,0** | la ley 4 está en 4: lo dice la primera línea |
| **Oficio visual** | **6** | [Medido] a 1440, 1024 y 375: fallan blancos (círculos 20×20, «¿Por qué?» 36×15, nombre de tarjeta 38 px de alto), contraste (nombre del color de la tarjeta 4,45:1, `text-tinta/60`), alturas desiguales en la fila (38 vs 15) y teclado (6 Tab en círculos antes de las tallas). Pasan: rojo 0, texto ≥ 12 px en lo nuevo, sin desborde. No verificable: 1 px de desvío en el porqué (la aritmética de clases da 68 px en los dos lados). Preexistente, aparte: fila de color de 20 px, `label-cayla` 9,5/10,5 px, más de 3 radios, «Listo» de 35 px |

## Los 3 cambios de mayor impacto
1. **Sumar desde la sugerencia se ve.** Antes → la tarjeta desaparece al tocar la talla; la única señal es el total detrás del velo. Después → mientras la hoja esté abierta la tarjeta se queda (la puerta «ya en el ticket» se aplica al abrir o al fijar el color, no en cada toque), la casilla dibuja el ✓ y la fila dice «1 en el ticket» como las filas de colores; se puede sumar otra talla; la sección no colapsa. **Leyes 7, 9, 2.** Verificar: tocar M → tarjeta sigue, ✓, «1 en el ticket»; tocar L → «2 en el ticket»; quitar del ticket → vuelve a «2 aquí». **Esfuerzo M.** Decide: Felipe (ajusta «lo que ya está en el ticket no se sugiere» → «al abrir la hoja»).
2. **Un porqué en español de tienda y un solo bloque.** Antes → «Beige lista Negro · va arriba a una falda · 2 en Tienda Lima», dos «Combina bien con» y cuatro «¿Por qué?». Después → en la hoja de Vender un solo bloque: «Combina bien con una blusa» · «en estos colores: ● ● ● ●» (el nombre al pasar o tocar; «hay en el piso» / «no hay aquí», sin el «5 aquí» que cuenta prendas de cualquier categoría) · las tarjetas; un solo «¿Por qué?» por tarjeta que dice «Una blusa va arriba de la falda · El negro combina con el beige» (derivado por papel × motivo, con una prueba que recorra todas las combinaciones y lea la oración, ADR-0290; «tono sobre tono» → «del mismo tono»). **Leyes 4, 3, 8, 2.** Verificar: la prueba de totalidad y las tres frases en la hoja. **Esfuerzo M.** Decide: Felipe (el texto es la voz de la caja; la etiqueta de los círculos cambia en esta hoja, no en el alta ni en la vista rápida).
3. **Blancos y foco.** Antes → círculos de 20 px, «¿Por qué?» de 15 px, nombre de tarjeta de 38 px, el primer círculo encendido solo al abrir, 6 Tab en círculos. Después → `focoEnLaHoja` en la hoja (una prop), área de toque de 44 px en los círculos sin cambiar el dibujo, `min-h-7` (28 px) con mouse y 44 con dedo en los dos «¿Por qué?» (precedente `FrescuraFila.tsx:170`), la fila entera de la tarjeta como botón con «Ver tallas ›», contraste del nombre a `/70`, un solo círculo en el tabulador (flechas para moverse) con rol de botón. **Oficio + ley 9.** Verificar: `medir-oficio.js` a 1440 y 375 con 0 blancos nuevos bajo mínimo y `activeElement` en la hoja; `tema:auditar` del escenario `vender.ver-opciones-porque`. **Esfuerzo S/M.** Decide: presentación (Felipe da el OK).

## Lo que sobra (ley 8)
- La segunda etiqueta «Combina bien con» en la misma hoja (dos respuestas con un nombre).
- La tercera línea del «¿Por qué?» («2 en Tienda Lima»): lo dicen ya el chip y las casillas.
- «Negro · 5 aquí» en los círculos: cuenta prendas negras de cualquier categoría, un dato de otra pregunta.
- El «¿Por qué?» de la ficha en esta hoja: abre qué transmite el color, no por qué estos círculos.

## Lo que no pediste y importa más
La única confirmación de haber sumado una prenda sugerida es que desaparezca de la vista: una colaboradora con prisa toca dos veces (lo que `/chaos` ataca) o cree que no entró. Es el único lugar donde la pieza mueve el ticket sin señal.

## Lista aparte (no se ejecuta)
- La frase sigue al color MIRADO y las tarjetas al FIJADO (decidido en ADR-0371 §D): nada en pantalla lo dice; si molesta, que las dos sigan al fijado.
- `accesorio` nunca es pareja en `PAREJAS`: un cinturón o unos lentes no se sugieren con nada (consecuencia de la fila que decidió Felipe; confirmar).
- La frase más larga posible («Combina bien con una riñonera o unas bailarinas», 47 caracteres) está al borde de los 327 px útiles de 375 px: medir ese texto exacto.
- Preexistentes de la hoja, fuera de la pieza: la fila de color mide 20 px de alto; `label-cayla` de 9,5 y 10,5 px; «Listo» al pie de una hoja que no guarda (vs la × de `accion.cerrar`, ADR-0358); «¿Qué talla pidió? S L» (AnotarNoHabia) confunde al ciego; «Apartar 1» en el botón de Apartados tras agregar; `text-tinta/60` da 4,45:1 en todo el ERP (sistémico, no de esta pieza).

## Prueba ciega
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «Es la caja para vender… escanear o tocar una prenda y después cobrar» | ✓ |
| Primer intento | completó sin retroceder ni pedir ayuda | ✓ |
| Pasos | 4 toques para la tarea (abrir la hoja, el nombre de la sugerida, la talla M, «Listo»); 7 con los dos «¿Por qué?» pedidos | ✓ (= mínimo) |
| Dudas | «hay dos Combina bien con distintos»; «Negro · 5 aquí: ¿5 qué?»; «2 aquí» vs «M 1 aquí»; «al tocar Blusa Emma no supe si había pasado algo»; «la blusa desapareció y la hoja no dijo nada: dudé si se agregó o se borró»; «¿Qué talla pidió? S L»; «Apartar 1» | 7 hallazgos (3 de la pieza + 2 preexistentes + 2 de señal) |
| Palabras no entendidas | «Beige lista Negro» («lista suena a adjetivo»); «va arriba a una falda»; «alm.»; «en piso» | 2 de la pieza |
| Errores evitables | ninguno (el «retraso» de las tallas fue de la captura: el DOM las tiene en el mismo instante, medido) | ✓ |
| Real | sin probar | — |

## Antes de decir «listo»
- Concurrencia: la sugerencia se recalcula sobre las variantes con el stock en vivo (cada 10 s); si otra caja vende la última unidad, la tarjeta desaparece o la talla dice «Sin stock», y `registrar_venta` rechaza igual el cobro (`FOR UPDATE` sobre `stock`). · Caída externa: las fichas de color se leen tolerantes (sin ellas la hoja no dice nada y se vende igual); el catálogo guardado sirve sin red; la marca `origen_sugerencia` la ignora la base hasta la migración. · Persona sin contexto: ciega pasó en 4 toques; real sin probar.

## Después de los cambios 2 y 3 (2026-10-10, misma tarde)

Felipe dio el OK a los cambios 2 y 3 y pidió investigar a fondo el 1 (y cuántas tarjetas mostrar) antes de decidirlo. Hecho y vuelto a medir:

- **Un solo bloque** bajo la lista de colores: «Combina bien con una blusa» · «En estos colores: ● ● ● ● ● ●» (nombre al pasar o tocar: «Negro · hay en el piso» / «Blanco · no hay aquí», sin el conteo) · la tarjeta. El «¿Por qué?» de la ficha ya no está en esta hoja (sí en el alta y la vista rápida).
- **El «¿Por qué?» habla en tienda:** «Una blusa va arriba de la falda · El negro combina con el beige». `fraseDelPapel` y `fraseDelColor` (`lib/combinar-reglas.ts`), con una prueba que recorre 8 papeles × 4 formas de decirse × 4 anclas y lee cada oración (sin «a un», sin «de el», singular con singular).
- **Blancos y foco** [Medido después]: a 1440 × 900, 0 blancos nuevos bajo 24 px (solo queda la fila de color preexistente de 20 px) y el foco inicial en la hoja (`focoEnLaHoja`); a 375 × 812 (puntero grueso), círculos 36 × 36 (dibujo de 20 + área transparente; con 44 se pisarían entre sí), fila de la tarjeta 174 × 44 con «Ver tallas ›», «¿Por qué?» 36 × 44; sin desborde; un solo círculo en el tabulador y las flechas recorren los demás; rol de botón con «hay en el piso» en el nombre. Contraste del nombre de la tarjeta a `/70` (ya no aparece en la lista de 4,45).
- **Nota provisional** (sin recalificar con ciego): ley 4 sube de 4 a ~8 (las oraciones son de tienda y están probadas); ley 8 de 5 a ~7 (una etiqueta, un «¿Por qué?» por tarjeta); ley 9 de 6 a ~7 (blancos y foco; queda el círculo de 36 en celular). Las leyes 7 y 2 esperan el cambio 1.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `0a1b1c04` | 6,0 · ley 4: 4 | 6 | — (primer análisis; 3 cambios propuestos) |
| 2026-10-10 (tarde) | — | ~6,9 (provisional) | ~8 (provisional: 0 blancos nuevos bajo mínimo; círculos de 36 en celular) | 2 y 3 hechos; el 1 esperando la investigación de cómo lo hacen los mejores |
