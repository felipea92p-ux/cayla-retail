# Maqueta · Nuevo producto: «Buscar primero, escribir después» (2026-09-30)

> **Estado (actualizado el 2026-09-30): aprobada por Felipe como especificación visual y construida en la Fase 1 (ADR-0294).** Este `index.html` sigue sin tocar ninguna pantalla ni la base (el código está en `apps/web`, ver «Qué se construyó» al final).
> **La pantalla construida se aparta de esta maqueta en dos puntos a propósito:** la Marca **no** es «sugerida» ni lleva «Sigue aquí» (D11), y la base **sí** frena «una letra de diferencia» hasta que se confirme (Polo G44 / G45). Ambos están corregidos más abajo, donde la maqueta decía lo contrario.
> Alcance **Fase 1, sin tocar producción** (elegido por Felipe). Es el paso 2 «¿Cómo es?» de Nuevo producto, con una **alerta de prendas parecidas en el resumen de la derecha**
> y una hoja «Ver y comparar». **Cambio de diseño de Felipe, 2026-09-30:** «en lugar de mostrar "ya lo tenemos" grande [...] una alerta [...] en el resumen de la parte derecha, para no estorbar».
> Reemplaza al bloque «¿Ya la tenemos?» que iba dentro del formulario (ver «Por qué una alerta y no un bloque»).

`index.html`: un solo archivo, ábrelo en el navegador. **No es la implementación y no cambia ninguna pantalla.**
La barra punteada salta a un estado. También se abre directo en uno: `#marca`, `#tecleando`, `#hoja`…

Sucede a la maqueta `../producto-nuevo-v2-2026-09/` (ADR-0260, paso 2 «¿Cómo es?») y parte de la investigación
`docs/investigacion/2026-09-29-duplicados-de-producto.md` (secciones 1, 3, 6 y 10; **esa investigación quedó desfasada respecto de las decisiones de este README** y la actualiza otra persona).
Usa la guía de foco del alta (ADR-0284: `alta-guia.css`, `guia.tsx`, `piezas.tsx`) tal cual: ✓ verde = hecho, círculo de tinta con un pulso = «sigue aquí»,
anillo = falta, anillo punteado = sugerido u opcional, tinte y etiqueta «Sigue aquí» en el campo que sigue, y «Falta:» / «Sin elegir:» tocable en el pie.

## Qué cambió con la decisión de Felipe (2026-09-30)

- **(A) Sin campo «Código de la marca».** No hay dónde guardarlo sin tocar producción y no es necesario en Fase 1. El código se **lee del texto** del nombre o de la descripción
  (como hoy: «SS25 311» está en la descripción de «Wide Leg Corto Comfo», «79-SS24» en la de «Wide Leg», «G44» en el nombre de «Polo G44»). La persona lo teclea en el buscador de la hoja
  («Busca por nombre o por el código de la etiqueta…») y la prenda que lo lleva sube al primer lugar con el chip «Coincide el código: SS25 311». En la tarjeta, el código sale como chip
  leído de la descripción (`title`: «Leído de la descripción»), no como campo, y **una sola vez**: la descripción se muestra sin el código.
- **(B) Etiquetas de hoy, sin renombrar.** «Nombre» · «Como se lo dirías a una clienta» · «Blusa Aurora»; «Descripción» · «Opcional · lo que no dice el nombre: corte, largo, detalles» ·
  «Manga globo, botones forrados…»; «Marca y proveedor» · «Quién la hace y quién te la trae · opcional». Ya no existen «Nombre del modelo», «Cómo es el diseño» ni «Empieza por el tipo de prenda…».
  La pista «“Negra” es un color y se elige en el paso 3. ¿La quito del nombre?» sí se conserva.
- **(C) D5 confirmada.** Sin marca o con «Importado» (comodín) → la lista de la **categoría**, con buscador (la hoja lo tiene siempre).
- **(D) D1 decidida.** El nombre pasará a ser único **por marca** en una **fase posterior**: toca el índice único `productos_referencia_clave_unica` en producción y necesita su OK y SQL pegado.
  En Fase 1 la base sigue rechazando un nombre idéntico aunque sea de otra marca (estado `#otramarca`).
- **Alerta en el resumen** en vez del bloque grande (abajo).

## Por qué una alerta y no un bloque (Felipe, 2026-09-30)

**Ganas:** no estorba; el formulario queda corto (Marca → Nombre → Descripción → Tejido → Patrón → Temporada y etiquetas, sin una fila entera de tarjetas en medio); y el resumen es donde la gente
ya mira «qué falta» (la lista «Avance»): ahí se entiende y se deduce sin que el aviso pelee con el campo que se escribe.

**Pagas:** un aviso periférico se puede pasar por alto. Se mitiga con: (1) el **pulso** de entrada, uno solo, sin bucles y apagado con `prefers-reduced-motion` (ADR-0136);
(2) la línea en «Avance» («Hay 2 parecidas: míralas»); (3) el pie del paso («Revisa: 2 parecidas · Ver»); (4) el **rojo en línea bajo el campo Nombre** cuando frena, porque un error que frena
debe verse junto al campo donde se produce; y (5) en una **fase posterior**, el registro de si la persona abrió «Ver y comparar» antes de crear, para decidir con datos si hace falta hacerla más visible.

## El marco es el real (por eso el paso mide lo que mide)

La maqueta dibuja la página como es: lateral de 17 rem, `main` con `px-4 sm:px-10`, cabecera `EncabezadoPagina` (ADR-0254) y la rejilla `[paso | resumen de 340 px]` desde 1024 px
(`FichaPrevia.tsx`: `hidden … lg:sticky lg:top-6 lg:block`). **La ficha y «Avance» se dibujan sin cambios**; lo único nuevo del resumen es la tarjeta de alerta, entre las dos.
**Anchos del paso 2 medidos (lateral abierto):**

| Pantalla | Ancho del paso |
|---|---|
| 1920 | 1204 px |
| 1536 | 820 px |
| 1440 | 724 px |
| 1280 | 564 px |
| 1024 (lateral abierto) | 308 px |
| Tablet 768–820, sin lateral ni resumen | 690–740 px |
| Celular 375 | 343 px |

Con menos de 1024 px no hay resumen: la alerta pasa a una **tira pegada SOBRE la barra de abajo** (`data-barra-ficha`), y la hoja abre a pantalla completa. Con más, la hoja es el Modal de hoja de 680 px.
Parámetros: `,celular` (marco de 375 px), `,solo` (sin lateral ni resumen), `,quieto` (sin animaciones, para capturar), `,hoja` (abre la hoja en cualquier estado) y `,cerrada`
(deja cerrada la hoja de `#codigo`, `#hoja` o `#todas`). Ejemplos: `#tecleando,celular,quieto`, `#descontinuada,quieto,hoja`.

## Lo REAL y lo inventado

Leyenda fija arriba: **● Dato real de hoy · ○ Ejemplo inventado.** Cada tarjeta y cada miniatura lleva su marca.

- **Real** (producción, solo lectura, 2026-09-30): las 8 prendas cargadas el 2026-09-29 entre las 10:42 y las 12:06 (hora Lima), con sus colores, tallas, descripción y stock. Todo el stock está en Tienda TRU;
  AQP, LIM y el Taller tienen 0. Solo «Camisa Lara» tiene foto. Verificado también hoy: la categoría **«Blazers» existe** (0 prendas) y **ninguna marca real tiene prendas en dos categorías**.
  Producción tiene además «Prenda sin Registrar» (CAYLA, sin categoría, del 2026-09-23) y un «Conjunto Chaleco + Pantalon Sastre» de nervus cargado hoy a las 10:17, **después** del reloj de la maqueta: no se dibujan.
- **Inventado (Ejemplo):** las 12 prendas de CAYLA de «Ver los 12» —y por eso también «12 prendas en el sistema» en el combo de marca y «Ya hay 12 prendas de CAYLA» en la alerta—, «Palazo Nube» (la descontinuada de `#descontinuada`),
  **lo que se escribe en Nombre y Descripción** en cada estado («Wide Leg Corto», «Camisa Lara Negra», «Billie»…) y **las listas de tejidos y patrones por categoría** (cada fila lo dice con «Ejemplo: lista»;
  los totales «26 tejidos» y «10 patrones» son los de la captura de la pantalla real).
- **Las muestras de tejido y de patrón son las de la app** (el mismo SVG de 120×40 de `MuestraTejido.tsx` y `MuestraPatron.tsx`), pero **solo en las filas Tejido y Patrón del formulario**. En las tarjetas de prendas parecidas **no se usan como foto**
  (cinco jeans mostrarían el mismo denim y parecerían iguales, y el tejido es una pista débil por decisión de Felipe): tejido y patrón van como chips pequeños.
- **Sin foto:** el isotipo neutro de CAYLA al 30 %, copiado tal cual de `SinFoto` (`components/ui/PrendaCelda.tsx`, `public/cayla-isotipo.png`), con el texto «Sin foto todavía».
  **Los dibujos de las fotos no son fotos:** la ficha real «Camisa Lara» tiene foto, pero aquí se dibuja una camisa y la tarjeta lo dice («Foto de ejemplo dibujada», anotación de la maqueta).
- **El reloj de la maqueta** está fijo en el 2026-09-30, 09:58, para que «hace 21 h» no cambie según el día en que se abra. El estado `#hoy` repite lo de **ayer a las 12:04** (hace 6 min).
- **Nunca precio ni costo** (candado de dinero, ADR-0126). La maqueta no tiene ninguno: se comprobó buscando «S/», «precio» y «costo» en el texto pintado.
- **«Disp.» / «Disponibles»** es lo que da `fn_existencias_productos`: lo que se puede vender hoy, **sin apartadas, dañadas ni en camino** (ADR-0270). No es «quedan».
- **«Cargada en Tienda TRU»**, verificado el 2026-09-30: las 8 prendas tienen `propuesto_por`; la sede actual de quien las cargó es Tienda TRU en 7, y el primer movimiento de stock de las 8 es en Tienda TRU.
  El autor de «Polo G44» hoy no tiene sede asignada: cuando no se puede inferir la sede, la tarjeta dice solo «Cargada hace X h».

## Lo que la pantalla NO lleva (anotaciones de la maqueta)

Todo esto lleva la clase `.nota-maqueta` o `data-solo-maqueta`, o vive solo en la maqueta. Se quita al portar, sin tocar el diseño:
la barra punteada y su nota de estado, las etiquetas «Dato real de hoy» / «Ejemplo» (también «Ejemplo: lo escrito» y «Ejemplo: lista»), el punto de cada miniatura, «Foto de ejemplo dibujada»,
«Ficha y «Avance»: sin cambios · Nueva: la alerta», el lateral fantasma, el aviso «Solo de la maqueta» de Temporada y etiquetas (en la app son las grillas `ElegirTemporada` y `ElegirEtiquetas`, que no cambian)
y el `toast` de abajo (en la app un aviso es `avisar.*`, arriba a la derecha y **después** del loader, ADR-0149).

## Estados

| Enlace | Qué muestra |
|---|---|
| `#inicio` | Categoría Jeans, marca sin elegir. «Marca y proveedor» es «Sigue aquí». **No hay alerta**: sin marca no hay nada que comparar. Pie: «Faltan: Nombre · Tejido · Patrón» y «Sin elegir: Marca y proveedor · puedes seguir así». **Corregido (2026-09-30): eso NO se construyó.** En la pantalla real la Marca va arriba del Nombre, es opcional y la guía no la señala: «Sigue aquí» va al Nombre y el pie no dice «Sin elegir: Marca y proveedor». Tampoco es cierto que «sin marca no hay nada que comparar»: sin marca (o con «Importado») la lista sale de la categoría (D5) en cuanto la persona escribe un nombre |
| `#marca` | Jirish: **tarjeta informativa (pizarra)** en el resumen, «Ya hay 2 prendas de Jirish en Jeans» + «Si la tuya es una de ellas, ábrela y súmale tallas o colores.» + 2 mini filas (miniatura de 40 px, nombre, «Disp. 2 · hace 21 h») + «Ver y comparar». «Avance» dice «Hay 2 parecidas: míralas». Pie: «Revisa: 2 parecidas · Ver» |
| `#tecleando` | Nombre «Wide Leg Corto» (ejemplo): tras la pausa de 0,6 s la tarjeta pasa a **ámbar**, «Se parece a «Wide Leg Corto Comfo»», esa fila sube y se resalta, y dice «Tienen códigos distintos (SS25 311 y 79-SS24). Mira la etiqueta de tu prenda: ¿cuál dice?» (sin veredicto). **El campo Nombre no se mueve** |
| `#codigo` | La hoja abierta con «SS25 311» tecleado en su buscador: «Wide Leg Corto Comfo» sube al primer lugar con «Coincide el código: SS25 311»; «Wide Leg» no baja ni se apaga: solo dice «Otro código» |
| `#identico` | «Camisa Lara» con La Femme 21: **rojo en la tarjeta y en línea bajo el campo Nombre**, con «Ver y comparar»; «Seguir» bloqueado. Es lo único que frena |
| `#otramarca` | Marca Pilar, Jeans, Nombre «Wide Leg» (ejemplo tecleado; «Adelle Wide Leg» de Pilar es real). La base rechaza el nombre porque «Wide Leg» ya existe en Jirish: rojo con «Ese nombre ya existe en Jirish. Agrégale el modelo o la marca para distinguirla (ej.: Pilar Wide Leg)» y «Ver Wide Leg de Jirish». **Provisional hasta que el nombre sea único por marca (D1, fase posterior)** |
| `#color` | «Camisa Lara Negra» (ejemplo): pista «“Negra” es un color…» con «Quitar “Negra”»; la tarjeta pasa a ámbar, se parece a «Camisa Lara» |
| `#descontinuada` | Wayi con 2 reales y «Palazo Nube» (**Ejemplo**, descontinuada): va al final de su nivel, con el chip apagado «Descontinuada» al lado del dato. Abre la hoja (`,hoja`) para leer la frase de su tarjeta |
| `#primera` | Krisstell en Blazers (real, sin prendas): una línea neutra, «No hay prendas de Krisstell en Blazers todavía.» + «Ver las de Krisstell». **No tranquiliza** («esta sería la primera» se quitó) |
| `#sinmarca` | Sin marca y con nombre escrito («Billie»): «Sin marca no puedo reducir la lista» + «Ver las de Jeans» (las 5 prendas reales de Jeans). «Importado» cuenta igual que no elegir marca |
| `#hoja` | La hoja «Ver y comparar» abierta con las dos de Jirish, tarjetas completas |
| `#todas` | La misma hoja con CAYLA (12 ejemplos), buscador sin tildes que dice en qué campo coincidió |
| `#cargando` | Esqueleto parcial de la tarjeta (no el loader de pantalla completa) |
| `#sinred` | Botón «No pudo revisar»: la lectura falló. «No pude ver lo que ya hay. Puedes seguir: la base revisa el nombre otra vez al guardar.» + «Reintentar» |
| `#hoy` | Hoy vs. propuesta lado a lado, repitiendo lo de ayer a las 12:04. A la derecha, la propuesta con la tarjeta de alerta en el resumen |

Es interactiva: se puede elegir otra marca (incluido el comodín «Importado») y otra categoría (Cambiar), escribir el nombre, tocar una mini fila (abre la hoja en esa prenda), «Ver y comparar»,
«No, es otro diseño» (la tarjeta se pliega, con «Deshacer»; con todas revisadas la alerta baja a neutral «Revisaste 2 parecidas ✓» y «Ver de nuevo»), «Ninguna es mi prenda» (cierra la hoja y quita el énfasis), «Es el mismo diseño»,
«Falta: …» (lleva al campo) y la tira del celular. Con Escape, un primer toque borra la búsqueda de la hoja y el segundo la cierra.

## Qué cambia HOY vs. PROPUESTA

| Hoy (`main`) | Propuesta |
|---|---|
| Orden: Nombre → Descripción → Marca y proveedor → Tejido → Patrón | Orden: **Marca y proveedor → Nombre → Descripción → Tejido → Patrón** → «Temporada y etiquetas» plegado. Sin filas nuevas |
| El aviso solo compara el texto del nombre y exige 0,5. «Wide Leg» contra «Wide Leg Corto Comfo» da 0,474: no avisa. Lo único que saltaba era el gris «También existe algo parecido: Adelle Wide Leg» (0,563), de **otra marca** | Al elegir la marca, el resumen muestra lo que ya hay **de esa marca en esa categoría**. El texto solo ordena y rotula |
| El aviso no muestra foto, stock ni cuándo se cargó | «Ver y comparar» muestra **foto o «Sin foto todavía»**, descripción, tejido, patrón, temporada, colores, tallas, **disponibles por sede**, cuándo y dónde se cargó y el código leído. Nunca precio ni costo |
| «Es otro producto distinto» es una casilla que se aprende a marcar sin leer | «Es el mismo diseño» (botón) y «No, es otro diseño» (enlace); al pie de la hoja, «Ninguna es mi prenda». Sin casilla ni confirmación |
| Frena el idéntico, «una letra» (Polo G44 / G45) y pide marcar una casilla | **Solo frena el idéntico exacto** (misma clave que la base). Todo lo demás informa. **Corregido (2026-09-30): en la Fase 1 «Polo G45» frente a «Polo G44» TODAVÍA frena.** La base sigue rechazando «una letra» salvo `p_confirmo_distinto = true`, así que «Crear» espera a que la persona responda «No, es otro diseño» en la hoja; recién con la fase posterior que quita ese bloqueo en la base dejará de frenar (`CASI_IGUAL_FRENA_EN_BASE`, `lib/parecidas-alta-estado.ts`) |
| Color, talla o código dentro del nombre o de la descripción | Pista «“Negra” es un color… ¿La quito?». El código se lee del texto |
| Marca y proveedor: dos campos, opcionales, sin «Sigue aquí» (ADR-0283) | ~~Marca y proveedor pasa a «sugerido» (como los colores)~~ **Corregido (2026-09-30, Felipe): no pasa a sugerido.** Sube ARRIBA del Nombre, sigue **opcional** y la guía **no la señala** (sin «Sigue aquí» ni «Sin elegir»); «Sigue aquí» va al Nombre. Ver D11 |

## Cómo decide la alerta (lo que la maqueta simula)

- **Niveles** (los tonos del sistema, `AvisoInline` y `Chip`): **informativo** (pizarra, al elegir la marca), **ámbar** (lo tecleado en Nombre se parece a una prenda), **rojo** (idéntico exacto: frena «Seguir»),
  **neutro** («No hay prendas de X en Y todavía»; «Sin marca no puedo reducir la lista»; «Revisaste N parecidas ✓»; «No pude ver lo que ya hay») y un esqueleto mientras carga.
- **Qué se compara:** marca + categoría acotan la lista. **El tiempo ordena y rotula («hace 21 h»); nunca filtra.** Orden: (0) mismo nombre; (1) coincide el código buscado; (2) nombre parecido; (3) algo parecido; (4) sin evidencia.
  Dentro de cada grupo: la descontinuada al final, luego la más reciente primero y, si empatan, la que tiene stock.
- **La tarjeta dice QUÉ vio, no si es la misma.** «Mismo…» solo con nombre o código exactos. Ninguna evidencia empuja: «Es el mismo diseño» es igual de secundario en todas las tarjetas (el único botón lleno del paso es «Seguir →»).
- **El código es pista, no veto.** «Otro código» es solo un chip: la tarjeta no baja de lugar ni se atenúa, y su botón es el mismo. Un código no coincide con una prenda que sí es la misma cuando la reedición cambió de código.
  Un texto (un nombre, un color) filtra en la hoja; un **código solo ordena y rotula**.
- **El idéntico usa la misma clave que la base** (`retail.fn_clave_referencia`, `20260918230000_producto_nombre_una_sola_forma.sql:52-62`): minúsculas, sin tildes, sin espacios **ni puntuación**. «Polo G 44» es «Polo G44» y «WideLeg» es «Wide Leg».
  La base la aplica sobre todas las marcas y categorías menos las rechazadas (índice `productos_referencia_clave_unica`, `:169-171`): una descontinuada también choca.
- **Solo cuentan las palabras del modelo.** El tipo de prenda (camisa, blusa, polo…), el color, el tejido y la talla no son parte del modelo. **Material** (tejido, patrón): solo se muestra como chips; no separa ni puntúa.
- **Pausa de 0,6 s:** mientras se teclea, la alerta se queda como estaba; se actualiza (y se anuncia) tras la pausa, con un solo pulso si cambió de nivel. **«Seguir» se bloquea al instante** en un idéntico; el aviso rojo espera la pausa. La alerta **no roba el foco**.
- **Sin marca** («Importado» incluido): se ofrece la lista de la categoría cuando la persona ya escribió un nombre. **0 prendas:** una línea neutra, sin «esta sería la primera».
- **La marca partida** (Divas / Divas Now) y la línea «X también está en otra categoría» **no están cubiertas en Fase 1 con datos reales**: hoy ninguna marca real tiene prendas en dos categorías, así que esa línea existe en el código de la maqueta pero ningún estado la muestra.
  «Hay una «Adelle Wide Leg» de Pilar.» es una línea gris informativa dentro de la hoja (sin acción de cambiar de marca: «wide leg» es una silueta, no un modelo).
- **Descontinuada** (chip apagado «Descontinuada» al lado de la evidencia): en Fase 1 «Es el mismo diseño» abre su ficha, y la ficha (`ProductoForm.tsx:965-978`) ofrece «Estado: Activo / Descontinuado» en la misma pantalla de edición.
  Por eso la tarjeta dice solo lo que pasa: «Te lleva a su ficha. Para volver a usarla, cambia ahí «Estado» a «Activo» y guarda: no se activa sola.» Una prenda rechazada en un alta al vuelo no se reactiva (ahí la ficha no ofrece el cambio) y no se muestra.

## La hoja «Ver y comparar»

El `<Modal variante="hoja">` del ERP (papel, sin sombra ni ✕, 680 px, salida de 220 ms, foco atrapado y devuelto; a pantalla completa con menos de 1024 px). Título «Prendas parecidas de Jirish en Jeans», bajada «Compara el diseño con la prenda que tienes en la mano.»,
buscador «Busca por nombre o por el código de la etiqueta…» y las tarjetas completas: foto o «Sin foto todavía», nombre, evidencia, «marca · categoría», código leído, descripción, chips de tejido/patrón/temporada, colores, tallas,
«Disponibles: TRU 2 · AQP 0 · LIM 0 · Taller 0», «Cargada en Tienda TRU hace 22 h», «Es el mismo diseño» y «No, es otro diseño». Al pie, «Ninguna es mi prenda».
El buscador se ve **siempre**, aunque haya menos de 9 prendas (ver «Falta confirmar»).

## Las decisiones de Felipe que refleja (sesión del 2026-09-29/30)

1. **«Buscar primero, escribir después»**: antes de crear, se muestra lo que ya existe; ahora como alerta en el resumen y no como bloque en el formulario.
2. **Se compara marca + categoría** (acotan la lista); «hace poco» solo ordena y rotula; el material es una pista débil.
3. **Aviso con foto y stock** y un botón para decidir; **solo se frena el idéntico exacto**.
4. **El código de la marca se lee del texto** (decisión A): no hay campo.
5. **Sin renombrar etiquetas** (decisión B): Felipe no aprobó ninguno de los cambios propuestos.

**Definición, dicha el 2026-09-30: «mismo producto» = mismo diseño.** «Wide Leg» y «Wide Leg Corto Comfo» (misma marca, categoría, tejido y patrón) son **dos prendas distintas**. Una reedición es prenda nueva «siempre y cuando el diseño sea diferente». De ahí salen tres cosas:

- La **foto es la evidencia principal** (el diseño es visual). Como hoy solo 1 de 8 tiene foto, sin foto **no se puede comparar el diseño a la vista**: por eso la tarjeta dice «Sin foto todavía» y no finge con la muestra del tejido.
- El botón dice **«Es el mismo diseño»**, no «Es el mismo».
- Que el aviso de hoy no salte para el par de Jirish **no es una falla**: son dos diseños. Lo que falla es que la persona no tiene cómo verlo. Por eso `#hoy` no dice «hoy se equivoca», dice «hoy no hay cómo saber».

## Etiquetas: propuesta NO aprobada (Felipe, 2026-09-30): sin cambios

La maqueta usa las etiquetas y ayudas de **hoy**. La propuesta anterior queda solo como registro; **no se aplica**.

| Campo | Hoy (la maqueta usa esto) | Propuesta NO aprobada |
|---|---|---|
| Marca y proveedor | «Quién la hace y quién te la trae · opcional» | «Marca: la de la etiqueta. Proveedor: quien te la trae · opcional» |
| Nombre | «Nombre» · «Como se lo dirías a una clienta» · «Blusa Aurora» | «Nombre del modelo» · «Tipo de prenda y modelo» y, bajo el campo, «El color y la talla se eligen después.» |
| Descripción | «Descripción» · «Opcional · lo que no dice el nombre: corte, largo, detalles» · «Manga globo, botones forrados…» | «Cómo es el diseño» · «Opcional · corte, largo, detalles» |
| Botones de las tarjetas | «Es otro producto distinto» (casilla) | «Es el mismo diseño» · «No, es otro diseño» (esto **sí** es texto nuevo de la propuesta, no un renombre de un campo) |

Vocabulario: integrante, sede, clienta. Sin «obligatorio» en rojo y sin «umbral», «duplicado» ni «puntaje» en pantalla.

## Lo que Fase 1 promete, y lo que no

«Es el mismo diseño» **abre la ficha** de esa prenda, donde se le suman tallas y colores con los modales que ya existen (`AgregarTallasModal`, `AgregarColoresModal`).
Esas variantes nacen **sin unidades**: **las unidades se registran en Recibir**. Y **lo que la persona llenó en este paso no se guarda**. La maqueta lo dice **antes** de tocar: cada tarjeta
(«Te lleva a esa prenda: ahí le sumas tallas y colores. Las unidades se registran en Recibir. Lo que llenaste aquí no se guarda.»), el pie de la hoja y el aviso que sale al tocar.
«Es el mismo diseño» **no suma unidades** y **no resuelve la carrera entre dos sedes** que crean el mismo nombre a la vez. Quien trae varias prendas en la mano y quiere cargarlas de una vez sigue necesitando la fase posterior.

## Lo que NO muestra esta maqueta (fases posteriores)

- **Sumar unidades en un solo gesto.** Una función nueva que escribe stock.
- **«Otra sede se adelantó» (la carrera entre dos sedes).** La base hoy responde con un error de índice sin enlace. Cerrarlo toca `crear_producto_con_variantes`.
- **Sin conexión de la cola:** la cola rechazada que solo ofrece «Descartar». (El estado `#sinred` es otra cosa: la lectura de la alerta que falla.)
- **El registro de cada decisión** (`decisiones_parecido`), el registro de si la persona abrió «Ver y comparar», y la calibración con altas reales.
- **El Conteo** (`AltaAlVuelo`) con el mismo buscador, y la herramienta de fusión.
- **Guardar lo escrito y volver** después de mirar la ficha (borrador): no existe hoy.
- **Un candidato con la marca partida** (Divas / Divas Now): el bloqueo por marca lo pierde.
- **Otros comodines** además de «Importado»: cuáles marcas cuentan como comodín está por decidir.
- **Stock ajeno para quien no lo ve:** la maqueta muestra las cantidades de las 4 sedes; una persona sin ese acceso vería solo las de su sede.
- **«Crear otro parecido»** (`ProductoCreado.tsx:193-203`): hoy copia marca, categoría, tejido, tallas y precio. Debe volver con el Nombre **vacío** y pasar por la alerta: es un clon, fuente clásica de duplicados.
- **Faltan tallas o colores que la persona trae:** en el paso 2 aún no los eligió, así que se compara a ojo con los de la tarjeta.
- **La región de anuncio persistente** (`role="status"`): la maqueta vuelve a dibujar la tarjeta en cada pintada; en la implementación la región debe ser una sola y su texto cambiar tras la pausa de 0,6 s.

## Falta confirmar para Fase 1

1. **De dónde sale el código de la marca en la tarjeta.** Sin columna (`productos.codigo_marca` es un `alter` de tabla en uso), el chip se **lee del texto**: la maqueta lo deja ya leído en 3 de 8 prendas (2 en la descripción, 1 en el nombre) y
   la búsqueda compara el código normalizado contra `nombre + descripción`. Falta decidir la regla de lectura del chip (qué palabras cuentan como código).
2. **«Cargada en Tienda TRU».** Verificado el 2026-09-30 (arriba). Falta ver si `fn_productos` ya entrega `propuesto_por`; si no, la sede se cruza con `colaboradores.ubicacion_asignada_id`. Si no se puede inferir, la tarjeta muestra solo «hace X h».
3. **Lecturas de la alerta**, todas existentes: `fn_productos` por marca (y categoría), una consulta directa a `productos` para descripción, tejido, patrón, temporada y `created_at`, y `fn_existencias_productos` para el stock en cantidades
   (que es «disponible», no «quedan»). Confirmar que la primera trae lo que la tarjeta necesita.
4. **Lo que la persona ya llenó** (marca, nombre, tejido, patrón) **se pierde** al tocar «Es el mismo diseño» en Fase 1: la ficha del existente no lo recibe.
5. **Idéntico en otra marca u otra categoría.** La lista es marca + categoría, así que ese idéntico no está en ella: el rojo lleva «Ver X de Jirish». Hoy el nombre es único global; pasa a ser único por marca en la fase posterior (D1).
6. **La clave del idéntico.** La maqueta ahora usa la misma clave que la base (sin espacios ni puntuación, con las tildes áéíóúüñ). Antes conservaba los espacios y habría dejado pasar «Polo G 44» donde la base rechaza.
7. **La lectura falla o tarda** (`#cargando`, `#sinred`): la RPC de lectura debe llevar un prefijo de la lista de lectura de `espera-reglas.ts` (`fn_` ya está) y usar `x-espera: no`; la tarjeta es un esqueleto parcial, no el loader.
   Si la persona está realmente sin internet, «Puedes seguir» la manda a la cola de hoy, que ante un rechazo solo ofrece «Descartar» (fase posterior).
8. **Pedir la foto al crear:** 7 de 8 prendas no tienen foto y sin foto no se puede comparar el diseño a la vista. El paso 3 ya la pide por color; falta decidir si se pide antes.
9. **Altura del resumen.** Medida en la maqueta (el resumen mide 340 px de ancho): sin alerta, 650 px; con la alerta, entre **715 px** (línea neutra) y **898 px** (informativa o ámbar con 2 filas), **972 px** con 3 filas y la marca de maqueta. En una pantalla de 900 px de alto el resumen
   (`lg:sticky lg:top-6`) ya no cabe entero y «Crear producto» queda fuera de la vista. Opciones sin decidir: mostrar 2 filas, o que el resumen scrollee dentro de `max-h-[calc(100dvh-3rem)]`.
10. **Descontinuada:** falta confirmar en la base que se le pueden sumar tallas y colores sin activarla; por eso la tarjeta no lo promete.
11. **El buscador de la hoja se ve siempre**, aunque haya menos de 9 prendas: el código de la etiqueta discrimina aun con 2 (esa es la razón de ser de `#codigo`). La regla de buscador de combos (ADR-0209: más de 8) es para listas de opciones; esta es una búsqueda.
12. **Buscar un código no oculta nada** (solo ordena y rotula); buscar un texto sí filtra. ¿Es la regla que quieres?

## Qué falta por decidir / decidido

- **D2, ¿qué suma «Es el mismo diseño»?** Solo variantes (Fase 1, esta maqueta) o variantes y unidades de una vez (función nueva que escribe stock, fase posterior).
- **D5, sin marca o con comodín: confirmada por Felipe** (lista de la categoría con buscador). Falta saber qué otras marcas cuentan como comodín además de «Importado».
- **D11, Marca y proveedor «sugerido»: DECIDIDA EN CONTRA (Felipe, 2026-09-30, «tal cual» sobre el orden del formulario).** La Marca sube arriba del Nombre, sigue **opcional** y la guía **no la señala** (ADR-0283: «nunca Sigue aquí»); «Sigue aquí» va al Nombre. La alerta no la necesita: sin marca compara contra la categoría (D5). El texto que sigue es la propuesta original, que **no se construyó**: «Para que la alerta exista casi siempre, la guía tiene que señalarla; no bloquea.» Cambia el comentario y una línea de `lib/alta-producto-guia.ts`.
- **Decidido, fase posterior: D1.** El nombre pasa a ser único **por marca**: toca el índice único `productos_referencia_clave_unica` en producción y necesita el OK de Felipe y el SQL pegado (partes, sin mezclar `alter` con políticas).
- **Las etiquetas: no se aprueban** (tabla de arriba).
- **La pausa de 0,6 s**, **la sede inferida** y **si la alerta hace falta más visible** (con el registro de aperturas, fase posterior).
- **Pedir la foto al crear** (punto 8 de «Falta confirmar»).

## Conflictos con decisiones y hallazgos anteriores, y cómo se resolvieron

- **Buscador «cuando hay más de 8» vs. `#codigo`** (una hoja de 2 prendas con «SS25 311» tecleado): el buscador de la hoja se ve siempre (punto 11).
- **«Otro código» sin que la tarjeta baje ni se atenúe** (hallazgo 1) vs. un buscador que filtra: un **código solo ordena y rotula** (deja abajo, sin apagar, las que no lo llevan); solo un texto filtra.
- **Lo requerido vs. lo sugerido en el pie** (hallazgo 10): «Falta:» es solo lo requerido; ~~«Sin elegir: Marca y proveedor · puedes seguir así»~~ (no se construyó: la Marca no es sugerida, D11) y «Revisa: 2 parecidas · Ver» son sugeridos y **nunca bloquean «Seguir»**.
- **Aviso que frena junto al campo** (hallazgo 4, `#otramarca`) vs. alerta periférica: el rojo va **en las dos partes**, en la tarjeta y en línea bajo el campo Nombre.
- **La nota de `#tecleando` que citaba a Adelle** (hallazgo 15): ahora la línea gris «Hay una «Adelle Wide Leg» de Pilar.» está en la hoja, donde se ve.
- **El resumen ahora es más alto** (sticky de `lg:top-6`): punto 9 de «Falta confirmar»; no se resolvió, se midió.

## Revisión del 2026-09-30

Tres revisores compararon la primera versión con capturas, y un cuarto (corrector) aplicó las decisiones (A)–(D) y 15 hallazgos. Aplicado: el marco y los anchos reales; la cabecera `EncabezadoPagina`; los tonos del sistema (`AvisoInline`, `Chip`); botones sin énfasis (solo «Seguir →» es lleno);
la hoja como el Modal de hoja; la lista de marcas con `.lista-flotante`; las medidas del paso; el pie pegado abajo; la barra de la ficha en celular; los objetivos táctiles de 44 px; **la clave del idéntico de la base**; **el idéntico de otra marca** (`#otramarca`);
**la descontinuada** (`#descontinuada`); **sin foto = isotipo de CAYLA**, no la muestra del tejido; «Disponibles» y no «quedan»; «Cargada en…» verificado; «No hay prendas de X en Y todavía» sin «esta sería la primera»; el pie con «Falta:» / «Sin elegir:»; y «Ejemplo» en todo lo inventado.
Lo que **no** se aplicó: botón lleno («Es el mismo diseño») cuando hay evidencia fuerte (el sistema tiene un solo botón lleno por pantalla y empujar a fusionar es el error caro); «tocar para ampliar» la foto (pieza nueva); y guardar un borrador para volver de la ficha (fase posterior).

## Cómo se portaría (la estimación original; lo que se construyó está en «Qué se construyó», al final)

- `NuevoProductoForm.tsx`: el paso 2 reordena `cuerpo(2)` (Marca, Nombre, Descripción, Tejido, Patrón) y **no suma ninguna fila**. ~~`lib/alta-producto-guia.ts` pasa «Marca y proveedor» a sugerido (D11).~~ (No se hizo: solo se sube la entrada `marca` antes de `nombre`, que es cosmético.) `FichaPrevia.tsx` recibe la alerta (entre `Tarjeta` y `Avance`) y su tira sobre la barra
  `data-barra-ficha`; la línea «Hay 2 parecidas: míralas» entra en `PasoAvance.texto`.
- Pieza nueva `components/alta-producto/AlertaParecidas.tsx` (tarjeta, tira y la hoja con `<Modal variante="hoja">`) y su lógica pura en `lib/` con pruebas (niveles, orden, clave del idéntico, lectura del código, palabras del modelo). Extender `AvisoParecidos.tsx` (su rama idéntica) en vez de crear otro aviso rojo.
- Reusar lo que ya existe: `AvisoInline`, `Chip`, `MuestraColor`, `SinFoto`, `Resaltado`, `EncabezadoPagina`, `Modal`.
- Lectura: `fn_productos` por marca y categoría + consulta directa a `productos` + `fn_existencias_productos`. Al agregar una RPC de solo lectura llamada desde el navegador, sumar su prefijo a `espera-reglas.ts`.
- Antes de empezar: traer `origin/main` y mirar `docs/SESIONES-ACTIVAS.md` (hay otras sesiones sobre este formulario).
- Captura a 375 px y a 1440, 1280 y 1920 px antes de darlo por terminado, y comparar con esta maqueta (regla del spike de Finanzas).

## Cómo se verificó

Capturas con Chrome sin cabeza (no el panel del navegador) y **mirando cada imagen**: a 1440 px, todos los estados (`#inicio`, `#marca`, `#tecleando`, `#codigo`, `#identico`, `#otramarca`, `#color`, `#descontinuada`, `#primera`, `#sinmarca`, `#hoja`, `#todas`, `#cargando`, `#sinred`, `#hoy`, más `#descontinuada,hoja`);
a 1920 y 1280 px (`#marca`, `#tecleando`); a 820 px (`#tecleando` con la tira y con la hoja a pantalla completa); y a 375 px, dentro de un iframe de 375 px porque Chrome no baja de 500 px de ventana (`#marca` con el formulario entero, `#tecleando`, `#identico`, `#otramarca`, `#hoja`,
`#hoja,celular`, `#tecleando,hoja`, `#todas,celular`, `#descontinuada`).
Con una copia de prueba se escribió letra a letra «Wide Leg Corto Comfo», «Wide Leg» y «Wide Leg Corto Negra» en 9 anchos (1920, 1536, 1440, 1280, 1024, 820, 700, 500 y 375 px): **el campo Nombre se mueve 0 o 1 px** (un primer intento midió hasta 58 px por la carga de la tipografía de Google; con la tipografía ya cargada no se mueve).
También se ejercieron: la alerta congelada mientras se teclea y actualizada con la pausa, «Seguir» bloqueado al instante en un idéntico, el rojo en línea tras la pausa, «Ver y comparar», «No, es otro diseño» / «Deshacer» / «Ninguna es mi prenda» / «Ver de nuevo»,
el buscador de la hoja con un código (con y sin coincidencias) y con un texto, Escape en dos tiempos, «Ver las de Krisstell», «Es el mismo diseño», «Importado» como sin marca, «Quitar “Negra”» y la clave del idéntico («WideLeg», «polo g 44»). No hubo errores de JavaScript.
**No se pudo verificar:** el pulso de entrada (las capturas van con `,quieto`), `prefers-reduced-motion` en un sistema real, el anuncio de un lector de pantalla (la tarjeta se vuelve a dibujar en cada pintada), el orden de tabulación y el foco devuelto de la hoja después de este rediseño, un teléfono o una tablet reales, y la altura del resumen en un monitor real de 900 px.

## Qué se construyó (2026-09-30, Fase 1, ADR-0294)

La maqueta fue la especificación y se portó a `apps/web` sin migración y sin tocar producción. PR abierto para que Felipe lo fusione. Decisiones y fases: `docs/adr/0294-antes-de-crear-se-ve-lo-que-ya-existe-prendas-parecidas.md`;
evidencia: `docs/investigacion/2026-09-29-duplicados-de-producto.md` (sección 0.4).

**Archivos nuevos** (`apps/web/`):

| Capa | Archivos |
|---|---|
| Contrato y reglas puras | `lib/parecidas-alta-tipos.ts`, `lib/parecidas-alta-reglas.ts`, `lib/parecidas-lexico.ts`, `lib/parecidas-alta-fixtures/` |
| Lectura (con lo que ya existe en la base) | `lib/candidatas-alta-datos.ts`, `lib/candidatas-alta-lector.ts`, `lib/useCandidatasAlta.ts` |
| Vista pura (todos los textos) | `lib/parecidas-alta-vista.ts` |
| Candado y pegamento | `lib/parecidas-alta-estado.ts`, `lib/useParecidasAlta.ts` |
| Pantalla | `components/alta-producto/AlertaParecidas.tsx`, `TarjetaParecida.tsx`, `HojaParecidas.tsx`, `TiraParecidas.tsx`, `ParecidasDelAlta.tsx`, y `app/estilos/alta-parecidas.css` |

**Editados:** `components/NuevoProductoForm.tsx` (Marca y proveedor sobre el Nombre, `useParecidasAlta` en lugar de `useParecidos`, pie del paso 2, línea de «Avance»), `components/alta-producto/FichaPrevia.tsx` (prop opcional `parecidas`: alerta entre la ficha y «Avance», tira como primer hijo de `data-barra-ficha`, hoja como portal), `lib/alta-producto-guia.ts` y su prueba, `lib/alta-producto.ts` (una frase), `lib/guia-de-foco-pantallas.ts` (`HojaParecidas.tsx` como `no-aplica`) y `app/globals.css` (un `@import`).
Las pruebas viven junto a cada archivo de `lib/` (`*.test.ts`). La página `app/auth/prueba-*` que se usó para ver el formulario real con respuestas de ejemplo es **temporal y no va al commit**.

**Dónde la pantalla construida se aparta de esta maqueta (a propósito):**

1. **La Marca no es «sugerida»** y no lleva «Sigue aquí» ni «Sin elegir» (D11, arriba): sube sobre el Nombre, sigue opcional, y «Sigue aquí» va al Nombre. La alerta compara contra la categoría cuando no hay marca.
2. **«Una letra» frena en la Fase 1:** la base lo rechaza hasta confirmar, así que «Crear» espera la respuesta «No, es otro diseño» (no el «Polo G45 ya no frena» de la maqueta).
3. **«Cargada en Tienda TRU» sale de `fn_producto_origen`** (ADR-0292), no de inferir la sede de quien propuso la prenda (punto 2 de «Falta confirmar»); sin fila, solo «hace X h».
4. **El resumen con la alerta lleva tope de alto y scroll propio** (`lg:max-h-[calc(100dvh-3rem)]`, solo si llega la prop `parecidas`): «Crear producto» queda al fondo de ese scroll. Es la respuesta provisional al punto 9 de «Falta confirmar» y espera a Felipe.
5. **La línea de «Avance»** solo habla cuando hay candado o algo por mirar («Hay 2 parecidas: míralas», «Ese nombre ya existe: no se puede crear igual.», «Se escribe casi igual: míralo»); «Revisaste N ✓» lo dice solo la tarjeta de la alerta.
6. **El aviso de «una letra» no tiene un ámbar propio bajo Nombre:** esa prenda se dice en la alerta, la tira, «Revisa: … · Ver» del pie y «Falta: Nombre». El rojo bajo Nombre es solo del idéntico.
7. **El candado sale de la base, no de la alerta.** Si la lectura de lo que ya existe falla, vuelve la casilla de siempre (`AvisoParecidos`, como respaldo) para no dejar «Crear» apagado sin salida. La alerta espera 0,6 s tras teclear; el candado no.
8. **«Revisa: N parecidas · Ver» solo sale en el pie del paso 2** (no junto a «Crear producto» en el paso 4: por decidir).

**Lo que sigue sin construir** es lo de «Lo que NO muestra esta maqueta (fases posteriores)», más arriba, y los puntos de «Falta confirmar» que no se resolvieron (la foto al crear; qué otras marcas son comodín). Tampoco se verificó qué ve del stock de otras sedes una persona sin ese acceso. **No se ha visto con una cuenta real ni con datos reales de la base.**
