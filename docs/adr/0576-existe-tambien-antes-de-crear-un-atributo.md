# ADR-0576 · «Existe también»: antes de crear un color, talla, tejido, patrón, familia o categoría, se ve lo que ya existe

- **Fecha:** 2026-10-30 · **Estado:** construido y probado en local con datos inventados (escritorio y 375 px). **Solo web: sin migración, sin tocar producción, sin tocar ninguna RPC.**
- **Pedido (2026-10-30):** dos compañeras crearon «Verde Olivo» teniendo «Verde oliva». Que al crear un color —o cualquier atributo— el sistema diga «existe también: …» y señale las coincidencias.
- **Complementa:** ADR-0109 y ADR-0294 (la misma pregunta para marcas, proveedores y prendas), ADR-0290 (los ejemplos no repiten lo que ya existe), ADR-0215 (sinónimos del color) y ADR-0284 (guía de foco). **No cambia** ningún candado de la base.

## El problema primero

«Verde Olivo» y «Verde oliva» son el mismo color con una letra distinta. La base solo frena el **mismo** nombre (`retail.fn_clave_texto`: tildes, mayúsculas y espacios no cuentan; índice `colores_clave_unica`), así que pasó. Y las pantallas no ayudaban:

- **Colores:** solo comparaban el **tono** (ΔE2000 < 8, un aviso de texto que se puede ignorar) y, en Nuevo producto, el nombre *exacto* o un sinónimo. Con el tono de la captura (≈ `#80885A`), «Verde Olivo» queda a **ΔE 10,5** de «Verde oliva» (`#6A6F34`): fuera del umbral, el aviso **nunca** habría saltado.
- **Tallas, tejidos, patrones, familias, categorías:** nada más que el candado exacto de la base. «Rayas» y «Raya», «Rojo» y «Roja» convivían sin aviso.
- **Nuevo producto** crea tallas, tejidos y patrones por otro camino (`ProponerValor`) que tampoco miraba parecidos.

Lo que cuesta un duplicado no es feo, es dinero: la misma prenda queda registrada de dos formas, su stock se parte en dos, y los filtros de la tienda y de Análisis muestran la mitad.

## Qué se decidió

```
DECIDÍ:    Una sola regla de «lo que ya existe», la misma de marcas y proveedores, con tres niveles y una sola pieza visual en las
           seis pantallas de vocabulario y en las dos puertas de Nuevo producto.
DESCARTÉ:  Un candado en la base contra el «casi igual» (la rechazaría y listo), porque «Blanco» y «Crudo» —o «Nude» y «Piel»— son
           dos colores legítimos de textil y un candado necesita su función de similitud y su salida («es otro»); y una regla propia de
           atributos aparte de `nombresParecidos`, porque dejaría dos formas de decidir «se parece» en el mismo sistema.
SE ROMPE SI: dos personas crean «Verde olivo» y «Verde oliva» en el mismo minuto desde dos pantallas abiertas antes (cada una ve una
           lista sin lo que acaba de crear la otra: la pregunta usa lo que el navegador leyó), o si alguien llama a la API directo.
           El candado de la base sigue siendo solo el nombre exacto.
```

1. **UNA regla:** `lib/atributo-parecido.ts` (`atributosParecidos`) es `nombresParecidos` —la de marcas y proveedores— con tres opciones que un vocabulario necesita y una marca no: **los números cuentan** («Talla 38» no es «Talla 40»; «Jersey 30/1» no es «Jersey 24/1»), **lo contenido no avisa** («Azul» está en «Azul rey» y son dos colores) y **el tipeo de una letra solo desde 8 letras** («Morado» y «Dorado» son dos colores; «Gris melange» y «Gris melanje», uno). Sin pasarlas, marcas y proveedores se comportan exactamente igual que antes (su prueba no cambió).
2. **Plural y femenino son el mismo nombre:** `plegarPalabra` («olivo» y «oliva» → «oliv»; «lunares» y «lunar»; «roja» y «rojo»). Lo corto y los números quedan tal cual (una talla «XS» no es «X»; «Lila» no es «Lima»).
3. **Tres niveles**, decididos por el motivo y no por la pantalla (`nivelDeMotivo`):
   - **frena** — mismo nombre: la base no lo deja pasar. Solo se elige el que existe o se cambia lo escrito.
   - **pregunta** — casi igual, o un sinónimo cargado («piel» → Nude): puede ser el mismo. «Guardar» espera a que la persona diga «No, «X» es otro color»; la pregunta vuelve si cambia el nombre. **Esa respuesta calla solo la pregunta, nunca el mismo nombre ni el aviso del tono** (`preguntaPendiente`, función pura con su prueba: si la lista se refresca y alguien más ya creó el nombre idéntico, «Guardar» se vuelve a apagar).
   - **avisa** — solo el tono (colores): se ve parecido, se deja guardar. «Blanco» y «Crudo» se parecen y son dos colores.
4. **UNA pieza visual:** `components/ui/ExisteTambien.tsx` (`useExisteTambien` + `<ExisteTambien>`) sobre `PreguntaParecido`, la misma caja ámbar de marcas y proveedores. Dice **qué existe y por qué se parece** («Verde oliva · casi el mismo nombre»), **qué se rompe** si se duplica («su stock se parte en dos»; la frase cambia por vocabulario, `VOCABLOS`) y ofrece «Ver X» (cierra la hoja y deja la lista buscándolo) o, en Nuevo producto, «Elegir X» / «Usar X». Con el botón de guardar apagado, su `title` dice por qué.
5. **Colores: nombre y tono, una sola lista** (`coloresQueYaExisten`): la pregunta por NOMBRE va bajo el campo Nombre; la de TONO, junto al selector del color (si apareciera arriba al elegir el tono, movería el selector bajo el mouse).
6. **Al editar, solo si cambió el nombre** (colores, familias, categorías): una prenda que ya convive con un parecido no puede quedar sin poder editarse por eso.
7. **Por nombre entran también los desactivados** (la base rechaza un nombre que ya tuvo un color): la fila dice «desactivado». Por tono, solo los que se pueden elegir.
8. **Se borró `colorConEseNombre`** (solo nombre exacto o sinónimo): quedó superada; el ejemplo de la caja de nombre (ADR-0290) ahora evita también lo «casi igual».
9. **Un tejido que se crea sin su propio botón de guardar** (Insumos ▸ «Nueva tela» y «Editar tela»): el combo de tejido tiene la fila «+ Crear el tejido «X»», que crea al tocarla. Ese campo no tiene un «Guardar» propio al que apagar, así que la pregunta sale **antes de crear**: el tejido queda pendiente, aparece la misma caja bajo el combo («Usar Franela» / «No, «Franelas» es otro tejido») y solo se crea con el segundo. Elegir otro tejido de la lista cierra la pregunta, y **mientras siga sin contestar la hoja no se guarda** (`tejidoPorContestar` es un problema más de `problemasDeLaTela`, la guía lo nombra y el botón se apaga): sin eso, «Crear la tela» o «Guardar los cambios» perdían en silencio el tejido que la persona acababa de pedir (lo encontró la revisión adversarial de este punto). Si la creación falla por un corte de red, la pregunta queda a la vista para volver a tocar «No, es otro» sin reescribir nada; un segundo toque mientras la base responde no manda otra creación. Lo que de verdad es otro («Jersey 30/2» junto a «Jersey 30/1») se crea directo, sin preguntar. Vive en `useTejidosDeLaTela` (`PiezasDeLaTela.tsx`), que las dos hojas comparten. **Esto estaba fuera de alcance en la primera versión de este ADR, por error:** la razón de dejar fuera a la tela valía para el NOMBRE de la tela, no para el tejido que se crea ahí dentro.

## Qué se midió

- **La carta oficial de CAYLA no se acusa a sí misma:** los 90 colores contra los otros 89, cero coincidencias (`lib/atributo-parecido.test.ts`). La primera versión acusaba «Morado» con «Dorado»; de ahí el piso de 8 letras. Una regla que grita sobre un vocabulario limpio enseña a tocar «No, es otro» sin leer.
- **Navegador (andamio bajo `/login`, datos inventados):** «Verde Olivo» → pregunta con «Verde oliva» y guardar apagado; «No, es otro» → la caja se va y la guía pasa a Familia; «verde OLIVA» → «ya existe», sin «No, es otro»; «Verde pacay» → nada; solo-tono → avisa sin frenar; nombre de un desactivado → «mismo nombre · desactivado»; Editar sin cambiar el nombre → no pregunta; renombrar a «Verde olivo» → pregunta. Patrones («Raya», «Cuadro»), tallas («xl», «XXL», «39»), tejidos («Jerseys 30/1», «Jersey 28/1», «Algodón pima») y familias («Calzados»), también; y en Nuevo producto, «+ Nuevo color» (sinónimo «Piel», «Verde olivo», «Elegir»), «+ Nuevo patrón» («Raya», «Usar Rayas», «No, es otro») y «+ Nueva talla». Sin scroll horizontal a 375 px (colores). En Insumos (andamio con los tejidos «Algodón pima», «Jersey 30/1», «Piqué», «Franela»): «Franelas» → pregunta y no crea nada; «Usar Franela» → elige el que existe, sin crear; «Piques» → «No, es otro tejido» → crea y lo elige; «Jersey 30/2» → crea directo; con la pregunta abierta, elegir otro tejido de la lista la cierra; a 375 px la caja queda pegada al tejido y sin scroll horizontal. El andamio monta `TejidoYComposicion` y `useTejidosDeLaTela`, **no las hojas completas**: «guardar con la pregunta abierta» y «Editar tela» se probaron solo con las pruebas de las reglas. **No se probó en el navegador** la hoja de categorías y subcategorías (solo `tsc` y sus pruebas) ni «+ Nuevo tejido» de Nuevo producto (mismo código que patrón).
- **La decisión de «Guardar apagado» tiene prueba** (`preguntaPendiente`, `lib/atributo-parecido.test.ts`): sin respuesta bloquea; «No, es otro» destraba solo ese nombre (mayúsculas y tildes no cuentan); si cambia el nombre, vuelve; no calla el mismo nombre; no calla el tono. El repo no tiene pruebas de interacción de componentes (sin jsdom): por eso la decisión vive en la regla y no en el hook. Lo mismo para el frenado de Insumos (`lib/tela-nueva-reglas.test.ts`, `lib/editar-tela-reglas.test.ts`): la guía y la hoja deciden igual con la pregunta abierta.

## Qué no cubre (dicho sin adornos)

- **No corrige lo que ya existe.** «Verde Olivo» ya está creado en producción; aviso hacia adelante no lo arregla. Unirlo con «Verde oliva» mueve prendas (`variantes.color_codigo`) y hoy no hay «fusionar color»: es una decisión de datos aparte, con dinero y stock de por medio.
- **Sin candado en la base para el «casi igual»** (ver arriba).
- **Sin sentido ni otros idiomas:** «Navy» y «Azul marino» solo se encuentran si «Navy» está cargado como sinónimo.
- **Fuera de alcance:** Marcas y Proveedores (ya tenían su pregunta), Temporadas (lista cerrada de nueve), Insignias y Etiquetas, y el NOMBRE de la tela de Insumos (`tela-nueva-reglas` ya usa `nombresParecidos`). El tejido que se crea desde esa hoja sí entra (punto 9).
- **No probado con una cuenta real:** el andamio monta los componentes reales con listas inventadas; no pasó por la base.

## Archivos

`lib/atributo-parecido.ts` (+ prueba) · `lib/nombres-parecidos.ts` (tres opciones) · `lib/color-alta-reglas.ts` · `components/ui/ExisteTambien.tsx` · `components/{ColoresLista,TallasLista,TejidosLista,PatronesLista,FamiliasLista,CategoriasLista}.tsx` · `components/alta-producto/{NuevoColorAlta,ProponerValor}.tsx` · `components/insumos-taller/{PiezasDeLaTela,NuevaTelaModal,EditarTelaModal}.tsx` · `lib/sugerencias-alta-producto.ts` · guías de Atributos, Categorías y Familias (`lib/guias/pantallas/catalogo.ts`), la de «Nueva tela» (`lib/guias/pantallas/produccion.ts`) y la huella de diez pantallas.

---

## Actualización 2026-10-31 — el candado de la base ya no lo burla un carácter invisible

Este ADR dice que el nombre **igual** lo frena la base y que el «casi igual» solo pregunta. `/chaos` encontró que lo
primero no era cierto: **un carácter que no se ve bastaba para colar un duplicado por delante del candado.**

`retail.fn_clave_texto` —la clave sobre la que cuelgan los **16 índices únicos** de todo el vocabulario del catálogo—
bajaba a minúsculas, quitaba tildes y juntaba espacios, pero no quitaba los caracteres invisibles que viajan en
cualquier copiar y pegar: el espacio de ancho cero (U+200B, el que más llega, de la web y de WhatsApp), sus parientes,
el unidor de palabras, el BOM y el guion suave que mete un PDF al cortar una palabra. Así, «Botón ZW» y
«Botón<U+200B> ZW» eran dos claves distintas: dos fichas del mismo botón, con el stock partido. Medido también en
`colores`. La pregunta de este ADR sí salía, pero **no bloquea**: quien va con prisa pasa por encima.

Lo encontró dos veces, en dos pantallas, con una sola causa: Catálogo ▸ Atributos (30-oct) y «Nuevo avío» (31-oct).

**Decidido (Felipe, 31-oct):** se arregla en la causa, no pantalla por pantalla. La clave quita esos invisibles —en la
base (`20261031200000`) y en el `claveTexto` de la web, que es su espejo—, y los invisibles se quitan **antes** de
juntar los espacios: uno metido entre dos dejaría un espacio doble si se quitara después.

**Lo que costó, y conviene que quede escrito.** Cambiar una función `IMMUTABLE` obliga a rehacer los índices que
cuelgan de ella: Postgres guarda en el índice el valor que la función devolvía al escribir cada fila. El primer
intento usó `reindex`, y por poco sale mal: **dentro de una misma transacción —que es como corre todo lo que se pega
en el SQL Editor y como aplica cada migración el CI— `reindex` reconstruye con la función CACHEADA, o sea la vieja, y
encima no avisa si quedan dos claves iguales: pasa en verde sin hacer nada.** En una sesión aparte sí usa la nueva.
La migración usa `drop index` + `create index`, que se planifica desde cero y evalúa la función de verdad en los dos
casos; los 16 son índices sueltos, ninguno respalda una constraint.

**Lo que sigue sin cubrir** (además de lo de arriba): el «casi igual» sigue sin candado en la base, a propósito —
Blanco y Crudo son dos colores—, y esto **no corrige lo que ya existe**. Si hoy hubiera dos filas que solo se
diferencian por un invisible, la migración se niega y lo dice: cuál de las dos se queda es una decisión del negocio.

## Actualización 2026-11-15 — «NER»: un Negro que ninguna de las dos reglas vio

**Qué pasó.** El 2026-10-26 se creó a mano el color «NER» (nombre y código «NER», #100f0f, familia «tierra»): era Negro
con otro nombre. Pasó 19 días sin uso, hasta que el lector de colores de la foto (ADR-0663, 13-nov) empezó a
proponerlo: va al color más cercano de la carta, y una prenda negra fotografiada (#0a0a0a–#1f1f1f) queda más cerca de
#100f0f que del Negro oficial (#2D2C2F). El 14-nov salieron en «NER» tres prendas (POL-0083, PAN-0039, PAN-0041), una de
ellas ya publicada en la tienda web, cuando del 9 al 12-nov las 32 prendas negras se habían registrado en Negro.

**Por qué este ADR no lo frenó, ni hoy lo frenaría.** Por nombre, «NER» no se parece a «Negro» (no es plural, ni
femenino, ni un error de una letra). Por tono, ΔE2000 = 9,0 con la luz entera, y el aviso salta bajo 8.

**Decidido (Felipe, 2026-11-15: «hay que hacer una fusión y que quede por defecto el negro»).**
1. **La fusión** (`20261115010000`, solo datos, ya corrida en producción): cada variante «NER» pasa a Negro con la regla
   de ADR-0263 D-137 (mismo id, stock e historia; código nuevo y el viejo en `codigos_barras`, así las etiquetas pegadas
   siguen sonando); las fotos siguen al color; «NER» queda archivado, no borrado, y su nombre sigue tomado.
   POL-0083 ya lo había corregido el equipo a mano desde su ficha; la migración tomó lo que quedaba (5 variantes).
2. **Un nombre no puede ser un código de 3 letras** (`nombrePareceCodigo`, `lib/color-alta-reglas.ts`): la hoja de
   «Nuevo color», Atributos y la API (`POST` y `PATCH /api/productos/colores`) lo frenan con «Escribe el nombre del color
   en palabras, no su código de 3 letras». «Ner», «Oro» o «AZUL» pasan.
3. **Los neutros de los extremos se comparan con la luz a la mitad** (`coloresParecidos`, `lib/color-parecido.ts`): casi
   negro y casi blanco (croma < 6 y L* < 25 o > 92) usan kL = 2, la regla CMC 2:1 de los textiles; ahí casi toda la
   diferencia es de luz, y la luz la pone la cámara. «NER» frente a Negro baja a 4,9 y avisa por tono.

**Lo que se midió y se descartó.** Comparar todo con kL = 2 llevaba los pares de la carta de producción bajo 8 de 26 a
81, y avisaba de colores distintos de verdad (Gris y Gris melange, Negro y Gris antracita, Amarillo y Mostaza): un aviso
que salta sobre lo correcto se aprende a ignorar. Solo en los neutros de los extremos, los pares pasan de 26 a 27 y el
único que se suma es Negro con «NER».

**Lo que sigue sin cubrir.** Un «Negro intenso» bien escrito y a ΔE ≥ 8 de todos seguiría robándole fotos a Negro: el
lector toma el más cercano y no sabe qué color es el «de siempre». Y en la carta de producción hay tres colores cuyo
nombre es el sinónimo de otro (Guinda y Vino, Crema y Crudo, Cafe y Marrón): cuál se queda lo decide Felipe (backlog de
la rama `ccr-04db1aff-33k8lo`).
