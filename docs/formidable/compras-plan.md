# Formidable · Compras ▸ Plan de campaña   (`/compras/plan`, con su hoja de categoría, el paso a paso, «Poner el tope» y «Nueva campaña»)

- **Fecha / SHA:** 2026-10-10 · `b274c507` (rama `claude/elegant-bose-201880`, ya fusionada en `main` como `b4edf77d`) · **Dispositivo que manda:**
  escritorio (Mac mini o laptop de quien compra). 375 px se mide, pesa poco: es una pantalla del líder.
- **Pregunta que debería resolver (1 frase):** «¿Cuánto le compro al proveedor de cada categoría para diciembre?» · **Protagonista:** la categoría y su
  «Comprar N».
- **Veredicto en una línea:** «Se entiende en 5 s qué es y se completa al primer intento, pero el número que más decide la compra («Lo que sobra») se
  llena a ciegas, y la respuesta de la hoja queda fuera de la vista mientras se escribe.»
- **Escala de esta corrida:** medición del DOM a 1440, 1024 y 375 px (yo) · **una** prueba ciega (1 agente, Sonnet, en el navegador local con datos
  inventados) · **un** escéptico (1 agente, Opus, código + navegador). Sin revisor de leyes en agente: lo hice yo. Base local restaurada después.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 | [Observado] ciego: a los 5 s dijo «planificación de compras de diciembre por categoría, con tres escenarios»; completó la tarea al primer intento (19 acciones). Pero puso «Lo que sobra = 60» sin saber qué era, y con el margen de CAYLA ese número infla la compra (ver «Lo que no pediste»). · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] según el estado hay 0 primarios (todas las que más venden con plan) o hasta 10 «Armar plan» primarios a la vez (`FilaCategoria.tsx:55`); nunca uno |
| 3 Simplicidad profunda | 5 | [Medido] el porqué dice «se compra para cubrir 62 de cada 100 diciembres posibles» (un cuantil); «Lo que sobra» es un parámetro crudo, sin veredicto en su lugar |
| 4 Lenguaje de tienda | 6 | [Observado] no entendió «Por llenar primero»; dudó con «Hay hoy», «Curva de tallas · Suma 100 %» y «Lo que sobra». [Opinión] «en la red» y «escenarios» son jerga |
| 5 Contenido primero | 4 | [Medido] la lista empieza en y = 930 px a 1024 × 768 (bajo el pliegue) y en y = 818 a 1440 × 900; en la hoja, «Comprar N · S/» empieza en el px 911 de 1350 y se ven 802 |
| 6 Lo difícil, a un toque | 6 | [Medido] la explicación del cálculo y la de la curva están siempre a la vista; no hay «¿Por qué?» que las guarde |
| 7 Perdonar antes que preguntar | 4 | [Observado] Escape o clic fuera con la hoja a medio llenar la cierra y se pierde todo, sin preguntar; en el paso a paso, «Saltar», otra categoría o «Tabla» también lo pierden (`PasoAPaso.tsx:73, 169`). El ERP ya tiene la pieza: `useSalidaSinGuardar` |
| 8 Quitar antes de agregar | 6 | [Opinión] «En enero, al lado, lo que se vendió de verdad» en el subtítulo antes de que empiece la campaña; las 7 cajas de la curva siempre abiertas aunque vienen propuestas |
| 9 De punta a punta | 5 | [Medido] (chaos) un `?plan=` que no existe dice «no hay ninguna campaña» y no deja salir; un número enorme da un error técnico; si la respuesta se pierde dice «No se guardó nada» aunque se guardó; a 375 px las píldoras del aviso se salen de su tarjeta |
| **Leyes (promedio)** | **5,1** | dos leyes en 4 (contenido primero, perdonar) |
| **Oficio visual** | **7** | [Medido] 7 pasan, 3 fallan: alineación (las 3 cajas de diciembre a 354, 339 y 321 px de alto y saltan mientras se llenan), jerarquía (6 tamaños de texto propios), alturas de una fila (el selector de campaña mide 30,5 px junto a «Exportar» de 40). Lo que falla del marco global no cuenta: el «/» del buscador 3,6 : 1, la opción inactiva del segmento «modo» 4,13 : 1, la lupa del buscador que no pone el foco |

## Los 3 cambios de mayor impacto
Felipe dio el OK el 2026-10-10 («Termina lo que te falta e implementa»). Ninguno cambia el cálculo ni una regla de dinero.
1. **La hoja dice la respuesta mientras escribes y no pierde lo escrito.** Antes: «Comprar N · S/» al fondo, fuera de la vista; Escape lo borraba todo.
   Después: la respuesta va en el pie fijo, junto a «Guardar»; los campos en una grilla que no salta; salir con cambios pregunta («¿Salir sin guardar?»),
   también en el paso a paso. Leyes 5 y 7, oficio. Esfuerzo M. Se verifica: escribir sin hacer scroll y ver la cifra; Escape con cambios pregunta.
2. **Las preguntas de la hoja en palabras de tienda.** Antes: tres cajas «Venderías» que parecían opciones, «Lo que sobra» sin explicación, un cuantil
   en el porqué. Después: una pregunta que agrupa los tres diciembres, «Lo que sobra» dice qué es y qué produce («con 60 %, sobrar casi no te cuesta: se
   compra para un diciembre bueno»), el porqué sin «de cada 100», cada caja con su nombre para el lector de pantalla, «Hay hoy» sin «en la red» y «Las
   que más venden, sin plan» en vez de «Por llenar primero». Leyes 1, 3 y 4. Esfuerzo M. Se verifica: el mismo recorrido ciego, sin esas dudas.
3. **La primera vista lleva a la lista y a una sola acción.** Antes: subtítulo de 3 líneas, aviso alto, 0 o hasta 10 primarios. Después: subtítulo de
   una línea (lo de enero solo cuando empieza), aviso más corto con píldoras que caben, UNA acción primaria («Empezar por <la que más vende sin plan>»),
   las filas en secundario y el selector a la altura de «Exportar». Leyes 2, 5 y 9, oficio. Esfuerzo S. Se verifica: medir dónde empieza la lista a
   1024 × 768 y contar los primarios.

## Lo que sobra (ley 8)
- La frase «En enero, al lado, lo que se vendió de verdad» antes de que empiece la campaña: no ayuda a decidir hoy.
- Las 7 cajas de la curva siempre abiertas: vienen propuestas por el sistema (va a la lista aparte: plegarlas con un resumen «XS 1 · S 1 · M 3…»).

## Lo que no pediste y importa más
**«Lo que sobra» decide cuánto se compra, y hoy lo escribe cada quien, por categoría, sin dato.** Con el margen de CAYLA (Vestidos: precio 143,23,
costo 55,33), desde un 18 % el sistema ya compra por encima del 75 % de los diciembres posibles, y desde un 39 % compra para el diciembre bueno
(`cuantilCritico`, `plan-compra-reglas.ts:183`). El ciego puso 60 sin saber qué era. Propuesta (regla de dinero: decide Felipe): un solo porcentaje de
CAYLA, lo que de verdad se recupera en la liquidación de enero, fijado por un líder y puesto como valor de partida en cada categoría.

## Lista aparte (no se ejecuta sin que Felipe lo mande)
1. Plegar la curva de tallas con un resumen por talla (ley 8).
2. Global · `Buscador`: un clic en la lupa no pone el foco en la caja y lo tecleado se pierde (`Buscador.tsx:132`, `e.target === e.currentTarget`).
3. Global · `SegmentoDeslizante forma="modo"`: la opción inactiva mide 4,13 : 1.
4. Una fila con plan no dice que se puede corregir (sin flecha ni texto).

## Refutados o matizados por el escéptico
- F1 matizado: a 1440 × 900 la primera fila entra justo en el borde (y = 818, no 846); dos de las cuatro cifras son la respuesta total, no marco.
- F2 matizado: con los datos del local había 0 primarios; en una campaña sin planes hay 5 (y en producción, hasta 10).
- F8 matizado: de la pantalla solo es el selector de 30,5 px; «Poner un tope» (24 px) e «Ir a Conteo» (29 px) cumplen el mínimo y son de sus piezas.
- F10 matizado: «flojo / normal / bueno» e «Inversión al costo» son lenguaje de quien compra; la jerga real es «en la red», «escenarios» y el cuantil.
- F11 confirmado pero global (Buscador): no baja la nota de esta pantalla.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «Pantalla de planificación de compras de diciembre por categoría, con tres escenarios; sigue buscar abrigos y armar su plan; «Exportar» saca la lista» — coincide |
| Primer intento | Sí, sin retroceder (el buscador no filtró la primera vez: clic en la lupa, defecto global) |
| Pasos | 19 acciones + un scroll (mínimo razonable ~16) |
| Dudas | «Armar plan» (¿guarda o abre?), «Diciembre flojo / normal / bueno» (¿tres cajas o elegir una?), «Lo que sobra · Lo vendes al % de tu precio» (no supo qué poner: puso 60), «Curva de tallas · Suma 100 %» (¿la toco?), «Exportar» (¿es la lista del proveedor?) |
| Palabras no entendidas | «Hay hoy», «Curva de tallas», «Lo que sobra», «Por llenar primero» |
| Errores evitables | El buscador no filtró al primer intento (global) |

## Antes de decir «listo»
- **Concurrencia:** dos personas guardando la misma categoría: la última pisa a la otra sin aviso (chaos NAV-05, gravedad 2). Se arregla con el candado
  de versión de ADR-0193 (migración B4; producción espera el OK puntual de Felipe).
- **Caída externa:** sin internet, la hoja avisa y conserva lo escrito (chaos RS-01); si la respuesta se pierde, decía «No se guardó nada» aunque se
  guardó (chaos RS-03): se corrige con el aviso honesto del sistema.
- **Persona sin contexto:** el ciego completó la tarea; real: sin probar.


## Después de los 3 cambios (2026-10-10, en local; medido en el navegador)
Recalificada **sin una prueba ciega nueva** (pendiente): las notas que cambian se apoyan en lo medido y en lo observado en el navegador.

| Eje | Antes | Después | Evidencia |
|---|---|---|---|
| 1 Sin manual | 5 | 6 (provisional) | [Medido] las dudas del ciego tienen respuesta en su lugar: una pregunta agrupa los tres diciembres, «Lo que sobre» dice lo que produce, «Por llenar primero» pasó a «Las que más venden, sin plan». Falta la ciega sobre la pantalla nueva |
| 2 Una pregunta, una respuesta | 5 | 7 | [Medido] una sola acción primaria («Empezar por Vestidos» / «Seguir con …») cuando hay algo por empezar, y 0 cuando todo está hecho; las filas ya no tienen botones negros |
| 3 Simplicidad profunda | 5 | 7 | [Medido] ningún texto dice «de cada 100»; el porqué y «Lo que sobre» hablan en veredictos (pruebas de `lecturaDelCuantil`) |
| 4 Lenguaje de tienda | 6 | 7 | [Medido] sin «en la red» ni «escenarios» en la cabecera; la nota de abajo todavía dice «escenarios» |
| 5 Contenido primero | 4 | 6 | [Medido] la respuesta de la hoja va en el pie fijo, siempre a la vista; la lista entra a 1440 × 900 (y = 812) pero a 1024 × 768 sigue bajo el pliegue (y = 923; el aviso de stock mide 153 px) |
| 6 Lo difícil, a un toque | 6 | 6 | sin cambio: la nota del cálculo y la de la curva siguen a la vista |
| 7 Perdonar antes que preguntar | 4 | 8 | [Observado] Escape, la ✕, el velo, «Cancelar», un enlace y «Atrás» preguntan «¿Salir sin guardar?» con la hoja a la vista; en el paso a paso, también al saltar, cambiar de categoría o volver a la tabla |
| 8 Quitar antes de agregar | 6 | 6 | [Medido] el subtítulo bajó a una frase; la curva sigue abierta |
| 9 De punta a punta | 5 | 8 | [Medido] campaña inexistente → la más reciente con su aviso; número absurdo → la guía lo frena; respuesta perdida → aviso honesto; 375 px sin scroll horizontal; sin campañas, el líder ve «Nueva campaña» |
| **Leyes (promedio)** | **5,1** | **6,8 (provisional)** | ninguna ley bajo 6 |
| **Oficio visual** | **7** | **9** | [Medido] las tres cajas de diciembre a la misma altura (415,6 px) antes y después de que la luz pase al siguiente campo; precio y costo alineados; el selector de campaña mide 40 px como «Exportar». Sigue fallando la jerarquía (más de 4 tamaños de texto, varios del marco) |

**Cambios cerrados:** 1 (la hoja dice la respuesta y no pierde lo escrito), 2 (las preguntas en palabras de tienda) y 3 (una sola acción principal,
subtítulo corto, píldoras que caben, selector a la altura). De la lista aparte quedan la curva plegada, la lupa del buscador (global), el contraste del
segmento «modo» (global) y la señal de «corregir» en una fila con plan. Nueva para la lista aparte: compactar el aviso de stock a 1024 px (la maqueta lleva
una píldora por tienda; sin ellas la lista subiría unos 60 px) y la marca de la guía, que mide 3,5 px menos en «Sigue aquí» en todas las hojas guiadas.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `b274c507` | 5,1 | 7 | — (primera medición) |
| 2026-10-10 | rama `claude/elegant-bose-201880` (sin publicar) | 6,8 (provisional) | 9 | los 3 |

## 2026-10-13 · campaña empezada sin plan (rama `claude/campaign-plan-screen-optimization-1b5890`, sin publicar)
Disparó la corrida una captura de producción: el Aniversario 2026 iba en el día 13 de 21 con 0 de 45 categorías planificadas. Dos
pruebas ciegas iguales (1 agente Sonnet cada una, base local, Aniversario día 13 de 14 con 0 planes). La tarea: «la campaña del
Aniversario ya está corriendo: mira cómo vamos con las compras y dime qué te toca hacer hoy».

| Medida | Antes (main `488f473b`) | Después |
|---|---|---|
| Lectura de 5 s | «el plan de cuánto comprar de cada categoría; sigue ver cuánto toca comprar» | «la campaña empezó sin plan; lo que sigue es presionar "Ver cómo va"» |
| Respuesta a la líder | contar el stock, fijar el % de lo que sobra y **armar el plan de las 5 que más venden** (a 2 días del cierre); al final dudó si valía la pena | contar el stock, **no planificar el Aniversario** («el propio sistema dice que lo útil es reponer o impulsar») y **planificar Halloween 2026**, que empieza en 4 días |
| Aviso de stock | lo encontró solo al tocar el «2» de un ícono sin texto | lo leyó en la línea sobre la tabla; «Ver qué falta» abrió el cajón |
| Pasos | 8 | 10 (2 perdidos: Historial y un segundo «Ver qué falta») |

**Lo que sigue trabando (después):**
- «Ver qué falta» abre el cajón general: esperaba solo la lista de lo que falta.
- «Compras de la campaña» no está en la pantalla principal: lo pedido en órdenes vive en el cajón.
- Resultados habla de «Tienda Trujillo, hasta ayer» y el Plan de «toda CAYLA, día 13»: dudó de qué tienda y qué período miraba.
- Volver de Historial a Plan pierde el `?plan=` en la URL. Es anterior a esta rama.

**Medido:** a 1440 × 900 la primera fila queda en y = 711, bajo el aviso, que mide 109 px. A 1024 × 768 queda en y = 795, o sea bajo
el pliegue, pero el aviso, que es la respuesta, queda arriba. A 375 px no hay scroll horizontal. En modo oscuro hay 0 hallazgos
(`tema:auditar`). `guias:recorrer` pasa los 24 pasos. Sin nota nueva: la recalificación de las 9 leyes queda para la próxima
`/formidable` completa. Real: sin probar.

## 2026-10-24 · el descuento de la campaña y la fecha límite para pedir (ADR-0499, rama `claude/campaign-plan-improvements-18875c`, sin publicar)

- **Qué se miró:** la franja de la fecha límite, la hoja «Días para llegar» y el campo «Descuento en la campaña» de la hoja de una categoría.
  **Escala de esta corrida:** medición del DOM a 1440 y 375 px (yo) · **una** prueba ciega (1 agente Sonnet, navegador local, sin repositorio) ·
  **un** escéptico (1 agente Sonnet, solo código). La revisión de las 9 leyes la hice yo. Base local restaurada después (`/chaos`, mismo día).
- **Veredicto en una línea:** «Se entiende en 5 s y se completa al primer intento, pero la hoja del plazo no dice la fecha que resulta cuando la campaña ya empezó, y la
  franja repite los días.»

### Notas (0–10; solo donde hay evidencia)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 (tope) | [Observado] ciega: a los 5 s dijo «la pantalla del plan de la campaña de Halloween; la caja "Si pides hoy, llega el 07/11" es la respuesta y lo siguiente es "Cambiar los días"»; completó al primer intento con 4 acciones y 0 retrocesos · real: sin probar |
| 3 Simplicidad profunda | 7 | [Medido] la franja traduce el plazo a un veredicto (a tiempo / justo / tarde / ya empezó). [Observado] la ciega tuvo que calcular ella la fecha con 21 días: la hoja no la dice |
| 4 Lenguaje de tienda | 8 | [Observado] dudas: «Sigue aquí» (pieza del sistema), «Quitar el plazo» («¿borra qué?») y «Cambiar los días» («¿los de la campaña o los del proveedor?», lo resolvió por el texto de al lado) |
| 7 Perdonar antes que preguntar | 8 | [Observado] la hoja de la categoría pregunta «¿Salir sin guardar?»; la del plazo cierra con Escape (un solo número) y «Quitar el plazo» se deshace fijando otro |
| 8 Quitar antes de agregar | 6 | [Medido, CONFIRMADO por el escéptico] la franja dice los mismos días dos veces: «…tarda 14 días…» y «Cuenta con 14 días…» (`plan-compra-plazo.ts:73` y `:124`, juntos en `PlanCampana.tsx:399`); pasa también en «a tiempo» y «justo» |
| 9 De punta a punta | 7 | [Observado] errores honestos (corte de red y respuesta perdida, mensaje claro y reintento idempotente). [Medido] el pie ya cabe a 375 px. [CONFIRMADO] «Plazo de 1 días guardado»; «Quitar el plazo» con 14 fijado no cambia el número y no lo dice |
| 2, 5, 6 | sin calificar | sin evidencia en esta corrida |
| **Leyes (promedio de las 6 con evidencia)** | **7,3** | ninguna ley en 3; la más baja es la 8 (6) |
| **Oficio visual** | **9** | [Medido] hoja del plazo: 2 de 8 marcan, las dos son del sistema o falsos (la marca «Sigue aquí» a 10,5 px; una etiqueta solo para lector a 1 px de otro borde). Bloque del descuento: 0 de 8. La hoja entera de la categoría marca 5 de 8, todo heredado de antes y ya listado arriba |

### Los 3 cambios de mayor impacto (esperan el OK de Felipe; ninguno cambia un cálculo ni una regla de dinero)
1. **La hoja del plazo dice la fecha que resulta, y la franja dice los días una sola vez.** Antes: con la campaña empezada la hoja dice «Un pedido de hoy tarda 21 días…» y nada más, y
   la franja repite el número. Después: la hoja muestra «Si pides hoy, llega el 14/11» mientras se escribe, y la franja junta las dos frases en una. Arregla las leyes 3 y 8 (y hace
   verdad el texto del paso «Cuántos días tarda en llegar» de la guía, que hoy promete una fecha límite que en «ya empezó» no existe). Se verifica escribiendo 21 en la hoja y leyendo la fecha; `lib/plan-compra-plazo.test.ts` con el caso. Esfuerzo S.
2. **El margen y el aviso «no deja ganancia» salen apenas hay precio, costo y descuento.** Antes: la frase debajo del descuento depende de `lineaViva` (`FormularioCategoria.tsx:181,190`),
   que es null mientras falte un escenario, lo que sobra o la curva de tallas; con escribir un descuento antes de llenar los escenarios no se ve nada, y en una categoría nueva sin «lo que sobra» de
   fábrica puede faltar incluso con los escenarios llenos. Después: se calcula con precio, costo y descuento solamente (`fraseDelMargen` ya los pide solo a ellos). Arregla las leyes 3 y 9.
   Se verifica con una categoría sin escenarios y un descuento de 60 % sobre un costo alto. **Toca dinero solo en lo que muestra: no cambia ningún cálculo ni guardado; igual necesita tu OK.** Esfuerzo S.
3. **«Quitar el plazo» dice qué pasa, y «1 día» se escribe bien.** Antes: el botón rojo no dice a qué vuelve ni que con 14 fijado no cambia nada, y el aviso dice «Plazo de 1 días guardado».
   Después: una línea bajo el campo («Si lo quitas, se cuenta con el supuesto de 14 días») y el plural arreglado con el mismo ayudante que ya usa `plan-compra-plazo.ts`. Arregla las leyes 4 y 9. Esfuerzo S.

### Lo que sobra (ley 8)
La segunda frase de la franja (`fraseDeLosDias`) cuando repite el número del detalle: se propone dejar solo quién lo fijó y cuándo.

### Lo que no pediste y importa más
Las hojas hermanas «Poner el tope» y «Lo que sobra» arman su botón rojo con `mr-auto` y, a 375 px, no quedan en su propia fila como dice `pie-acciones.css` (la regla de mitades le gana en especificidad):
quedan los tres botones en una fila de ~98 px y «Guardar el tope» se angosta. No se cortan, pero no es lo documentado. **Medido** en una réplica; la salida es `<PieAcciones izquierda>`, como la hoja del plazo.

### Lista aparte (no se ejecuta)
- «Cambiar los días» puede leerse como los de la campaña; la hoja que abre se titula «Días para llegar» (matizado por el escéptico: es opinión, el código no lo prueba).
- Marca «Sigue aquí» a 10,5 px en todas las hojas guiadas (ya estaba en la lista aparte del 2026-10-10).

### Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | coincide con la finalidad: el plan de la campaña de Halloween; la caja de arriba contesta «qué día llegaría» |
| Primer intento | sí, sin retroceder |
| Pasos | 4 acciones (1 clic, 2 teclas, 1 «Cancelar» para salir sin guardar) |
| Dudas | «Si pides hoy, llega el 07/11» (¿responde mi pregunta?); «Cambiar los días» (¿cuáles?); «Quitar el plazo» (¿borra qué?); «Guardar plazo» (¿ya está guardado?); «solo avisa, nunca te impide guardar un plan» |
| Palabras no entendidas | «Sigue aquí»; «Quitar el plazo»; «Eres admin. No necesitas autorización» |
| Errores evitables | 0 |

### Refutados o matizados por el escéptico
H1, H2, H3 y H4: confirmados (H3 con matiz: también la oculta un «lo que sobra» vacío o una curva que no suma 100). H5: matizado (opinión, no un defecto demostrable en el código).
Tres hallazgos que no estaban: la guía promete una fecha límite que no existe en «ya empezó» (mismo hueco que el cambio 1); «Plazo de 1 días guardado»; «Quitar el plazo» sin efecto cuando ya vale 14.

### Antes de decir «listo»
- Concurrencia: dos líderes fijando el plazo a la vez en tres rondas (`/chaos`): gana el último y queda firmado él mismo.
- Caída externa: red cortada y respuesta perdida dan un mensaje honesto y un reintento que no cambia nada.
- Persona sin contexto: la ciega lo completó; **real: sin probar**.

### Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-24 | rama `claude/campaign-plan-improvements-18875c` (sin publicar) | 7,3 (6 de 9 leyes con evidencia) | 9 | — (el pie de la hoja del plazo ya está arreglado; los 3 cambios esperan el OK) |
