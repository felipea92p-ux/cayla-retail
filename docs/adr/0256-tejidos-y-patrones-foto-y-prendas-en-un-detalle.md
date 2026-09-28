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

- **La foto todavía no se ve al crear o editar un producto**: el alta (paso 3, `ElegirTejido`, patrón en
  `NuevoProductoForm`) y la ficha (`ProductoForm`) siguen con el dibujo. Hay que leer `imagen_muestra_url` en
  `lib/alta-producto-datos.ts` y pasarla a `MuestraTejido`/`MuestraPatron` (ya aceptan `imagenUrl`). No se hizo aquí
  porque otra sesión estaba tocando ese paso el mismo día (`claude/ver-mas-tejidos-4f8aea`).
- Las fotos reemplazadas no se borran del bucket (regla de no borrar; pesan ~300 KB cada una).
- En local, el contenedor de Storage (1.72.1) es más viejo que su esquema y **rechaza toda subida** (`42P10` en
  `ON CONFLICT (name, bucket_id)`), también la de fotos de prenda. La subida real se probó hasta la vista previa; el
  guardado, el candado de URL y «Quitar foto» se probaron contra la ruta local. En producción el mismo `upload` de
  supabase-js funciona (fotos de prenda subidas el 2026-09-28).
