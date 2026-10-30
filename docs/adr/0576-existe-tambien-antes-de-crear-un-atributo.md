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
   - **pregunta** — casi igual, o un sinónimo cargado («piel» → Nude): puede ser el mismo. «Guardar» espera a que la persona diga «No, «X» es otro color»; la pregunta vuelve si cambia el nombre.
   - **avisa** — solo el tono (colores): se ve parecido, se deja guardar. «Blanco» y «Crudo» se parecen y son dos colores.
4. **UNA pieza visual:** `components/ui/ExisteTambien.tsx` (`useExisteTambien` + `<ExisteTambien>`) sobre `PreguntaParecido`, la misma caja ámbar de marcas y proveedores. Dice **qué existe y por qué se parece** («Verde oliva · casi el mismo nombre»), **qué se rompe** si se duplica («su stock se parte en dos»; la frase cambia por vocabulario, `VOCABLOS`) y ofrece «Ver X» (cierra la hoja y deja la lista buscándolo) o, en Nuevo producto, «Elegir X» / «Usar X». Con el botón de guardar apagado, su `title` dice por qué.
5. **Colores: nombre y tono, una sola lista** (`coloresQueYaExisten`): la pregunta por NOMBRE va bajo el campo Nombre; la de TONO, junto al selector del color (si apareciera arriba al elegir el tono, movería el selector bajo el mouse).
6. **Al editar, solo si cambió el nombre** (colores, familias, categorías): una prenda que ya convive con un parecido no puede quedar sin poder editarse por eso.
7. **Por nombre entran también los desactivados** (la base rechaza un nombre que ya tuvo un color): la fila dice «desactivado». Por tono, solo los que se pueden elegir.
8. **Se borró `colorConEseNombre`** (solo nombre exacto o sinónimo): quedó superada; el ejemplo de la caja de nombre (ADR-0290) ahora evita también lo «casi igual».

## Qué se midió

- **La carta oficial de CAYLA no se acusa a sí misma:** los 90 colores contra los otros 89, cero coincidencias (`lib/atributo-parecido.test.ts`). La primera versión acusaba «Morado» con «Dorado»; de ahí el piso de 8 letras. Una regla que grita sobre un vocabulario limpio enseña a tocar «No, es otro» sin leer.
- **Navegador (andamio bajo `/login`, datos inventados):** «Verde Olivo» → pregunta con «Verde oliva» y guardar apagado; «No, es otro» → la caja se va y la guía pasa a Familia; «verde OLIVA» → «ya existe», sin «No, es otro»; «Verde pacay» → nada; solo-tono → avisa sin frenar; nombre de un desactivado → «mismo nombre · desactivado»; Editar sin cambiar el nombre → no pregunta; renombrar a «Verde olivo» → pregunta. Patrones («Raya», «Cuadro»), tallas («xl», «XXL», «39»), tejidos («Jerseys 30/1», «Jersey 28/1», «Algodón pima») y familias («Calzados»), también; y en Nuevo producto, «+ Nuevo color» (sinónimo «Piel», «Verde olivo», «Elegir»), «+ Nuevo patrón» («Raya», «Usar Rayas», «No, es otro») y «+ Nueva talla». Sin scroll horizontal a 375 px (colores). **No se probó en el navegador** la hoja de categorías y subcategorías (solo `tsc` y sus pruebas) ni «+ Nuevo tejido» de Nuevo producto (mismo código que patrón).

## Qué no cubre (dicho sin adornos)

- **No corrige lo que ya existe.** «Verde Olivo» ya está creado en producción; aviso hacia adelante no lo arregla. Unirlo con «Verde oliva» mueve prendas (`variantes.color_codigo`) y hoy no hay «fusionar color»: es una decisión de datos aparte, con dinero y stock de por medio.
- **Sin candado en la base para el «casi igual»** (ver arriba).
- **Sin sentido ni otros idiomas:** «Navy» y «Azul marino» solo se encuentran si «Navy» está cargado como sinónimo.
- **Fuera de alcance:** Marcas y Proveedores (ya tenían su pregunta), Temporadas (lista cerrada de nueve), Insignias y Etiquetas, y la tela de Insumos (`tela-nueva-reglas` ya usa `nombresParecidos`).
- **No probado con una cuenta real:** el andamio monta los componentes reales con listas inventadas; no pasó por la base.

## Archivos

`lib/atributo-parecido.ts` (+ prueba) · `lib/nombres-parecidos.ts` (tres opciones) · `lib/color-alta-reglas.ts` · `components/ui/ExisteTambien.tsx` · `components/{ColoresLista,TallasLista,TejidosLista,PatronesLista,FamiliasLista,CategoriasLista}.tsx` · `components/alta-producto/{NuevoColorAlta,ProponerValor}.tsx` · `lib/sugerencias-alta-producto.ts` · guías de Atributos, Categorías y Familias (`lib/guias/pantallas/catalogo.ts`) y la huella de diez pantallas.
