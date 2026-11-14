# Formidable · Compras ▸ Historial de compras, Por pagar y Revisar compras — la MAQUETA   (`docs/maquetas/historial-compras-2026-11/`)

## Tercera vuelta · 2026-11-13 — la pestaña se llama «Compradoras» (decisión de Felipe) y la ciega repetida

| Medida | Revisar compras (2.ª vuelta) | Compradoras (3.ª vuelta) |
|---|---|---|
| Lectura de 5 s | falla: «no vi nada de plata entregada a compradoras» | **pasa a medias**: «sospeché que "Compradoras" era donde estaría ella, pero no estaba segura» |
| Primer toque | el buscador de Historial | **la pestaña «Compradoras»** |
| Toques hasta la cuenta de Maribel | 3 | **2** |
| Toques en toda la tarea | 13 | **9** |
| Dudas nuevas | — | «Ver su cuenta»: «pensé que era una cuenta bancaria»; el botón «Darle S/ 300.00» quedaba bajo el borde de la hoja y tuvo que bajar |

**Notas:** ley 1 de 7 a **8** (el tope sin colaboradora real) · **leyes 7,2** · oficio sin cambios (4).

**Dos arreglos chicos que esta vuelta destapó, hechos con el OK de Felipe:** «Ver su cuenta» → «Ver su plata» (no se confunde con una cuenta del banco), y el pie de «Darle plata» y de la hoja de pago se pega al fondo de la hoja (`pie-hoja-fijo`, la regla del repo para hojas largas). [Medido] a 1440 × 900 el botón «Darle S/ 300.00» queda en 769–811 px, dentro de la ventana, con la hoja de 786 px de contenido en 742 de alto. Sin repetir la ciega.

## Segunda vuelta · 2026-11-13 — los 3 cambios, hechos con el OK de Felipe («Sí, los 3»), y la ciega repetida

### Medido (antes → después)
| Comprobación | Antes | Después |
|---|---|---|
| Primera compra de Historial a 1024 × 768 · 1280 × 800 · 375 × 812 | 886 · 749 · 832 px | **523 · 563 · 720 px** (bajo 1380 px el resumen es una franja de una línea: «Este mes · Por llegar · Por pagar» y «Ver todo») |
| Primera deuda de Por pagar a 1024 × 768 · 1280 × 800 | 927 · 722 px | **477 · 517 px** (franja «Debes · Ya vencido» y «Ver cuándo vence y a quién») |
| Desde 1440 | 470 · 422 px | igual: la franja no aparece y el resumen sigue al costado |
| «Pagar juntos» al marcar una deuda | fuera de la vista (el `sticky` vivía en una caja de su mismo alto) | pegada abajo, dentro de lo que se ve |
| «Pagar» de la fila y del cajón | abría el detalle | abre la hoja de pago: cuánto le debes, qué compraste y si llegó («Revisa antes de pagar: todavía faltan 70 prendas»), cuánto pagas (no deja pagar más de lo que se debe), de qué cuenta sale (con lo que hay y «no alcanza»), quién paga; al pagar baja la deuda y la lista se pone al día |
| Buscar «Maribel» en Historial | «No hay compras con «Maribel»» | la tarjeta «Compradoras · Maribel · Tiene que devolver S/ 180.00 · Ver su cuenta», que abre su libreta; el buscador dice «…número o compradora» |
| El viaje en la cola | «Maribel · ronda RC-000030» | «Maribel · viaje del 10 al 12 nov» (el código queda en el cajón); la píldora «Rondas» pasa a «Devoluciones» |
| El botón de la cabecera | «Entregar plata» | «Darle plata»; cada nombre de «Quién tiene plata» dice «Ver su cuenta» |
| Errores de consola, desborde a 375 px | 0 · 0 | 0 · 0 |

### Ciega repetida (Sonnet; las mismas tareas)
| Medida | Por pagar (ahora a 1024 × 768) | Revisar compras |
|---|---|---|
| Lectura de 5 s | correcta | sigue fallando: «no vi nada de plata entregada a compradoras» |
| Primer intento | **sí, terminó** (antes no llegaba al último paso) | **sí**: buscó a Maribel en Historial y esta vez la encontró |
| Pasos | **3** (antes 6) | **3 hasta la cuenta de Maribel** (antes 5 en el lugar equivocado y nunca la abrió); 13 en toda la tarea |
| Dudas | 5: «¿Nativa o Hilados del Norte?» en el título de la hoja; creyó que BCP venía elegida (era el foco) | 6: el buscador no decía que busca personas; el nombre de las pestañas no habla de compradoras |
| Arreglado después | el título dice la empresa a la que pagas («Pagar a Hilados del Norte SAC · Marca Nativa») y el cursor va a «¿Cuánto pagas?», no a una cuenta | el buscador dice «Marca, proveedor, prenda, número o compradora» |

### Notas después de los cambios
| Eje | Antes | Ahora | Evidencia |
|---|---|---|---|
| 1 Sin manual | 6 | 7 | [Observado] las dos ciegas terminaron al primer intento; la lectura de 5 s de Revisar compras sigue fallando · real: sin probar (tope 8) |
| 4 Lenguaje de tienda | 6 | 7 | [Observado] ya nadie leyó «ronda» ni dudó entre dar y recibir; queda «¿marca o proveedor?» |
| 5 Contenido primero | 5 | 7 | [Medido] la primera fila entra en un portátil (523 y 477 px a 1024 × 768) |
| 6 Lo difícil, a un toque | 6 | 7 | [Observado] la ciega abrió la libreta de Maribel en 3 pasos |
| 9 De punta a punta | 5 | 6 | [Medido] «Pagar juntos» se pega; siguen sin dibujar error, cargando y sin conexión, y la hoja «Darle plata» todavía crece al elegir |
| 2, 3, 7, 8 | 8, 8, 7, 7 | igual | sin cambios |
| **Leyes (promedio)** | **6,4** | **7,1** | ninguna ley bajo 6 |
| **Oficio** | 4 | 4 (sin repetir la medición completa) | las casillas de 18 px, el foco del buscador y los radios siguen (lista aparte; la pantalla real usaría las piezas del sistema) |

### Lo que queda
- **El nombre de la pestaña: decidido.** Felipe eligió «Compradoras» (2026-11-13); la ciega de la tercera vuelta la tocó primero.
- **Tu regla para pagar una compra que no llegó**: la hoja avisa («Revisa antes de pagar»), no frena.
- La lista aparte de la primera vuelta (la hoja que crece, «Qué compraste2», las casillas, el foco del buscador).

---

## Primera vuelta · 2026-11-13

- **Fecha / SHA:** 2026-11-13 · `4ba55d0ca` (rama `claude/purchase-history-audit-164e87`) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Qué se probó:** la vista «Propuesta · El libro» de la maqueta, no la pantalla real. Se sirvió una copia sin los textos de la auditoría ni los controles de
  comparación (`ciego.html`, fuera del repo), para que la prueba ciega no leyera las respuestas. Datos inventados.
- **Pregunta que debería resolver (1 frase):** Historial: «¿cuánto compré y qué quedó pendiente?» · Por pagar: «¿a quién le debo y qué vence primero?» ·
  Revisar compras: «¿qué anotaron las compradoras y quién tiene plata?» · **Protagonista:** el dinero y la compra
- **Veredicto en una línea:** Historial se entiende al primer toque. Revisar compras **no se encuentra**: la ciega buscó la plata de la compradora en
  Historial y llegó en el paso 5. En un portátil de 1024 px la lista queda bajo el borde. Leyes 6,4 · oficio 4 (la mayoría, de la maqueta y no de las piezas del sistema).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] Historial: 1 toque, lectura de 5 s correcta. Por pagar: respondió todo, pero «Pagar» de la fila abrió el detalle y no el pago. Revisar compras: 5 pasos en el lugar equivocado (buscó «Maribel» en Historial: 0 resultados; tocó el menú; fue a Por pagar) y nunca abrió la libreta de Maribel tocando su nombre · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] 0, 0 y 1 botón negro por pestaña («Entregar plata» en Revisar compras) |
| 3 Simplicidad profunda | 8 | [Observado] los tres ciegos leyeron bien los veredictos de la fila: «Llegó todo y está pagada», «Llegaron 255 de 510 · 18 días tarde», «Vencida hace 3 días», «Tiene que devolver S/ 180» |
| 4 Lenguaje de tienda | 6 | [Observado] «ronda RC-000030» (un código); «Por llegar · 3 compras» y «Falta que llegue 3» son dos nombres para lo mismo; dudó si «Entregar plata» era dar o recibir; dudó qué es marca y qué proveedor en «Ámbar · Textiles Andina SAC» |
| 5 Contenido primero | 5 | [Medido] a 1024 × 768 la primera compra empieza a 886 px (Historial) y la primera deuda a 927 px (Por pagar): bajo el borde. A 1280 × 800 asoma una sola fila (749 y 722 px). Desde 1440 entra (470 y 422 px). Bajo 1380 px el resumen del costado sube como banda encima de la lista |
| 6 Lo difícil, a un toque | 6 | [Observado] el cajón del detalle se encontró al primer toque; la libreta de cada compradora existe a un toque, pero nadie la descubrió |
| 7 Perdonar antes que preguntar | 7 | [Observado] «Entregar plata» resume antes de entregar («Sale de Caja de Trujillo y pasa a Rosa») y el botón lleva el monto; el pago no está dibujado en la maqueta (sin probar) |
| 8 Quitar antes de agregar | 7 | [Medido] de 17 a 11 controles en Historial y de 26 a 5 antes de la primera deuda en Por pagar; se fue «¿Te alcanza?». Sigue sobrando: «vencida» en rojo 4 veces en Por pagar |
| 9 De punta a punta | 5 | [Medido] la barra «Pagar juntos» nunca se pega abajo (su contenedor mide lo mismo que ella) y queda fuera de la vista; la hoja «Entregar plata» crece 69 px al elegir cómo y los botones se mueven bajo el cursor; error, cargando y sin conexión no están dibujados. 375 px sin desborde |
| **Leyes (promedio)** | **6,4** | dos leyes en 5 (contenido primero y de punta a punta) |
| **Oficio visual** | **4** | [Medido] fallan 6 de 10: casillas de 18 × 18 px (< 24); el buscador sin foco visible (blocker: tope 5); 7 radios distintos en Historial y 6 en Por pagar (≤ 3); 10 tamaños de letra en Historial (≤ 4); bordes a 342 y 344 px (título del mes contra la fila); 4 textos rojos de «vencida» en Por pagar. Pasan: contraste del contenido, letra mínima (las versalitas de 11 px están exentas), teclado (Esc cierra, ↑ ↓ pasan de compra), sin desborde a 375, 1024 y 1440. **Casilla, buscador y radios son de la maqueta: la pantalla real usaría `<Casilla>` y `<Buscador>`, que ya los cumplen** |

## Los 3 cambios de mayor impacto
1. **La lista a la vista en un portátil.** Antes: bajo 1380 px el resumen sube como banda y la primera compra queda a 886 px de una pantalla de 768. Después: bajo 1380
   px el resumen se pliega a una franja de una línea («Comprado en noviembre S/ 6,871.60 · Por llegar 3 · Por pagar S/ 45,702.00»), y las barras de los meses, las
   semanas y los proveedores van bajo «Ver el resumen». **Ley 5 y 9.** Se verifica: a 1024 × 768 y 1280 × 800 la primera fila empieza antes de 500 px. Esfuerzo M.
   Decide Felipe (presentación).
2. **La plata de las compradoras se encuentra.** Antes: la pestaña «Revisar compras» no dice que ahí vive la plata, el buscador de Historial no encuentra personas,
   el nombre en «Quién tiene plata» no parece tocable y el viaje se llama «ronda RC-000030». Después: el buscador de Historial, al escribir un nombre, ofrece «Maribel ·
   tiene que devolver S/ 180.00 → Ver su cuenta»; cada nombre de «Quién tiene plata» dice «Ver su cuenta»; el viaje se nombra por sí mismo («Viaje a Lima · 10 al 12 nov»,
   el código queda en el detalle); «Entregar plata» pasa a «Darle plata». **Ley 1, 4 y 6.** Se verifica: la misma ciega llega a la cuenta de Maribel en 2 toques o
   menos. Esfuerzo S. Decide Felipe (presentación; el nombre de la pestaña lo dejaste pendiente).
3. **«Pagar» paga, y «Pagar juntos» se queda a la vista.** Antes: el botón «Pagar» de cada fila abre el detalle de la compra, y la barra de «Pagar juntos» queda bajo
   el borde. Después: «Pagar» abre la hoja de pago con su resumen (cuánto, a quién, de qué cuenta y si la mercadería llegó), el detalle se abre tocando la fila, y la
   barra se pega abajo como la Isla (`<BarraDeAbajo tono="tinta">`). **Ley 1 y 9.** Se verifica: la ciega de Por pagar llega al «último paso antes de pagar» sin
   retroceder. Esfuerzo M. **Toca dinero: la hoja de pago espera tu OK.**

## Lo que sobra (ley 8)
- «Vencida» en rojo 4 veces en Por pagar (el resumen, el título del grupo y cada fila): el rojo basta en el resumen y en el grupo; la fila lo dice en tinta.
- «Por llegar» y «Falta que llegue» para lo mismo: un solo nombre.

## Lo que no pediste y importa más
La maqueta no dibuja el pago, que es lo único de las tres pestañas que mueve plata. Y sigue abierta tu decisión de la auditoría: qué pasa al pagar una compra de la
que no llegó nada (Casaca Lía: 0 de 70 prendas, 63 días tarde). Antes de construir Por pagar, eso necesita su hoja y tu regla.

## Lista aparte (no se ejecuta)
1. La hoja «Entregar plata» salta 69 px al elegir cómo y 29 px más al cambiar de medio: reservar el lugar del bloque «¿De qué cuenta sale?».
2. «Qué compraste» con el globito pegado: el lector de pantalla lee «Qué compraste2» (falta un espacio o un `aria-label`).
3. «Ámbar · Textiles Andina SAC»: dudó qué es marca y qué proveedor (Opinión: probar con «Ámbar» arriba y «de Textiles Andina SAC» debajo).
4. Las casillas a 24 px y el foco del buscador, si la maqueta se usa para más pruebas (la pantalla real usa las piezas del sistema).

## Prueba ciega
Tres agentes (Sonnet), cada uno en su propia pestaña a 1440 × 900, sin el repo, con una tarea en palabras de tienda.

| Medida | Historial | Por pagar | Revisar compras |
|---|---|---|---|
| Lectura de 5 s | correcta | correcta (pensó en la pestaña Historial y fue a Por pagar) | **falla**: «creí que era un registro de lo que la tienda compró, no de la plata de Maribel» |
| Primer intento | sí | respondió todo; no encontró «el último paso antes de pagar» | no: 5 pasos en el lugar equivocado |
| Pasos | 1 | 6 | 21 (con 2 fallidos de la herramienta y 1 equivocado); 6 en el flujo limpio de «Entregar plata» |
| Dudas | 4 | 5 | 6 |
| Palabras no entendidas | «Qué compraste2» (artefacto, ver escéptico) | «comprobante» (la entendió como factura) | «ronda RC-000030» (la entendió como «viaje con su número») |
| Errores evitables | 0 | 0 | 1 (cerró la hoja con un clic viejo; el escéptico no pudo reproducirlo con un clic nuevo) |

Dudas textuales: «Dudé entre "Por llegar 3 compras" y "Falta que llegue 3"» · «esperaba una pantalla de pago y salió el detalle de la factura» · «"Entregar plata": no
sabía si era dar o recibir plata» · «"HISTORIAL" contra "REVISAR COMPRAS". Dudé cuál era para la plata de las compradoras».

### Escéptico (Sonnet, midió por su cuenta)
| Hallazgo | Veredicto |
|---|---|
| La lista bajo el borde a 1024 | CONFIRMADO; a 1280 asoma una sola fila |
| Casillas de 18 px | CONFIRMADO |
| Rojo | MATIZADO: 3 textos en Historial y 4 en Por pagar (los demás eran colores de prenda); es ruido, no la regla de 2 rojos, que es de `<EnlaceVer>` |
| Radios | MATIZADO: 7, 6 y 2 (no 9, 6 y 5) |
| Buscador sin foco | CONFIRMADO (de la maqueta) |
| «para , a crédito» con un hueco | REFUTADO: dice «para **Lima**», artefacto de la extracción de texto |
| «Qué compraste2» | MATIZADO: el texto sí va pegado; un lector de pantalla lo leería igual |
| «Por llegar» y «Falta que llegue» | CONFIRMADO |
| «Pagar» abre el detalle | CONFIRMADO: el botón no tiene acción propia y el clic sube a la fila |
| «Pagar juntos» cortada | CONFIRMADO: un `sticky` dentro de un contenedor de su mismo alto nunca se pega |
| Revisar compras no se encuentra | MATIZADO: la libreta funciona; es descubribilidad, no función rota. El clic que cerró la hoja es probablemente de la herramienta, con el salto de 69 px de por medio |
| **Nuevos:** la hoja que salta bajo el cursor y la fila única a 1280 | sumados arriba |

## Antes de decir «listo»
- **Concurrencia:** no aplica: la maqueta no guarda. Al construir, dos personas sobre la misma deuda o la misma entrega van por `/chaos`.
- **Caída externa:** sin probar: la maqueta no dibuja error, cargando ni sin conexión.
- **Persona sin contexto:** tres ciegas (arriba); colaboradora real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-13 | 4ba55d0ca | 6,4 | 4 | — (los 3 esperan el OK de Felipe) |
| 2026-11-13 | 0b376d43f | 7,1 | 4 | los 3, con el OK de Felipe; ciega repetida en Por pagar y Revisar compras |
| 2026-11-13 | (este commit) | 7,2 | 4 | la pestaña «Compradoras»; ciega repetida: 2 toques hasta Maribel |
