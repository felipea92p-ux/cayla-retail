# Formidable · Tienda web ▸ Resumen y Vitrina ▸ Modelos   (`/tienda-web` y `/tienda-web/vitrina`)

- **Fecha / SHA:** 2026-10-26 · `8415f0354` (rama `claude/tienda-vitrina-resumenes-e27bbd`, después de la Ola 1 de ADR-0430) · **Dispositivo que manda:** escritorio (Mac mini); 375 px pesa menos (no es Vender, Cambios ni Devoluciones)
- **Preguntas que deberían resolver:** Resumen, «¿qué me pide hoy la tienda online?» (protagonista: el pedido que espera) · Vitrina ▸ Modelos, «¿qué modelos ve el cliente en la web?» (protagonista: la prenda con su foto)
- **Veredicto en una línea:** «Las dos se entienden a los 5 segundos y la Vitrina se termina sin manual (la ciega ocultó aretes y carteras en 11 clics, 0 retrocesos). Lo que más pesa no es el diseño sino honestidad: el Resumen dice "Todo al día" aunque no haya podido leer los pedidos, y la Vitrina esconde con letra chica o sin rótulo lo que más necesita (el stock por tienda, el porqué de cada chip) y deja objetivos de toque bajo 24 px.»
- **Estado (2026-10-26, más tarde):** los 3 cambios del Resumen están hechos con el OK de Felipe y vistos en el navegador; los 3 de la Vitrina también (2026-10-26, con la condición de Felipe en el 3: sin hoja solo con `responsable.listo` y con «Deshacer»; medidos en el navegador a 1440 y 375 px y recorrida la guía sin escribir en la base). Falta repetir la ciega del Resumen. A pedido de Felipe, «Tiendas en la web» vuelve siempre junto a la ventana, que recupera su ancho.
- **Cómo se corrió:** medido en el navegador (1440, 1024 y 375 px, con 2 pedidos y 2 recomendaciones inventados que ya se retiraron) · 2 ciegas (Sonnet, sin acceso al repo) · revisor de las 9 leyes sobre código y capturas · escéptico que intentó refutar 11 hallazgos contra el código. **Real sin probar** (ninguna colaboradora de verdad).

## Notas (0–10)

### Resumen (`/tienda-web`)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s acertó («resumen de la tienda online… 2 pedidos por confirmar, 2 recomendaciones»); 2 toques hasta el pedido. Dudó qué hace «Confirmar» (¿acepta, cobra, avisa?) y si «Por confirmar / Por cobrar / Por entregar» son estados o pasos suyos |
| 2 Una pregunta, una respuesta | 7 | [Observado] dos filas pendientes con el mismo peso (dos «→» iguales) y cuatro tarjetas más que también llevan a Pedidos; no hay una sola acción principal |
| 3 Simplicidad profunda | 8 | [Observado] «El primero se cierra solo en 1 h si nadie lo confirma» es un veredicto, no una cifra |
| 4 Lenguaje de tienda | 7 | [Observado] «se cierra solo / se pierde» y «Cerrados» sin entender; [Código] «plata de clientes» (`tienda-web-resumen.ts:101`) es coloquial. «Recomendaciones» es el nombre del módulo y el detalle lo explica: refutado |
| 5 Contenido primero | 7 | [Observado] la vitrina como la ve el cliente es lo más grande de su zona, debajo de dos bloques de texto; está bien: la pregunta es «qué me pide hoy» |
| 6 Lo difícil, a un toque | 7 | [Opinión] los plazos (24 h, 48 h, 7 días) están siempre a la vista a 11 px |
| 7 Perdonar antes que preguntar | 9 | [Código] la pantalla solo lee; toda acción es navegar |
| 8 Quitar antes de agregar | 6 | [Código, confirmado por el escéptico] el plazo de confirmación sale en la fila y otra vez en el pie de «Por confirmar» (`tienda-web-resumen.ts:86-87`, `pedidos-web-reglas.ts:732`); las estaciones en cero siguen pintadas mientras otra pide acción |
| 9 De punta a punta | 6 | [Código, **verificado por mí**] «Todo al día» se dibuja con `pendientes.length === 0` sin mirar si los pedidos se pudieron leer (`ResumenTiendaWeb.tsx:79-83`; `pendientesDe` salta los pedidos en `no_tienda`, `sin_modulo` y `fallo`). Cuidados: lectura caída, sin módulo, vitrina vacía |
| **Leyes (promedio)** | **7,1** | ley 8: 6 · ley 9: 6 (la nota bajó de 8 a 6 por el hallazgo del escéptico) |
| **Oficio visual** | **6** (provisional) | [Medido] fallan 6, 5 y 4 de 8 comprobaciones a 1440, 1024 y 375 px. Lo propio: «Abrir la tienda» de 128×14 px y 4,47:1 (pieza `EnlaceVer` del sistema), 1 px de desalineación entre dos enlaces, 10 textos bajo 12 px (11 px de etiquetas y de los verbos del camino, 10,5 px de una insignia), 6 radios distintos, 4 elementos rojos a 1440. Sin desborde horizontal en ningún ancho. Falta revisar a mano jerarquía y orden de Tab |

### Vitrina ▸ Modelos (`/tienda-web/vitrina`)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciega: a los 5 s «lista de prendas que se muestran en la tienda, con casilla e interruptor y un botón que las oculta»; terminó sin ayuda. Dudó con «Probador», «Looks», «Esperan una talla / Avísame» (otras tareas metidas aquí) |
| 2 Una pregunta, una respuesta | 7 | [Código] arriba compiten tres cifras, tres pestañas, buscador, Filtros, Vista y «Elegir los N»; sin botón primario en reposo (correcto) |
| 3 Simplicidad profunda | 8 | [Observado] las cifras y los chips traducen reglas («Sin precio: no se ve»); falta el rótulo del stock |
| 4 Lenguaje de tienda | 7 | [Código, confirmado] «Lima 24 · Trujillo 18» sin rótulo visible (solo `aria-label` en un `<span>`, `VitrinaPantalla.tsx:698-704`; la Lista sí dice «Libre en tiendas»). [Observado] «Quitar los 1» y «Elegir los 1» (concordancia); «Accesorios de moda» no dice si trae aretes |
| 5 Contenido primero | 9 | [Observado] la foto o el ícono sobre el color de la prenda pesa más que todo lo demás |
| 6 Lo difícil, a un toque | 5 | [Código, matizado] la regla del precio sale en el subtítulo y en una nota de 3 frases, siempre abiertas; la nota añade lo de «Todas», las campañas y dónde se edita. Los chips ámbar no tienen un «¿Por qué?» a un toque |
| 7 Perdonar antes que preguntar | 6 | [Código, matizado] cada interruptor abre una hoja con «Responsable», «Eres admin…» y «Todo listo.», aunque ocultar es reversible. La hoja sí hace algo que se perdería: el aviso de tienda casi vacía (`avisoDeLote`). La firma viene de ADR-0161/0162 |
| 8 Quitar antes de agregar | 6 | [Código, confirmado] `FilaModelo` y `FilaColumnas` repiten el `onClick` y los chips (`VitrinaPantalla.tsx:492, 582, 658`); «Mostrando 1–N de N» aparece con una sola página (`:328-336`) |
| 9 De punta a punta | 6 | [Medido] casilla 20×20, nombre 173×17 e interruptor 38×22 bajo 24 px; el escéptico lo matiza: en la carta la casilla suma ~26 px con su relleno y la foto abre lo mismo con el mouse, así que lo que queda bajo 24 px es el foco por teclado y el interruptor. A 375 px, Filtros 36×36 y Vista 40×40 bajo los 44 px del dedo |
| **Leyes (promedio)** | **6,9** | ley 6: 5 · leyes 7, 8 y 9: 6 |
| **Oficio visual** | **5** (provisional) | [Medido] fallan 6, 6 y 6 de 8 a 1440, 1024 y 375 px: objetivos de toque (arriba), 27 textos de 8 px (el rótulo de categoría en las prendas sin foto; el escéptico: es la CATEGORÍA, no repite el nombre, y ADR-0333 pide el nombre en las tarjetas), 6–7 radios, 56 elementos con sombra, 1–2 filas de alturas desiguales. El «1,06:1» de la pestaña «Modelos» es un falso positivo (texto blanco sobre píldora negra). Sin desborde horizontal |

### Prueba ciega de la Vitrina (Sonnet, navegador sin repo, datos inventados)
Tarea: dejar listos para ocultar los aretes y las carteras y contar los modelos de aretes. **11 clics, 2 Escape, 1 escritura; 0 retrocesos; terminó** con la hoja «Ocultar de la web» abierta y 4 modelos (Aretes Luna, Bolso Tote Sol, Cartera Mía, Cartera Noa), sin confirmar, y respondió bien (1 modelo de aretes). Dudas: «Accesorios de moda» y «Bolsos y Carteras», si lo elegido sobrevive al cambiar de filtro (sí sobrevive), la píldora «Aretes ×» (¿se abre o se quita?), «Quitar los 1». Tres pasos de comprobación extra. Aciertos que nombró: el buscador filtra sin Enter y la selección sobrevive al filtro.

## Los 3 cambios de mayor impacto

### Resumen
1. **«Todo al día» solo cuando se pudo leer todo.** Antes: el bloque dice «Todo al día / Nada de la tienda online espera por ti ahora» con `pendientes.length === 0`, aunque los pedidos estén en `fallo`, `no_tienda` o `sin_modulo`. Después: «Todo al día» solo con `pedidos.estado === "ok"`; en los otros casos, «Sin novedades en lo que se pudo leer», sin afirmar calma. Leyes 9 y 1; principio 9 del repo. Verifica: prueba pura (los cuatro estados) y captura con la lectura caída. Esfuerzo: bajo, solo texto y una condición.
2. **El plazo vive en un solo lugar.** Antes: «se cierra solo en 1 h» en la fila y de nuevo en el pie de «Por confirmar»; las estaciones en cero a todo color. Después: la fila solo dice qué hacer («Confirma o se cierra solo»); el plazo vive únicamente en el camino; las estaciones en cero se atenúan. Leyes 8 y 3. Verifica: captura con datos de ejemplo, ninguna frase dos veces. Esfuerzo: bajo.
3. **«Confirmar» dice lo que hace.** Antes: el botón «Confirmar» abre el pedido y la colaboradora dudó si acepta, cobra o avisa; las flechas del camino parecen botones. Después: «Revisar y confirmar» (o el verbo exacto que ya usa la hoja) y las estaciones del camino con su flecha apagada si no navegan. Leyes 1 y 4. Verifica: repetir la ciega. Esfuerzo: bajo; revisar el texto de la guía (`lib/guias/pantallas/tienda-web.ts`) y su huella.

### Vitrina ▸ Modelos
1. **Rotular el stock y agrandar lo que se toca.** Antes: «Lima 24 · Trujillo 18» sin rótulo, interruptor de 38×22, foco por teclado de la casilla de 20 px, rótulo de 8 px. Después: «Libre: Lima 24 · Trujillo 18» a ≥12 px, área de toque de casilla e interruptor de ≥24 px (con relleno, sin agrandar el dibujo; 44 px con el dedo) y el rótulo de categoría de la prenda sin foto más grande (no se quita: ADR-0333). Leyes 4 y 9. Verifica: medir en el navegador a 1440 (≥24) y 375 px (≥44 en Filtros y Vista). Esfuerzo: medio.
2. **La regla del precio, a un toque.** Antes: subtítulo de dos oraciones y nota de 3 frases siempre abiertos. Después: subtítulo de una sola promesa («Elige qué modelos ve el cliente en la tienda online.») y la regla tras «¿Qué precio ve el cliente?»; los chips ámbar llevan un «¿Por qué?» con la `frase` que ya existe en `razonNoSeMuestra`. Leyes 6 y 8. Verifica: captura sin la nota al pie; el toque la muestra. Esfuerzo: medio; `vitrina.nota` es ancla de guía (`lib/guias/pantallas/tienda-web.ts:490`): tocar la guía y su huella.
3. **El interruptor de una carta sin hoja cuando ya sabemos quién firma.** Antes: cada interruptor abre la hoja con «Responsable», «Eres admin…» y «Todo listo.». Después: si el responsable ya está resuelto (`responsable.listo`: admin o la persona de la sesión), el interruptor aplica de inmediato y ofrece «Deshacer»; si no, abre la hoja como hoy; los lotes siguen con hoja y con su aviso de tienda vacía. Ley 7. **Toca la firma del responsable (ADR-0161, regla 3) y qué ve el cliente: es de Felipe.** Verifica: `vitrina_mostrar` sigue firmando con `fn_actor_persona_id(true)`, recorrido del «Deshacer». Esfuerzo: medio-alto.

## Lo que sobra (ley 8)
- La segunda mención del plazo (fila y tarjeta) en el Resumen.
- Las estaciones en cero mientras otra pide acción.
- «Mostrando 1–N de N» cuando hay una sola página.
- El rótulo de 8 px tal como está (se queda, más grande).
- Una de las tres variantes de fila de la Vitrina (`FilaModelo`/`FilaColumnas` comparten lógica que debería vivir una sola vez).

## Lo que no pediste y importa más
El Resumen puede afirmar calma sin haber leído nada. Con la lectura de pedidos caída o con una cuenta Admin parada fuera de una tienda, el bloque dice «Todo al día» y puede haber pedidos por confirmar que se cierran solos (una venta perdida). El aviso de arriba dice «incompleto» y el de abajo «Todo al día». Es el cambio 1 del Resumen. Lo vio el escéptico y lo verifiqué en `ResumenTiendaWeb.tsx:79-83`.

## Lista aparte (no se ejecuta)
- Comentario desactualizado: `VitrinaPantalla.tsx:131` dice 30 por página y `MODELOS_POR_PAGINA` vale 40.
- Concordancia: «Elegir los 1», «Quitar los 1» y la píldora «Aretes ×» (¿se abre o se quita?).
- «Accesorios de moda (2)»: el filtro de categoría no dice qué trae.
- «plata de clientes» (`tienda-web-resumen.ts:101`) → «dinero de clientes».
- «Abrir la tienda» mide 14 px y 4,47:1: es la pieza `EnlaceVer` del sistema, no un fallo local; subirla es decisión de Felipe (`/unificar`). No es redundante con la barra de URL de la ventana: esa es de adorno (`aria-hidden`) y «Abrir la tienda» es el único camino a la tienda.
- La Vitrina carga «Probador», «Looks» y «Esperan una talla», que son otras tareas; la ciega no supo qué eran.
- Repetir `/chaos` y esta corrida tras poner la rama al día con `main` (183 commits atrás).

## Veredicto del escéptico
Un agente con el repo (solo lectura) intentó refutar 11 hallazgos de la revisión de leyes:
- **Confirmados (4):** el plazo duplicado (R2); el stock por tienda sin rótulo visible (V2); «Mostrando 1–N de N» con una sola página (V6); las tres variantes de fila que repiten lógica (V7).
- **Matizados (6):** el Resumen sin tope de filas (el orden por tono ya deja lo informativo al final, así que no se mezcla); «plata de clientes» sí, «separar» y «recomendaciones» no; la regla del precio repetida (la nota añade información y es ancla de guía); la hoja del interruptor (quitarla choca con ADR-0161 salvo que firme solo con `responsable.listo`, y perdería el aviso de tienda vacía); los objetivos bajo 24 px (la casilla suma ~26 px con su relleno y la foto abre lo mismo); el rótulo de 8 px (es la categoría, no el nombre).
- **Refutado (1):** la redundancia de «Abrir la tienda» con la barra de URL (el tamaño y el contraste sí se confirman).
- **Se nos escapó (1, el peor):** «Todo al día» sin haber leído los pedidos (arriba).
