# Formidable · Inventario ▸ Existencias ▸ «Ajustar stock», la Planilla rápida   (`/inventario`, modal de la prenda)

- **Fecha / SHA:** 2026-10-26 · 360bbb1fa · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «Conté y no cuadra: ¿cómo dejo el número de cada talla como está de verdad?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s y se corrige en 4 toques, pero si se llega con la hoja bajada se rompe (ley 9 en 4), y lo nuevo
  —los números de "Dónde" y "Revisaste"— hace dudar.»

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega (Sonnet, 4 capturas a 1440): lectura de 5 s correcta en las dos pantallas, tarea en 4 toques (el mínimo), 14 dudas, 11 palabras dudosas · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] 1 acción principal; con el aviso de lugar abierto, 2 («Guardar y pasar a piso» y «Guardar 1 cambio»). [Observado] el ciego dudó cuál usar |
| 3 Simplicidad profunda | 6 | [Observado] «En almacén 34 / En piso 28» son totales del modelo y chocaron con el 10 y el 5 de la talla; «Revisaste 0 de 6 tallas» se leyó como obligación. La columna «Cambio» y «era 10» sí son veredictos |
| 4 Lenguaje de tienda | 7 | [Observado] «Uso interno» sin entender; «Se cuenta un lugar por vez» interpretado. [Medido] el aviso de red dice «Confirmar» (no existe) y «con la misma marca» |
| 5 Contenido primero | 8 | [Opinión] la planilla y sus números mandan; la franja del color ayuda a encontrar la fila |
| 6 Lo difícil, a un toque | 8 | [Código] el «por qué no» de un − o + apagado sale en el aviso al tocarlo (no solo con hover) |
| 7 Perdonar antes que preguntar | 8 | [Observado] Descartar, Seguir en almacén; solo se confirma al guardar. Enter deja el siguiente número seleccionado: el ciego temió pisarlo |
| 8 Quitar antes de agregar | 6 | [Observado] los conteos de «Dónde», el contador «Revisaste» y la pista de Enter suman dudas sin ayudar a decidir |
| 9 De punta a punta | 4 | [Medido] /chaos H1: llegar con la hoja bajada la deja aplastada y corrida (1024×768 siempre); Tab pasa por 4 enlaces invisibles (los plegados); a 375 px − y + miden 32 px |
| **Leyes (promedio)** | **6,8** | la ley 9 en 4 |
| **Oficio visual** | **6** (escritorio; 5 a 375) | [Medido] fallan: texto de 10,5–11,5 px (versalitas, conteos, `Enter`, tallas), 4 bordes casi alineados, 8 radios, el teclado pasa por lo plegado; a 375, blancos de 32 px. Pasan: blancos ≥ 24 con mouse, contraste, foco visible (2 px), espaciado, 0 rojos, 0 hex |

## Los 3 cambios de mayor impacto
1. **La hoja nunca queda corrida** — Antes: si se bajó la hoja (para ver las tallas, que quedan bajo el pliegue a 1024) y se toca «Ajustar stock», la planilla
   queda aplastada y el pie encima de la banda. Después: `soltarPaginaEstable()` al entrar a la planilla y la hoja de alto fijo en `overflow: clip`.
   Ley 9 y oficio. Se verifica con /chaos H1 a 1024, 1280 y 1440 (misma semilla). Esfuerzo S. Presentación: OK de Felipe.
2. **Quitar lo que hace dudar** — Antes: «En almacén 34 / En piso 28» (del modelo entero) y «Revisaste 0 de 6 tallas» con su barra. Después: «Dónde» sin
   conteos (los números están en la tabla) y, en vez del contador, solo el ✓ de cada color ya mirado. Leyes 3 y 8. Se verifica con otra ciega: sin la duda
   de «34 vs 10» ni la de «¿tengo que revisar las 6?». Esfuerzo S. Presentación: OK de Felipe (el contador lo aprobó en la maqueta).
3. **Una sola acción principal con el aviso abierto** — Antes: «Guardar y pasar a piso» y «Guardar 1 cambio», los dos negros. Después: mientras el aviso
   pregunta, el pie baja a secundario y el aviso dice «Guardas lo del almacén y sigues con el piso» en vez de «Se cuenta un lugar por vez». Leyes 2 y 4.
   Esfuerzo S. Presentación: OK de Felipe.

## Lo que sobra (ley 8)
- Los conteos de «Dónde» (34, 28): totales del modelo que nadie pidió y chocan con los de la talla.
- El contador y la barra de «Revisaste»: el ✓ por color dice lo mismo sin parecer tarea.

## Lo que no pediste y importa más
H1: es el camino natural en una laptop (bajar para elegir la talla y tocar «Ajustar stock») y deja la pantalla inusable sin forma de arreglarla salvo cerrar.

## Lista aparte (no se ejecuta)
- Teclado: los botones plegados («Etiquetas», «Rótulo», «Historial», «Catálogo») siguen en el orden de Tab: `inert` al plegar.
- El aviso de red: «Vuelve a tocar «Guardar»», sin «marca» (`lib/ajuste-reglas.ts:480`, compartido con la ventana completa).
- A 375 px: − y + de 44 px con el dedo; «Cerrar» (28) y la vuelta (34) también.
- La caja borra lo que no es dígito sin avisar («1.5» → 15): toca stock, OK de Felipe (/chaos #3).
- «Uso interno»: el ciego no lo entendió; «Se usó en la tienda (vitrina, maniquí)» va solo en el `title`.
- Enter deja el siguiente número seleccionado: ¿solo el cursor, sin seleccionar? (decisión de Felipe: hoy escribir encima es lo rápido).
- Versalitas de 11 px y 8 radios: piezas del sistema, no de esta pantalla.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | pasa: «la ficha de la blusa… elegir una acción»; «una planilla para corregir cuántas hay por talla y color… escribir mi número y guardar» |
| Primer intento | pasa: «Ajustar stock» → 8 en Beige S → «En piso» → «Guardar y pasar a piso», sin retroceder |
| Pasos | 4 toques (el mínimo) |
| Dudas | 14: «34 vs 10», «¿tengo que revisar las 6?», «Guardar gris», «¿Enter guarda?», «miedo de escribir sin querer en Negro S», «¿cuál de los dos guardar?», «Se cuenta un lugar por vez»… |
| Palabras no entendidas | 11, 7 de la vista de la talla (fuera de esta pantalla: «Rótulo», «Pasa a cuarentena», «Taller 14», el «6» del botón); de la planilla: «Revisaste», «Admin · queda a tu nombre», «Uso interno», «entran / salen» |
| Errores evitables | 0 |
Refutado por el revisor: «no hay mensaje de guardado» (las capturas terminaban antes de guardar; hay aviso, sello verde y etiquetas). El revisor fue la
propia sesión, no un agente aparte.

## Antes de decir «listo»
- Concurrencia: [Observado en /chaos] doble clic, ráfaga y recargar escriben una vez; contar mientras otra sesión vende está cubierto por ADR-0494 (`esperado`).
- Caída externa: [Observado en /chaos] red cortada: nada escrito y aviso; respuesta perdida: reintentar no duplica (el texto nombra «Confirmar»).
- Persona sin contexto: ciega sobre capturas; real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-26 | 360bbb1fa | 6,8 | 6 | — |
| 2026-10-26 (b) | (este commit) | 7,3 (provisional, sin repetir la ciega) · leyes 2: 8 · 3 y 8: 7 · 9: 6 | 6 (sin cambio: lo que falla quedó en la lista aparte) | los 3, con el OK de Felipe |

**Re-análisis 2026-10-26 (b), con el OK de Felipe («arregla el bug de la hoja corrida y aplica los 3 cambios; deja la lista aparte para
después»).** Hechos y medidos en un navegador sin pantalla, misma semilla de /chaos (1026):
1. **La hoja no queda corrida** — `useLayoutEffect` en `PanelTalla` que llama `soltarPaginaEstable()` al entrar a la planilla, y `overflow: clip`
   en `<Modal altoFijo>`. [Medido] H1 a 1024, 1280 y 1440: relleno 0, hoja de 660 px, planilla de 246 px (antes, a 1024: relleno de 862 px,
   hoja de 888 px y planilla en su mínimo). Prueba de regresión: `lib/ajuste-modelo-hoja-fija.test.ts`. Cerrado.
2. **«Dónde» sin conteos y sin el contador «Revisaste»** — queda el ✓ de cada color ya mirado. [Medido] el texto de «Dónde» es «En almacén En
   piso» y «Revisaste» ya no está en la hoja. Cerrado (falta la ciega que confirme que se fueron las dudas).
3. **Una acción principal con el aviso abierto** — el «Guardar» del pie baja a secundario mientras el aviso pregunta, y la frase es «Guárdalo y
   sigue con el piso, o descártalo.». [Medido] un solo `btn-primario` visible con el aviso abierto. Cerrado.
Captura antes/después a 1440 con el aviso abierto: `1440-3-aviso.png` (scratchpad de la sesión, no versionada). La lista aparte sigue igual.
