# Formidable · Finanzas ▸ Estados financieros (ADR-0585)

**Pasada por lectura de código, 2026-10-31** (rama `claude/dazzling-gauss-34te52`). El contenedor de la sesión no tenía Supabase: no hubo
navegador con sesión, ni prueba ciega, ni medición de oficio visual. Todo lo de abajo es **Opinión** (leído del código) salvo lo marcado.
Las cuatro pantallas siguen la maqueta aprobada por Felipe (`docs/maquetas/finanzas-eeff-2026-10/`).

## Leyes (provisional, sin ciega)

| Ley | Nota | Por qué |
|---|---|---|
| 1 · sin manual | 8 | Cada pantalla abre con su pregunta y su respuesta en grande («¿Ganamos? Sí, ganaste S/ X»). |
| 2 · una pregunta, una respuesta | 8 | Una pregunta por pantalla; lo formal va plegado al pie. |
| 3 · simplicidad profunda | 8 | Ganancia, plata, valor y lo tuyo se traducen a una cascada o una balanza, sin cuentas a la vista. |
| 4 · lenguaje de tienda | 7 | «Lo que tiene», «lo que debe», «lo tuyo». Lo formal plegado conserva la palabra del contador («Resultados acumulados»), a propósito. |
| 5 · contenido primero | 7 | La línea de lo tuyo arranca en 0: un cambio de S/ 9,000 sobre S/ 150,000 puede verse plano (cambio 1). |
| 6 · lo difícil a un toque | 8 | Cada tramo se toca y abre sus partes; «Qué te recomiendo» lleva a donde se hace. |
| 7 · perdonar | 10 | Solo lee; descargar no cambia nada. |
| 8 · quitar | 8 | Se fueron las cinco tarjetas de lo tuyo, las cuentas en pantalla, la pantalla de Presupuesto y cuatro «Descargar Excel». |
| 9 · de punta a punta | 6 | Bajo 1280 px, «Qué te recomiendo» cae al final de una página larga (cambio 2). Una terminal ve dos tarjetas que llevan a una pared (cambio 3). |

**Oficio visual: sin medir** (falta el navegador a 1024, 1440, 1920 y 375 px, claro y oscuro: `tema:auditar` y `/multi-view-responsive`).

## Los 3 cambios propuestos (esperan el OK de Felipe)

1. **La línea de lo tuyo empieza cerca del mes más bajo**, con sus montos en el eje, para que el cambio de cada mes se vea. Hoy arranca en
   0 y una variación chica se ve plana. Pieza: `<Linea minY>`, en `PatrimonioPanel.tsx`.
2. **Bajo 1280 px, «Qué te recomiendo» sube justo bajo la respuesta.** Hoy, sin la columna al costado, queda al final, después de la
   cascada, las sedes y lo formal. Cambio de orden en las cuatro páginas, sin tocar reglas.
3. **Una terminal con el módulo ve «¿Dónde está la plata?» y «¿Lo tuyo creció?» apagadas, con «Es de CAYLA entera»**, en vez de entrar a
   la pantalla «solo del líder». Depende de la respuesta pendiente de Felipe (¿una terminal ve todo?).

---

# Re-análisis 2026-11-05 · Estados financieros en vidrio (ADR-0611)

- **Rama:** `claude/estados-financieros-vidrio`, sobre el commit `c29f39de5` · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta.
- **Pregunta que debería resolver:** ¿ganamos o perdimos, cuánta plata hay, cuánto vale CAYLA y si lo tuyo creció? · **Protagonista:** el dinero.
- **Veredicto:** cada pantalla se entiende en 5 segundos. Lo que más confunde es el vocabulario de una pérdida («Faltaron», «faltó el 177 %»).
- **Cómo se hizo:** pasada media: medición, un agente ciego (Sonnet, sobre capturas, datos inventados) y revisión de cada hallazgo contra el código. **Sin escéptico aparte ni colaboradora real.** Nota de la ley 1: tope 8 sin pasada real.

## Notas (0–10)

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] 4 de 5 tareas respondidas a la primera, con la cifra correcta. En el calendario no supo cómo se confirma el rango. Real: sin probar |
| 2 Una pregunta, una respuesta | 9 | [Observado] la lectura de 5 s coincide en las 5 tareas · [Medido] una sola acción primaria por pantalla |
| 3 Simplicidad profunda | 7 | [Observado] «Faltó el 177 % de lo que vendiste», «Faltaron» como una parte más, y porcentajes que no dicen de qué son |
| 4 Lenguaje de tienda | 8 | [Observado] dudas en «período», «según las boletas» y «Tú y los préstamos». Sin jerga contable a la vista |
| 5 Contenido primero | 9 | [Observado] la cifra se lee primero en las cuatro |
| 6 Lo difícil, a un toque | 9 | [Observado] encontró «Toca una parte» y «Ver el formato formal» sin ayuda · [Medido] el detalle abre con un toque, sin depender del mouse |
| 7 Perdonar antes que preguntar | 10 | [Medido] solo lee: las fechas viven en la URL y «¿Y si…?» no guarda |
| 8 Quitar antes de agregar | 9 | [Medido] de 7 vistas a 4 pestañas; lo demás, plegado |
| 9 De punta a punta | 8 | [Medido] 0 desbordes a 1920, 1440, 1024 y 375, claro y oscuro. A 375 px la revisión encontró 3 defectos, ya corregidos. Falta medir la fluidez en el Mac mini |
| **Leyes (promedio)** | **8,5** | |
| **Oficio visual** | sin nota | [Medido] contraste: 0 fallas · dedo: solo los tramos de la barra. El motor marca de 5 a 7 de 8 comprobaciones, casi todo del marco o de lo plegado (texto chico de la cabecera, radios del vidrio, negativos en rojo de una tabla): no alcanza para una nota honesta sin separar eso |

## Los 3 cambios de mayor impacto (Felipe aprobó los tres el 2026-11-05; ya están hechos)

1. **El calendario dice cómo se usa.** Antes: «Elige los días, un atajo, o escríbelos». Después: «Toca el primer día y luego el último. Se aplica solo». Ley 1. Se verifica repitiendo la tarea E. Esfuerzo S.
2. **Una pérdida se dice con palabras.** Antes: «Perdiste en noviembre: faltó el 177 % de lo que vendiste», la tarjeta «Faltaron» y «45 %» sueltos. Después: «Perdiste en noviembre: por cada S/ 100 que vendiste, faltaron S/ 177», la tarjeta «Perdiste» y «45 % de lo vendido». Ley 3. Solo textos, las cifras no cambian. Esfuerzo S.
3. **El tubo del Balance nombra sus lados.** Antes: «S/ 54,486 + S/ 155,753» y una parte rayada sin nombre. Después: «Debes S/ 54,486 + tuyo S/ 155,753». Ley 3. Esfuerzo S.

## Lo que sobra (ley 8)

Nada a la vista. El cuadro por sede con sus casillas nativas sigue dentro de «Ver más»: es lo más viejo que queda, y no se tocó.

## Lo que no pediste y importa más

**Ganancias y Patrimonio pueden decir dos «ganaste» distintos.** Ganancias suma los sueldos estimados que Dynamic todavía no paga (`getEstadoResultados` → `aplicarProvision`, `lib/resultados.ts`); Patrimonio y Balance leen el diario, que no los tiene. [Código] leído, no observado con datos reales: el seed local no trae provisión. En la prueba, la contradicción que vio el ciego («Ganaste S/ 59» contra «−S/ 6,447») viene de los datos inventados, que no salen de un mismo diario, pero con datos reales puede pasar en un mes con sueldos sin pagar. Felipe eligió explicarlo (2026-11-05): el detalle de «Ganaste» en Patrimonio ahora lo dice. Las cifras no cambian.

## Lista aparte (no se ejecuta)

- «Tú y los préstamos»: el ciego no sabe si son préstamos pagados o recibidos (el detalle lo aclara con un toque).
- Las casillas nativas de 13 px en «Ver más» y en «¿Y si…?», con su etiqueta como área de clic.
- El nombre «Empresa» como sede: viene de la mesa de mando, compartida con todo Finanzas.

## Prueba ciega (Sonnet, capturas a 1440 px, datos inventados)

| Tarea | Lectura de 5 s | Primer intento | Pasos | Dudas | Palabras no entendidas |
|---|---|---|---|---|---|
| A ¿Ganamos o perdimos, y en qué se fue? | coincide | sí | 4 | «Faltaron», porcentajes que suman más de 100, «faltó el 177 %» | período, según las boletas, Empresa, Faltaron |
| B ¿Cuánta plata hay y por qué cambió? | coincide | sí | 3 | «Tú y los préstamos» | Del día a día, Tú y los préstamos |
| C ¿Cuánto vale y cuánto debe? | coincide | sí | 3 | quién es «tuyo», la parte rayada | ninguna grave (las interpretó bien) |
| D ¿La parte del dueño creció? | coincide | sí | 3 | la contradicción con A (datos inventados), «tú» | patrimonio, retiraste |
| E Ver del 1 al 15 de octubre | coincide | **no del todo** | 3 o 4 | «no veo un botón Aplicar» | se compara con octubre a esta fecha |

Errores evitables: no aplica, porque fue sobre capturas: no tocó nada. No prueba el arrastre sobre los meses ni el teclado.

## Antes de decir «listo»

- **Concurrencia:** no aplica, solo lee. Dos personas ven lo mismo porque las fechas viven en cada URL.
- **Caída externa:** si la base no responde, el marco común manda a `/sin-base` (ADR-0450). Si falla la lectura de apoyo del calendario, el calendario funciona igual, sin barritas ni puntos.
- **Persona sin contexto:** la prueba ciega de arriba. Falta la colaboradora real.

---

# Re-análisis 2026-11-07 · Ganancias y pérdidas con la regla pareja del IGV (ADR-0624)

- **Rama:** `claude/excluir-igv-compras-66846a` (PR #1697), commit `2fe4eda55` · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta.
- **Alcance:** solo lo que cambió: el informe arranca con «Cobraste» → «IGV de tus ventas · es de SUNAT» (con su detalle) → «Lo que vendiste», y la cascada igual.
- **Pregunta que debería resolver:** ¿cuánto pagaron los clientes, cuánto de eso es de SUNAT y cuánto vendió de verdad la tienda? · **Protagonista:** el dinero.
- **Veredicto:** se entiende que el IGV es de SUNAT y no sale de la caja; «Cobraste» y el 18 % confunden, y el nombre largo corta la tabla a 1440 px.
- **Cómo se hizo:** pasada media: medición en el navegador local (base de prueba aparte, datos inventados), un agente ciego (Sonnet, sobre capturas), un revisor de leyes sobre código y capturas; el escéptico fui yo, contra el código. Colaboradora real: sin probar.

## Notas (0–10), solo de lo cambiado

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] respondió bien B y C; A con seguridad media («Cobraste: no sé si es lo que me pagaron los clientes»); D baja por la cadena de signos |
| 2 Una pregunta, una respuesta | 9 | [Observado] la lectura de 5 s coincide: «cuánto ganó la tienda en noviembre» |
| 3 Simplicidad profunda | 7 | [Medido] la fila del IGV lleva «18 %» y barrita: siempre da 18 %, no dice nada (`estados-ganancias.ts:274`) |
| 4 Lenguaje de tienda | 7 | [Observado] duda en «Cobraste» · [Opinión] choca con «cobrado» de Caja y Flujo, que incluye abonos |
| 5 Contenido primero | 9 | [Observado] la cifra grande se lee primero |
| 6 Lo difícil, a un toque | 7 | [Observado] encontró el detalle del IGV con un toque · [Medido] «(míralo en Impuestos)» es texto, no se puede tocar |
| 7 Perdonar antes que preguntar | 10 | [Medido] solo lee |
| 8 Quitar antes de agregar | 7 | [Medido] «es de SUNAT» se dice tres veces: nombre de la fila, su nota y la nota de «Lo que vendiste» (`ganamos-reglas.ts:22,28,33`) |
| 9 De punta a punta | 7 | [Medido] a 1440 px la tabla mide 660 px en una caja de 642: «De lo vendido» queda cortado. El nombre del IGV mide 260 px; el siguiente, 178. A 375 px corre dentro de su caja, sin desborde de página |
| **Leyes (promedio)** | **7,8** | |
| **Oficio visual** | sin nota | [Medido] contraste de las filas nuevas: 15,36 · 13,75 · detalle 4,66 (14 px) · tenue 5,21 · los nombres de fila miden 23 px de alto (viene de antes, en todas las filas) |

## Los 3 cambios de mayor impacto (Felipe aprobó los tres el 2026-11-07; ya están hechos)

**Después [Medido], a 1440 px:** la tabla mide 642 px en su caja de 642 (antes 660): «De lo vendido» se lee entero. La fila del IGV va sin «18 %» ni barrita, y su detalle trae «Ver tu saldo a favor en Impuestos» (`<EnlaceVer>`, con la sede y el mes de la pantalla). La primera fila se llama «Vendiste con IGV»: Felipe pidió la recomendación y se eligió porque esa cifra son ventas, no la plata que entró (lo que Caja y el Flujo llaman «cobrado»). Sin nueva pasada ciega.

1. **Nombre corto y una sola explicación.** Antes: «IGV de tus ventas · es de SUNAT» + dos notas que repiten «es de SUNAT». Después: «IGV de tus ventas»; su nota «Le toca a SUNAT. Mientras tengas saldo a favor no sale de tu caja: se descuenta de ese saldo.»; la de «Lo que vendiste», «Sin IGV.». Leyes 9 y 8. Se verifica midiendo que la tabla quepa en su caja a 1440 y 1024 px. Esfuerzo S. Solo texto.
2. **Sin «18 %» ni barrita en la fila del IGV**, como «Cobraste». Leyes 8 y 3. Se verifica en la captura y en su prueba. Esfuerzo S. Ninguna suma cambia.
3. **Un nombre que no se confunda con la caja, y el enlace tocable a Impuestos.** Antes: «Cobraste» y «míralo en Impuestos» como texto. Después: el nombre que Felipe elija y «Ver en Impuestos» con `<EnlaceVer>` dentro del detalle, conservando sede y mes. Leyes 4, 1 y 6. Se verifica con otra pasada ciega («¿cuánto entró a tu caja?») y abriendo el enlace. Esfuerzo M. Nombre de una cifra que roza lo tributario: decide Felipe.

## Lo que sobra (ley 8)
- La nota «Sin IGV: ese 18 % es de SUNAT.» sobre «Lo que vendiste»: la fila de arriba ya lo dice.

## Lo que no pediste y importa más
- La cadena de signos de «Otros gastos a favor» (−S/ 135.83 que suma) confundió a la ciega más que todo lo nuevo. Viene de antes y de datos inventados raros; va a la lista aparte.

## Lista aparte (no se ejecuta)
- Nombres de fila de 23 px de alto, bajo el mínimo de 24 (todas las filas, viene de antes).
- «1–7 sep / 1–7 oct» sin explicar por qué siete días (mes en curso comparado a la fecha).

## Prueba ciega (Sonnet, capturas a 1440 px, datos inventados)

| Tarea | Lectura de 5 s | Primer intento | Dudas | Palabras no entendidas |
|---|---|---|---|---|
| A ¿Cuánto pagaron los clientes? | coincide | sí, seguridad media | «Cobraste» | — |
| B ¿Cuánto no es de la tienda y de quién? | coincide | sí, seguridad alta | — | IGV (lo entendió bien) |
| C ¿Sale plata de la caja para el IGV? | coincide | sí, tras abrir el detalle | no ve cuánto saldo queda | saldo a favor (lo entendió bien) |
| D ¿Cuánto vendió y ganó o perdió? | coincide | no del todo | la cadena de signos, «a favor» | ajustes a favor que no son ventas |

## Antes de decir «listo»
- **Concurrencia:** no aplica, solo lee.
- **Caída externa:** si `fn_igv_de_las_ventas` no responde, las dos filas de arriba no se dibujan y la pantalla queda como antes; el resultado no depende de ellas.
- **Persona sin contexto:** la prueba ciega de arriba. Falta la colaboradora real.

## Historial

| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-31 | rama `claude/dazzling-gauss-34te52` | 7,8 (provisional) | sin medir | — |
| 2026-11-05 | cierre de la rama | 8,5 (antes de los 3 cambios de texto; sin volver a medir con el ciego) | medido, sin nota | Los 3 de esta pasada. De los 3 de octubre: la línea de lo tuyo ya no arranca en 0 (`geometriaDeLinea`) y «Qué te recomiendo» va a todo el ancho antes de «Ver más». El de la terminal sigue esperando |
| 2026-11-07 | `2fe4eda55` (PR #1697) | 7,8 (solo lo cambiado por ADR-0624, antes de los 3 cambios) | medido, sin nota | Los 3 de esta pasada: nombre corto y una sola explicación, sin 18 % ni barrita, «Vendiste con IGV» y el enlace a Impuestos |
