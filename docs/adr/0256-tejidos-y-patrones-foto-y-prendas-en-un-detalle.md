# ADR-0256 · Tejidos y Patrones: foto de muestra y prendas, en un detalle

- **Fecha:** 2026-09-28 · **Estado:** aceptado. Solo web, **sin migración**: la columna y el bucket ya estaban en
  producción (verificado en vivo el 2026-09-28).
- **Pedido:** Felipe, 2026-09-28: «en tejidos y patrones no se puede editar la imagen o ilustración asociada, y no se
  pueden ver las prendas asociadas; que se pueda hacer clic, abra un modal y acceder a todo eso».
- **Complementa:** ADR-0061 (muestra de color: columna simple + bucket público), ADR-0106 (Colores dejó de usar foto),
  ADR-0136 (regla de modales), ADR-0161 (combo «Responsable» en todo guardado).

## Qué había

- La «imagen» de cada tejido y patrón era un **dibujo que sale del nombre** (`lib/tejido-visual.ts`,
  `lib/patron-visual.ts`): «Denim» → sarga índigo. Un nombre que no calza con ninguna familia salía «Sin muestra», y
  no había cómo arreglarlo desde la pantalla.
- `tejidos.imagen_muestra_url` y `patrones.imagen_muestra_url` **existen en producción desde el 2026-09-18**
  (`20260918171000`, reconstruida desde el vivo), con el bucket público `retail-colores-muestras` y sus políticas. Nadie
  las leía ni las escribía: 0 de 24 tejidos y 0 de 9 patrones con foto.
- Las prendas que usan un tejido solo aparecían como un número en el error de «Desactivar» («No se puede desactivar: 3
  productos activos todavía usan este tejido»), sin decir cuáles. En producción 31 de 33 productos tienen tejido y patrón.

## Decisión

1. **Un detalle por clic en la tarjeta** (`components/DetalleMuestraModal.tsx`, el mismo para Tejidos y Patrones):
   arriba la muestra en grande —la foto si existe, si no el dibujo— y abajo las prendas que la usan, activas primero,
   con su foto principal, código y categoría; las descontinuadas con su chip. Quien ve Productos entra a la ficha de
   cada una. Solo la parte de arriba de la tarjeta es el botón: Aprobar/Desactivar quedan fuera, así un clic en ellos
   nunca abre el detalle. Cada tarjeta dice además cuántas prendas lo usan.
2. **La foto se guarda en la columna que ya existía**, no en una tabla nueva: es una sola foto por tejido (1:1, mismo
   razonamiento que ADR-0061). Se sube del navegador al bucket (`tejidos/<uuid>.jpg`, `patrones/<uuid>.jpg`) reducida a
   1600 px en JPG (`lib/muestra-atributo.ts`) y recién el PATCH la deja en la base.
3. **Nada se guarda al elegir el archivo.** Se ve cómo queda («Así se verá. Todavía no se guardó»), se elige el
   Responsable y «Guardar foto» sube y guarda. «Quitar foto» hace lo mismo al revés: vuelve el dibujo.
4. **La ruta no acepta cualquier URL** (`leerUrlMuestra`, `lib/muestra-atributo-reglas.ts`): solo una del bucket
   `retail-colores-muestras`, en la carpeta de su tipo y con un nombre de archivo simple. Quién puede guardarla lo sigue
   decidiendo la base (`tejidos_update_lider` / `patrones_update_lider` → `fn_puede_editar_catalogo()`).
5. **Las prendas se leen al abrir el detalle**, no con la pantalla: la grilla solo necesita el conteo (una lectura de
   `productos (id, tejido_id, patron_id)` por páginas, solo en esas dos pestañas).

- **DECIDÍ:** columna existente + bucket existente + validación de la URL en la ruta.
- **DESCARTÉ:** una RPC `guardar_muestra` que reciba solo la ruta dentro del bucket, porque exigía una migración a
  producción (y su ensayo) para algo que la RLS ya protege; el candado de «quién» ya está en la base, y el de «qué URL»
  cabe en la ruta.
- **SE ROMPE SI:** alguien escribe `imagen_muestra_url` por fuera de la ruta (SQL Editor, otra pantalla): la base no
  valida la URL, solo quién escribe. Y si dos Líderes suben una foto al mismo tejido a la vez, gana la última y la otra
  queda huérfana en el bucket (mismo riesgo ya aceptado en ADR-0061; nada se pierde de la base).

## Qué queda fuera

- ~~La foto todavía no se ve al crear un producto~~ **Hecho el mismo día** (pedido de Felipe): el paso 3 de Nuevo
  producto muestra la imagen elegida en cada tarjeta de Tejido (también en «Ver más») y de Patrón.
  `getContextoAlta` devuelve `imagenes: { tejidos, patrones }` (id → URL) aparte de `universo`, para no ensanchar
  `ValorVocabulario`, que también usan las tallas. **Sigue fuera:** la ficha de un producto existente (`ProductoForm`),
  que lee sus patrones por otro camino.
- Las fotos reemplazadas no se borran del bucket (regla de no borrar; pesan ~300 KB cada una).
- En local, el contenedor de Storage (1.72.1) es más viejo que su esquema y **rechaza toda subida** (`42P10` en
  `ON CONFLICT (name, bucket_id)`), también la de fotos de prenda. La subida real se probó hasta la vista previa; el
  guardado, el candado de URL y «Quitar foto» se probaron contra la ruta local. En producción el mismo `upload` de
  supabase-js funciona (fotos de prenda subidas el 2026-09-28).

## Actualización 2026-09-28 (tarde): dibujo generado desde una frase

**Pedido:** Felipe, probando en local: «que se generen dibujos automáticamente al añadir alguna, opcional; una breve
descripción y el sistema genera el dibujo; el usuario decide si le gusta, si lo usa o mejor sube una foto».

**Decisión de Felipe (entre tres opciones): generador propio, sin IA.**

- **Cómo funciona** (`lib/dibujo-generado.ts`, puro, 23 pruebas): la frase se lee por palabras clave. De ahí salen la
  familia (rayas, cuadros, lunares, floral, animal print, estampado; o la textura de un tejido: trama, lino, sarga,
  punto, canalé, piqué, pelo, satinado), los colores **del catálogo real** (`colores.hex` con sus sinónimos: «navy»
  → Azul marino, «guinda» → Vino; «azul marino» gana sobre «azul»), cuál es el fondo («sobre…», «fondo…»), la escala
  («finas», «anchas») y la orientación de las rayas. Arma un SVG determinista y propone tres variantes (fina, media,
  ancha); «Otras variantes» cambia la semilla, la orientación y, si la frase no fijó el fondo, invierte dibujo y fondo.
- **La pantalla dice qué entendió** («Entendí: Floral · Rojo sobre Crudo con Verde oliva») y, si no reconoció el dibujo,
  lo dice y sugiere palabras que sí conoce. Así el límite del generador queda a la vista y quien escribe corrige la
  frase.
- **Dónde:** en el detalle, «Generar dibujo» junto a «Subir foto» (la propuesta marcada se ve en grande arriba); y en
  «Nuevo tejido / patrón», un campo opcional «Cómo se ve»: si se llena, al guardar se abre el detalle con las
  propuestas ya hechas. Solo para quien puede editar el catálogo (quien no, igual no podría guardar la imagen).
- **Se guarda igual que una foto:** «Usar este dibujo» pinta el SVG en un JPG de 1200×600 (`svgAArchivo`) y sigue el
  mismo camino: vista previa, Responsable, «Guardar dibujo» → bucket → `imagen_muestra_url`. Sin columna nueva, sin
  migración; el SVG (texto) nunca se guarda ni se inyecta en la página, solo se muestra como `<img>` `data:`.

- **DECIDÍ:** generador por reglas con los colores del catálogo.
- **DESCARTÉ:** pedirle el dibujo a Claude (IA), porque exigía una clave de Anthropic en Vercel, ~1-3 céntimos de dólar
  y 5-20 s por dibujo, y una API que puede no responder; y un patrón de tela es geometría que se repite, que las reglas
  cubren. Queda como posible botón «Intentar con IA» si un día hace falta dibujar algo fuera de estas familias.
- **SE ROMPE SI:** alguien describe algo fuera de las familias («paisley», «flores con loros»): sale un estampado
  genérico o flores simples en esos colores. La pantalla lo avisa, pero no lo dibuja; para eso está «Subir foto».

**Quedan dos formas de dibujar lo mismo** (lo dijo el propio pedido): el dibujo automático por nombre
(`MuestraTejido`/`MuestraPatron`, tonos fijos a mano) y este generador (paramétrico, con el catálogo). No se unificaron
aquí para no cambiar cómo se ven hoy las 33 tarjetas sin foto; unificarlas —que el automático sea el generador con la
frase vacía— es el siguiente paso natural (BACKLOG).
