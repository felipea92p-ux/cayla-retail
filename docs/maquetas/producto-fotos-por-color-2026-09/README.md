# Spike visual · Fotos por color en «Editar producto» (2026-09-29)

> **Estado: Felipe eligió C (2026-09-29) y está construida — ver [ADR-0279](../../adr/0279-fotos-por-color-en-editar-producto.md).** Este documento queda como registro del spike y del porqué; la pantalla real ya no es esto, es `components/ficha-producto/FotosPorColor.tsx`.

`spike.html`: un solo archivo, se abre con doble clic en el navegador. Es la ficha real de «Editar producto»
(`/productos/[id]/editar`) con datos inventados; nada se guarda. Pedido de Felipe, con dos capturas (CMS-0001 y el
paso 3 del alta): *agregar la imagen de un color no es obvio para algunos colaboradores; el combo de colores de cada foto
lista todos los colores y no solo los de la prenda; al editar el color debería aparecer una lista, fila o rectángulo
«color tal → agregar imagen de referencia», como al crear un producto.*

Arriba, una barra punteada con los controles (no es parte del ERP): **Versión** (Hoy · A · B · C), **Ancho**
(Escritorio · Tablet 820 · Celular 390), **Prenda** (5 casos, ver abajo) y **↺ Reiniciar caso**. Se pueden tocar las
fotos (⋯), agregar una (la maqueta la inventa: en el ERP se abre antes la revisión del ADR-0228), pasarla de color,
marcarla principal, quitarla, y **+ Agregar color** (abre la hoja con su casilla de foto). Sale la barra «Tienes N cambios
sin guardar» con las mismas frases del ERP (`lib/producto-cambios-reglas.ts`), y «Revisar y guardar» abre la hoja.
Enlace directo (solo en un navegador normal, no en el panel de Claude): `spike.html#v=B&caso=huerfana&ancho=celular`.

## El problema, leído del código (`main`, `58b4601e`)

1. **Cada color y su foto viven en dos lugares que no se hablan.** La sección «Fotos» (`FotosProducto.tsx`) es una
   galería suelta; los colores viven abajo, en «Variantes». El único puente es un combo bajo cada foto.
2. **Ese combo lista los 71 colores del catálogo, no los de la prenda.** `ProductoForm.tsx:1063` le pasa
   `colores={colores}`, que es el vocabulario entero (`coloresVocabulario`). La prenda de la captura tiene 4.
3. **La foto nace sin color.** `FotosProducto.subir` crea cada foto con `colorCodigo: null` (línea 126). Y
   `fotoDeVariante` (`lib/producto-fotos-reglas.ts:28`) usa esas fotos sin color para **todos** los colores que no tengan
   la suya. Quien sube 4 fotos sin tocar los combos —lo esperable, porque no se nota que hay que tocarlos— deja las 4
   como «generales» y cada color muestra la principal: en Vender, Traslados y Productos el Rosado se ve con la camisa Celeste.
4. **Un color sin foto no se nota en ninguna parte.** No hay fila, ni marca, ni cuenta.
5. **Dos formas de resolver lo mismo.** El alta ya puso la foto en la fila de su color (`MatrizVariantes.tsx`, «Color y
   fotos», cámara y «agrega su foto»). La edición sigue con la galería suelta. Una de las dos está mal (Brooks).

**La causa raíz no es el combo largo: es que la foto nace sin color.** Acortar el combo a 4 opciones (un cambio de una línea)
ayuda, pero no arregla que nadie sepa que tiene que usarlo. Por eso las tres versiones hacen que **la foto nazca dentro
de un color**: se agrega desde su fila, su tarjeta o su cabecera.

## Lo que comparten las tres versiones

| Hoy | Propuesta |
|---|---|
| Galería suelta, el color se elige después en un combo | **La foto se agrega desde el color**, y nace con ese color |
| Combo con 71 colores | **Solo los colores de la prenda** (los de `coloresConVariantesActivas`, ya calculados en `ProductoForm.tsx:350`) **+ «Todos los colores»** |
| Un color sin foto no se nota | Se lee «**Sin foto todavía**» (ámbar), o «usa la general» si hay una, y arriba una cuenta: «**3 de 4** colores con foto» |
| Foto sin color, sin explicación | Se llama **«Todos los colores»** (igual que en el alta), es opcional, y trae la pregunta *«¿Es de un solo color? Tócala y pásala a su color»* |
| **+ Agregar color** solo agrega variantes | La hoja trae **«Foto de referencia (opcional)»**: se agrega el color y su foto en el mismo gesto, como en el alta |
| Reordenar con ‹ › al pasar el mouse (no existe en tablet) | Cada foto lleva un **⋯ siempre visible**: *Usar como principal · Ponerla primera en su color · Pasar a otro color… · Quitar* |
| Una foto de un color que ya no está en la prenda queda escondida | Un bloque ámbar aparte: *«1 foto es de un color que ya no está… elige a qué color pasa o quítala»* |

## Las tres formas de ponerlo

| | Qué es | Ganas | Pagas |
|---|---|---|---|
| **A · Lista por color** | «Fotos» pasa a **«Fotos por color»**: una fila por color (punto + nombre + estado, y sus fotos). Un color vacío muestra un rectángulo punteado grande *«Agregar foto de Beige»*. En «Variantes», la cabecera de cada color lleva una **miniatura-enlace** que salta a su fila. | Varias fotos por color a la vista, sin hoja aparte; la ficha de variantes no se toca; el mismo «color + cámara» del alta (aunque la fila es más alta que la del alta). | Es la más alta: con 8 colores la sección mide ≈ 1.220 px (741 con 4); en celular ≈ 1.820. Cada color aparece una vez más. |
| **B · Foto dentro de cada color** | «Fotos» desaparece. La foto vive en la cabecera de cada color **dentro de «Variantes»** (cámara o miniatura de 52 px), igual que la tabla del alta. «Todos los colores» va en una franja sobre los grupos. | Cada color una sola vez; al agregar un color, su cámara ya está donde uno está trabajando. | Fotos mezcladas con precios y stock en un mismo componente (`VariantesFicha.tsx` ya tiene 672 líneas); miniaturas chicas; se pierde ver todas las fotos juntas; el enlace `#fotos` de la pantalla de éxito del alta hay que re-apuntarlo. |
| **C · Tarjetas por color** | «Fotos por color» como **un rectángulo 4:5 por color**: la portada de ese color, o un rectángulo punteado *«Agregar foto de Beige»*. Varias fotos de un color se ven y manejan en una hoja («Fotos de Celeste»). | Lo más literal a «un rectángulo por color», y lo más parecido a la galería que ya conocen y a cómo se ve en Productos; el más compacto con muchos colores (8 colores ≈ 330 px en escritorio). | Manejar 2+ fotos de un color cuesta un toque más (la hoja); en celular son 2 por fila. |

**Recomiendo C.** Es lo que Felipe describió («un rectángulo de color tal, agregar imagen de referencia»), se parece a la galería
que los colaboradores ya conocen (menos que reaprender) y es la más compacta: medido en la maqueta a 1180 px de ancho, con 8
colores C mide ≈ 640 px y A ≈ 1.220; con 4 colores (la prenda de la captura), 387 contra 741. Un rectángulo vacío y punteado
con el nombre del color no se puede no ver, ni en tablet. Lo que se paga: varias fotos de un color van en una hoja. Como
`fotoDeVariante` muestra **una** foto por color, lo normal es una por color y la hoja se usa poco. **A** es la mejor si se
quiere ver y ordenar varias fotos por color sin abrir nada. **B** es la más fiel al alta, pero enreda las fotos con los precios.

## Los casos del spike (botón «Prenda»)

| Caso | Qué prueba |
|---|---|
| Como la captura | 4 colores, 4 fotos, una por color (el estado de la primera captura) |
| Colores sin foto | Solo Celeste tiene foto: se ve cómo pide la de los demás y cómo cambia la cuenta |
| Con foto general | Una foto sin color + la de Celeste: «usa la general» y la pregunta «¿es de un solo color?» |
| Foto de un color que ya no está | Una foto de Verde oliva en una prenda que ya no lo tiene: el bloque ámbar |
| Mucho de todo | 8 colores, 12 fotos, 3 tallas: densidad y largo de cada versión |

**Estados imposibles (Lamport), qué hace la pantalla con cada uno:** una prenda con exactamente una foto principal (al quitar
la principal pasa la primera restante; al subir la primera de todas, queda principal: la lógica de hoy); una foto sin color
de una prenda de **un solo color** no muestra la fila «Todos los colores» salvo que ya exista alguna; una foto de un color sin
variantes activas no se pierde ni se esconde: se avisa y se pide decidir.

## Lo que NO cambia

- **El modelo:** `producto_fotos.color_codigo` (null = «Todos los colores»), `orden`, `es_principal`. **Sin migración.**
- La regla de qué foto ve cada variante (`fotoDeVariante`) y cómo las fotos siguen a un color corregido
  (`mudanzasAlGuardar`, `fotosComoSeVen`, `anclarFotos` en `lib/variantes-ficha-reglas.ts`).
- La barra «Tienes N cambios sin guardar» y la hoja «Revisa y guarda» (ADR-0257) y sus frases de fotos.
- La revisión de cada foto antes de subirla (`RevisarFotosModal`, ADR-0228) y la subida inmediata a `retail-productos-fotos`.
- La edición simultánea (ADR-0193): las fotos viajan en el mismo guardado con su `version`.

## Decisiones de Felipe (2026-09-29)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Cuál versión? | **C · Tarjetas por color.** |
| 2 | ¿Qué hacemos con las fotos ya guardadas sin color? | **Contar primero en producción** (hecho, abajo). |

### El conteo en producción (solo lectura, `cayla-dynamic`, 2026-09-29)

| Qué se contó | Cifra |
|---|---|
| Prendas en el catálogo | 8 (5 con 2 o más colores activos) |
| Prendas con alguna foto | **1** |
| Fotos sin color en prendas de 2+ colores | **0** |
| Prendas con una foto de un color que ya no está en la prenda | **0** |
| Colores activos en total | 15 |
| Colores que se ven **sin ninguna foto** (ni suya ni general) | **11 de 15 (73 %)** |

Qué dice: **el problema de hoy no es que haya fotos con el color mal puesto: es que casi ningún color tiene foto.** La única
prenda con fotos (la de la captura) tiene las 4 con su color. Es una muestra chica (un catálogo de prueba, ver la nota del
2026-09-24), así que no prueba que el riesgo de «foto que nace sin color» no exista: prueba que **todavía no hizo daño**.
Consecuencias para la construcción:

- **No hace falta aviso al abrir la prenda ni limpieza de datos.** Alcanza con la pregunta «¿es de un solo color?» en la foto general.
- **Lo que sí paga es el rectángulo vacío grande y la cuenta «3 de 4 colores con foto»**: el hueco real es que nadie sabe que falta.
- El bloque ámbar de «foto de un color que ya no está» maneja un estado que hoy tiene 0 casos. Se queda porque el esquema lo
  permite (desactivar el último color de una prenda) y sin él esa foto quedaría escondida sin aviso; es la pieza más fácil de quitar si estorba.
- **Volver a contar antes de publicar** (`producto_fotos` con `color_codigo is null` en prendas de 2+ colores): el catálogo
  crecerá y este cero puede dejar de serlo.

## Cómo se portaría (estimado)

- **Primer commit, independiente de A/B/C (Beck):** `ProductoForm.tsx:1063` pasa `coloresFicha` (los de la prenda) en vez
  del vocabulario. Cierra el reclamo del combo de 71 y no espera esta decisión.
- **C (elegida):** componente nuevo `components/ficha-producto/FotosPorColor.tsx` (props: `colores` de la prenda, `fotos`, `onFotos`) que
  reemplaza a `FotosProducto` en `ProductoForm`; la subida y la revisión se extraen de `FotosProducto` a un hook compartido.
  `AgregarColoresModal.tsx` gana la casilla de foto opcional. Reglas puras y testeadas en `lib/fotos-por-color-reglas.ts`
  (filas por color, huérfanas, texto de estado). Mantiene `id="fotos"`.
- **B:** lo mismo dentro de `VariantesFicha.tsx` (la cabecera de cada color), y se quita la sección «Fotos».
- **C** suma, sobre lo de A, una hoja `<Modal variante="hoja">` por color («Fotos de Celeste») para varias fotos.
- Celular obligatorio solo aplica a Vender, Cambios y Devoluciones (PL-105); esta pantalla se probó a 375 px de todos modos.

## Antes de decir «listo» (las tres preguntas)

- **Concurrencia:** dos personas editando la misma prenda ya chocan por `version` (ADR-0193, `PT409`): la segunda que guarda
  es rechazada y tiene que recargar, y las fotos entran en ese mismo guardado. Lo que ya pasa hoy y no cambia: la foto se sube
  al almacén apenas se elige, así que la que se descarta o se pierde por ese choque queda como archivo sin usar.
- **Caída externa:** si Storage no responde, la foto no sube y el aviso lo dice (`avisar.error`, como hoy); el resto de la ficha
  se guarda. Sin cambio.
- **Persona sin contexto:** la fila vacía dice «Agregar foto de Beige», no hay nada que aprender antes. Falta probarlo con una
  colaboradora real, con la maqueta en una tablet.

## Lo que la maqueta simula

El selector de archivos (la foto aparece al instante), la revisión de la foto, y el guardado. Las camisas son una ilustración
del color: no son fotos.
