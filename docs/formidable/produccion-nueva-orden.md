# Formidable · Producción ▸ Nueva orden, opción «Modelo nuevo»   (`/produccion/ordenes`, hoja «Nueva orden»)

- **Fecha / SHA:** 2026-10-10 · `4f90fdb2` · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta, no manda en Producción.
- **Pregunta que debería resolver (1 frase):** «¿Cómo le digo al taller que empiece a fabricar este modelo, que quizá todavía no existe?» · **Protagonista:** la prenda.
- **Veredicto en una línea:** «Se entiende qué es y qué botón apretar (la prueba ciega la completó a la primera), pero la carta de 89 colores, que es opcional, se interpone entre lo obligatorio y la prenda nunca aparece.» **La ley 5 está en 3.**
- **Escala (Felipe eligió «medio»):** mi propia medición en el DOM a 3 anchos (hace de ① medidor) + ② ciego + ③ revisor de leyes + ④ escéptico. El ciego con Sonnet cayó **dos veces** por el falso positivo del filtro de seguridad (`reasoning_extraction`, ya anotado en `prueba-ciega.md`); se cambió a **Opus** y se anota. El revisor y el escéptico leyeron el código; no usaron el navegador.
- **Ciega: pasa · real: sin probar.** El ciego entró con una sesión de **líder** (admin): no es una colaboradora del Taller sin permisos, así que la ley 1 no puede pasar de 8.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | **6** (provisional) | + [Observado] ciega: lectura de 5 s acertada, primer intento sí, sin ayuda. + [Medido] `/focus`: 14 controles con guía. − [Observado] 42 acciones, 6 palabras no entendidas, 10 dudas, 1 error evitable (la tabla pide cero en las tres). − [Observado] el aviso «Precio» de «Faltan:» no llevó al campo (ver cambio 1). Real: sin probar. |
| 2 Una pregunta, una respuesta | **5** | + [Medido] una sola acción primaria. − [Código] la hoja junta dos trabajos: definir el modelo (nombre, categoría, tallas, colores, precio) y ordenar la corrida (cantidades, Tela/Avíos/Maquila, fecha, nota). |
| 3 Simplicidad profunda | **5** | − [Observado] «Pierde» en rojo con un margen de 38 % **positivo** y sin leyenda: el ciego no lo entendió hasta abrir el panel de la orden (el revisor lo había contado como acierto; el escéptico lo corrigió). − [Código] sin datos muestra «S/ 0.00 / prenda». |
| 4 Lenguaje de tienda | **6** | + frases cortas y «tú». − [Observado] dudas con «corrida», «C/U», «Maquila», «Muestra» y «Pierde». − [Código] «Elegir la categoría» en infinitivo; «base de datos» en el aviso de función ausente; el recuadro azul tiene una frase de 15 palabras (la segunda tiene 12, no 14: corregido por el escéptico). |
| 5 Contenido primero | **3** | [Observado captura 1440] lo más pesado de la hoja es la carta de círculos, que es opcional. [Código] la prenda nunca aparece: el nombre es una línea más y el color elegido es un punto de 10 px en la matriz. Atenuante: un modelo nuevo no tiene foto. |
| 6 Lo difícil, a un toque | **4** | [Código `guia.tsx:52`, `NuevaOrdenProduccionForm.tsx:696`] el porqué de cada «Falta» vive solo en `title` (pasar el mouse); [Observado] pasar el mouse sobre «Pierde» no mostró nada. [Código `ElegirColores.tsx:49`] la carta, que es detalle, está abierta por defecto. |
| 7 Perdonar antes que preguntar | **5** | [Código] cambiar de categoría borra las cantidades y reinicia las tallas (`:252-256`); cambiar de modo o «Usar ese modelo» borran las cantidades (`:246-251`, `:265-270`), sin aviso ni deshacer. [Observado /chaos NAV-04] Escape, Cancelar y clic fuera pierden todo lo escrito, igual en las tres vías. + token único y botón apagado mientras guarda. |
| 8 Quitar antes de agregar | **4** | Carta abierta; recuadro azul que explica lo que NO se pide; tres campos de costo grandes y opcionales; «S/ 0.00 / prenda» sin prendas. |
| 9 De punta a punta | **5** | + sin modelos, vocabulario caído, función ausente y reintento tienen su camino. − [Código] callejones confirmados: sin modelos y sin vocabulario (`ModeloNuevoCampos.tsx:67-69`); «Ese modelo ya existe» **sin botón** cuando ese modelo no tiene variantes activas (`produccion.ts:183`, `NuevaOrdenProduccionForm.tsx:671-675`), no solo con una pestaña vieja. − [Medido] a 375 px el botón principal se recorta ~21 px (159 px de ancho, su texto mide 180). |
| **Leyes (promedio)** | **4,8** (43 / 9) | Una ley en 3 (la 5). La ley 1 es provisional. |
| **Oficio visual** | **5** (el crudo da 4) | [Medido] fallan 5 de 8 en 1440 y en 1024; 7 de 8 en 375. Ver abajo qué es de la pantalla. |

### Oficio: de quién es cada falla (con el escéptico)
| Comprobación (1440) | Medido | Veredicto | De quién |
|---|---|---|---|
| Blancos < 24 px · contraste · espaciado | 0 · 0 · 0 | pasan | — |
| Texto chico | 10 × 11 px | falla, **fuera del conteo** | **Sistema**: `label-cayla` de 11 px. Se reporta; el token no se cambia aquí (ADR). |
| Bordes casi alineados | 13 | **falso positivo** | El escéptico revisó los 12 pares impresos con la geometría del código: `sr-only`, glifos centrados, columnas de rejilla de otras filas. Dos reales por CSS (3 px entre la barra de resumen y el recuadro; 2 px entre separaciones `gap-2/3/4`) pero imperceptibles. |
| Filas con alturas desiguales | 2 | falla, **de la pantalla** | Pieza compartida `ElegirColores`: buscador ~39 px junto a botones ~35 px. |
| Radios distintos | 6 | **fuera del conteo** | Son los tokens del sistema (4/8/12/16/20, `globals.css:179-183`); la hoja no agrega ninguno. *(El revisor había calculado mal los píxeles: corregido.)* El defecto real es el **borde doble** (tres cajas anidadas con el mismo borde `sand`: panel `Modal.tsx:139`, recuadro `ModeloNuevoCampos.tsx:79`, carta `ElegirColores.tsx:187`; fila 13 de `oficio-visual.md`, por lectura de código). |
| Rojo visible | 6 (límite ≤ 2, `design-tokens.ts:73`) | falla, **de la pantalla** | 4 son de `Segmentado`; la matriz suma `border-rojo/60 bg-rojo/5` **por cada celda con cantidad** (`NuevaOrdenProduccionForm.tsx:472-474`): con las 6 celdas del ciego pasa de 10. Además esa celda usa `outline-none` y `focus:border-rojo`, así que el foco se confunde con «llena». |

**Nota de oficio:** 3 pasan / 2 fallan en la pantalla → 6; si se cuenta el borde doble (fila 13, por lectura) → **5**. No hay motivo para más de 6. 375 px se mide siempre pero pesa menos aquí.

## Veredicto del escéptico sobre cada hallazgo
**CONFIRMADOS:** carta abierta por defecto y sin prop `cartaAbierta` (`ElegirColores.tsx:49`) · el porqué del «Falta» solo en `title` · con «12,50» el pie dice «Falta: Precio» · cambiar categoría/modo borra cantidades sin aviso · Cancelar y el éxito desmontan de golpe, Escape anima (ADR-0136) · rojo por celda con cantidad · bordes dobles · el éxito no dice nada del estado «pendiente» · «Ese modelo ya existe» sin botón · callejón sin modelos y sin vocabulario · el pie «Con este precio sale el margen de la orden.» lo leen todos pero el margen solo lo ve el líder (`verMargen = decision !== null`) · errores en el aviso de esquina, no sobre los botones · foco tenue de `Segmentado` (sistema).
**MATIZADOS:** «cambiar de modo borra todo» → solo borra las cantidades (nombre, categoría, tallas, colores y precio quedan) · «Créalo en Productos solo líder» → es `puedeEditarCatalogo` (líder o rol con Productos) · «Ya existe no dice qué existe» → el pie dice «Uno que ya está en el catálogo.» (el ciego igual dudó) · «lo opcional está rotulado» → Colores, Fecha y Nota sí; Tela, Avíos y Maquila no (el ciego dudó con «Maquila») · «el botón no resume lo que se crea» → la barra muestra prendas y costo, no cuántas variantes · el clic en «Precio» **sí enfoca el campo** por código (`useGuiaAlta.ts:67-80`, `scrollIntoView({block:"nearest"})`), pero entre las tallas y el precio está toda la carta y el pie pegado (`.pie-hoja-fijo`) no se descuenta del desplazamiento: la parte visual **no se verificó** (hipótesis: queda tapado por el pie o la captura salió a mitad del desplazamiento suave); el mismo mecanismo explica el salto al elegir «Shorts».
**REFUTADOS:** radios «6 distintos» como defecto de la pantalla (son tokens del sistema; los píxeles del revisor estaban mal) · «dos frases de 15 y 14 palabras» (es 15 y 12) · **«el modelo queda pendiente de que un líder lo apruebe»** como texto del éxito (ver «Lo que no pediste»: nadie lo aprueba desde el 2026-10-02).
**NO REPRODUCIDO:** «ÓRDENES EN CURSO siguió en 2 y las prendas planeadas pasaron de 22 a 24». La pantalla muestra **2 órdenes y 24 prendas** (12 + 12), igual que la base; las cifras salen del mismo predicado en el mismo render. Lo más probable es una lectura temprana (el contador anima 800 ms) o un error de lectura del agente. Sin defecto.
**NO VERIFICABLE sin navegador (el escéptico no lo usó):** los problemas de la lista de categorías que contó el ciego («el primer clic no abrió», «escribir cerró la lista»; pieza compartida `Desplegable`) · el recorte a 375 px por aritmética de flex (lo **medí yo**: `scrollWidth 180 > clientWidth 159`, [Medido]).

## Los 3 cambios de mayor impacto
*(El tercero se corrigió después del escéptico; el borrador que sobrevive a Escape pasa a la lista aparte.)*
1. **Lo obligatorio primero; el color después y cerrado.**
   **Antes →** Nombre → Categoría → Tallas → Colores (opcional, con la carta de 89 abierta) → Precio → Cuántas. **Después →** Nombre → Categoría → Tallas → **Precio** → Colores (los elegidos a la vista, buscador y «Ver los 89 colores» con la carta **cerrada**) → Cuántas; en la matriz el color pasa de un punto de 10 px a uno de 20 px (`Punto grande` ya existe, `ElegirColores.tsx:269`). `ElegirColores` recibe `cartaAbierta` con valor por defecto `true`, para que Nuevo producto no cambie (ADR-0312/0314 la dejaron abierta a propósito).
   **Leyes:** 1, 2, 5, 6, 8; cura además el clic en «Precio» y el salto al elegir «Shorts». **Verificación:** a 1440 × 900, con la categoría elegida, medir antes y después la distancia entre «Nombre del modelo» y «Cuántas por talla y color», y repetir la prueba ciega (0 preguntas por «¿tengo que elegir un color?»). **Esfuerzo:** S. **Quién decide:** Felipe (presentación; la carta abierta fue decisión suya). No toca dinero, stock, permisos ni SUNAT.
2. **Que cada «Falta» diga qué hacer, a la vista, y que un costo mal escrito se diga.**
   **Antes →** el pie muestra «Falta: Precio» y la frase vive en `title`; con «12,50» el precio es `NaN` y el pie dice «Falta: Precio» aunque está escrito; los costos con coma, «S/» o «soles» se guardan como 0 sin avisar (/chaos #3). **Después →** el pie imprime la frase del campo que sigue («El precio va con punto, por ejemplo 12.50»), distingue «vacío» de «mal escrito» (los dos textos ya existen, `modelo-nuevo-reglas.ts:171-172`) y los tres costos dicen «Escribe solo números». Hay que elegir entre la pieza `Campo tono="error"` (pinta rojo) y el pie de la guía (la guía promete no usar rojo, `alta-guia.css:7`).
   **Leyes:** 1, 3, 4, 6, 9. **Verificación:** escribir «12,50» en Precio y en Tela y ver la frase sin pasar el mouse; ampliar `modelo-nuevo-reglas.test.ts` (ya compara guía y validación con 3.000 borradores). **Esfuerzo:** S–M. **Quién decide:** Felipe para la presentación. **Aceptar la coma como decimal toca cómo se leen precios y costos (dinero): OK obligatorio de Felipe**; el precedente del módulo está en `recibir-produccion-reglas.ts:78`.
3. **Que ningún texto engañe ni se corte: «Pierde» y el botón a 375 px.**
   **Antes →** el chip dice **«Pierde»** en rojo con un margen de **38 %** positivo (en realidad significa «el margen no alcanza para costura, taller y utilidad», `produccion-reglas.ts:29-45`), sin leyenda en esta hoja; y el botón «Crear modelo y abrir orden» queda recortado ~21 px a 375 px. **Después →** una palabra que no se lea como pérdida («Margen bajo») con su leyenda al tocar, y un botón más corto («Crear y abrir orden»). **Leyes:** 3, 4, 6, 9. **Verificación:** mostrar el chip con 38 % y que el ciego no dude; `scrollWidth ≤ clientWidth` a 375 px. **Esfuerzo:** S. **Quién decide:** Felipe. La **palabra** es presentación; los **umbrales** 0,6 / 0,4 son una regla de precios y no se tocan. El nombre «Pierde» vive también en `OrdenTarjeta.tsx:20-21` y `OrdenPanel.tsx:354`: cambiar la palabra abarca más que esta hoja.

## Lo que sobra (ley 8)
El recuadro azul («Se crea en el catálogo… Marca, proveedor, tejido, patrón y fotos los completa quien edita el catálogo.») repite la bajada del selector y explica lo que **no** se pide; el enlace «¿Prefieres cargarlo completo, con fotos?» compite con el botón principal. Se propone esconderlos tras «¿Qué se guarda?» (nunca borrarlos).

## Lo que no pediste y importa más
**La función acepta un precio de 0,001 (lo guarda como 0,00) y `NaN`.** La regla «una producción necesita precio» existe justo para que no haya prendas sin precio, y esta puerta nueva la deja pasar; además un `NaN` en `variantes.precio` contamina toda suma (`NaN × 3 = NaN`) porque los CHECK `>= 0` lo admiten. Es dinero y es una migración: **es de Felipe** (detalle y evidencia en el informe de `/chaos`, hallazgos #2 y #3).
*(El revisor propuso otro candidato —«el modelo nace pendiente sin pantalla que lo apruebe»—; el escéptico lo matizó: Felipe quitó esa revisión el 2026-10-02, «no me sirve», y una pendiente se trataba como cualquier otra; después Felipe la reabrió con la cola «Por revisar» (ADR-0371, ya en `main`). Ver ADR-0361, «Lo que «pendiente» significa». Lo único realmente abierto es si el Taller debe fijar el precio de venta; fue una decisión del plan que Felipe aprobó.)*

## Lista aparte (no se ejecuta)
1. Borrador que sobrevive a Escape / clic fuera / Cancelar, con «Empezar de cero»; conservar cantidades al cambiar de categoría (tallas compatibles). Esfuerzo M; el token debe borrarse tras un éxito.
2. «Ese modelo ya existe» sin botón (modelo sin variantes activas o pestaña vieja): ofrecer «Actualizar la lista».
3. Callejón sin modelos y sin vocabulario: que no mande a «elegir un modelo que ya exista»; que el pie no liste campos ocultos; que no mande a Productos a quien no puede crear.
4. Costos Tela/Avíos/Maquila: rotularlos «Opcional» o plegarlos bajo «Costo estimado (opcional)».
5. Cancelar y el éxito con el cierre animado del `Modal` (patrón `children={(cerrar)=>…}`).
6. Rojo por celda con cantidad → tinta; quitar el borde del recuadro «Modelo nuevo» o el de la carta; igualar alturas del buscador y los botones de color; foco de la celda distinto de «llena».
7. Rótulos: «Modelo / Ya existe · Modelo nuevo» → «¿Qué modelo? / Uno del catálogo · Uno nuevo»; «Elegir la categoría» → «Elige la categoría»; «base de datos» fuera del aviso.
8. Nombre del modelo sin tope de largo (`maxLength` 80): /chaos #1.
9. «Estampado»: círculos con «?» de 9 px que solo dicen su nombre al pasar el mouse.
10. Largo plazo (L): una «ficha viva» de la prenda (nombre grande, silueta, colores y tallas elegidos) con la hoja más ancha (hoy 672 px); lo que de verdad sube la ley 5; pide un ADR.
11. **Del sistema, no de esta pantalla (ADR):** subir `label-cayla` de 11 a 12 px, una escala de 4 tamaños de texto, y un foco visible en `Segmentado` (`outline-none` + `bg-rojo/8`).

## Prueba ciega (Opus, entró como líder)
| Medida | Resultado | ¿Pasa? |
|---|---|---|
| Lectura de 5 s | «Es el tablero de órdenes de producción del taller, con las órdenes por etapas… lo que sigue es pulsar "Nueva orden"» | **sí** |
| Primer intento | completó y comprobó que quedó (aviso, tarjeta «Por cortar», panel con 12 prendas y costos) | **sí** |
| Pasos | **42** acciones (+3 de comprobación) | no se midió el mínimo; las 42 incluyen 6 casillas con Tab y los reintentos con la lista de categorías |
| Dudas (palabra textual) | «MUESTRA» vs «PRODUCCIÓN» · «YA EXISTE» vs «MODELO NUEVO» · «corrida» · «C/U» · «Blanco» vs «Crudo «blanco roto»» · «MAQUILA» · «Pierde» · casillas con borde rojo · «SIGUE AQUÍ» | no (cada una es un hallazgo de ley 3, 4 o 9) |
| Palabras no entendidas | «corrida», «C/U», «Muestra», «Maquila», «Pierde», «Insumos descontados / Descontar al cortar» | no (la tabla pide cero) |
| Errores evitables | 1 (escribió con la lista de categorías ya cerrada) | no |
Cosas que tocó y no hicieron lo esperado: el primer clic en «Elegir la categoría» no abrió la lista; escribir con la lista abierta la cerró; el aviso «Precio» de «Faltan:» no lo llevó al campo; pasar el mouse sobre «Pierde» no explicó nada. *Herramientas declaradas:* solo navegador (no leyó archivos). **Real: sin probar** (3 a 5 colaboradoras del Taller, en su equipo).

## Antes de decir «listo»
- **Concurrencia:** `/chaos` NAV-05 con dos sesiones y el mismo nombre: la segunda espera y recibe «Ya existe» (1 modelo, 1 orden); con un reintento del mismo token se devuelve la misma orden. Hueco: «Ese modelo ya existe» sin botón si ese modelo no tiene variantes activas.
- **Caída externa:** `/chaos` RS-01 y RS-03: sin red conserva lo escrito y no duplica; el mensaje «No se guardó nada» es falso cuando la base sí guardó (`error-escritura.ts:661`, traductor compartido).
- **Persona sin contexto:** ciega ✓ (con las salvedades de arriba) · real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `4f90fdb2` | 4,8 (ley 1: 6 provisional; ley 5: 3) | 5 (crudo 4) | primera revisión; ninguno aplicado: esperan el OK de Felipe |
| 2026-10-10 | `f05df49e` + migración | **5,4** (ley 1: 6 provisional; ley 5: 4) | 5 (5 de 8 fallan; no era parte de los cambios) | **los 3 cambios aplicados** (Felipe los eligió); ciega sin repetir |

## Segunda corrida (2026-10-10, tras aplicar los tres cambios que Felipe eligió)

Los tres cambios y los de gravedad 4 de `/chaos` están aplicados en la rama (commits `bc1dd77e`, `de1038c6`, `62fa8b93`, `36b5cdbb`, `f05df49e`, más la migración `fcbae569`). Se **remidió al mismo ancho** (1440 × 900,
la hoja con Modelo nuevo, Shorts, nombre, precio y cantidades llenos, contra la web de la rama y la base local):

| Medida | Antes | Después | Etiqueta |
|---|---|---|---|
| Distancia del «Nombre del modelo» a «Cuántas por talla y color» | 1.199 px (1,33 pantallas; con la carta abierta) | **413 px (0,46 pantallas)** | [Medido] |
| Alto del contenido de la hoja | 2.034 px | **1.248 px** | [Medido] |
| Distancia del nombre al precio | después de la carta (≫ 157 px) | **157 px** | [Medido] |
| Botón principal a 375 px | «Crear modelo y abrir orden»: 159 px de ancho, 180 de contenido, **recortado ~21 px** | «Crear y abrir orden»: 159 de ancho, 157 de contenido, **no se recorta** | [Medido] |
| Chip del semáforo con 38 % de margen | «Pierde» (rojo) | «Margen bajo» | [Observado] en el código y el DOM |
| «Falta» con «12,50» en el precio | «Falta: Precio» (sin decir por qué) | «Escribe el precio con punto, por ejemplo 12.50.» a la vista | [Observado] en el DOM |
| Oficio visual (script) | 5 de 8 fallan | **5 de 8 fallan** (radios 6 → 5; el rojo por celda, los bordes dobles y el texto de 11 px no eran parte de los cambios) | [Medido] |

**Notas (0–10), recalificadas con la evidencia de arriba; sin repetir la prueba ciega:** ley 1 **6** (provisional) · ley 2 **5** · ley 3 **6** («Pierde» ya no engaña; sigue «S/ 0.00 / prenda» sin prendas) ·
ley 4 **6** · ley 5 **4** (la carta ya no es lo más pesado; la prenda sigue sin aparecer) · ley 6 **5** (la frase del «Falta» se ve; «Margen bajo» aún no tiene leyenda al tocar) · ley 7 **6** (ya pregunta
«¿Salir sin guardar?»; cambiar de categoría sigue borrando las cantidades) · ley 8 **5** · ley 9 **6** (el botón cabe, el aviso de red dice la verdad; siguen los callejones sin modelos/vocabulario y «Ese modelo ya existe»
sin botón). **Leyes: 5,4** (49 / 9). Oficio: **5**. La ley 1 no puede pasar de 8 sin colaboradora real.

**Queda de la lista aparte** (no se aplicó): borrador que sobrevive a Escape (el aviso lo reemplazó en parte), callejones, rojo por celda, bordes dobles, rótulos «Modelo / Ya existe · Modelo nuevo», «ficha viva» de la prenda y el ADR
del sistema para las etiquetas de 11 px.
