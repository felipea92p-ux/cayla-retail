# Innovar · Recibir ▸ la galería de la prenda que ya existe — 2026-11-14

> **Pasada rápida — sin escéptico, puede traer ideas que no aguantan.** Corrida sobre lo que se construyó en la tarea 9 del tablero de Recibir (PR #1862).

- **Alcance:** `/recibir/envio/[id]` ▸ «Ya la tenemos» y «¿Esta prenda ya existe?» · **Modo:** rápido (sin agentes y sin web; la fuente es el radar)
- **SHA analizado:** `2d72b325f` (rama `claude/recibir-galeria-existente-b8590e`, sobre `origin/main` `691cb0677`) · **Radar usado:** 2026-11-13
- **Corrieron:** el coordinador solo, con el radar · sin escéptico
- **Resultado:** 6 propuestas (3 Ahora · 3 Visión) · 3 descartadas · 2 derivadas
- **Se cuidó no repetir** las 30 tareas del tablero de Recibir (`docs/backlog/2026-11-13-merchandise-receipt-diagram-398372.md`): donde una idea se roza con una, se dice cuál.

## Qué es y qué problema resuelve hoy

Una reposición casi nunca llega con su nombre: quien recibe la reconoce por la foto. Desde el PR #1862, al agregar un modelo y decir «Ya la tenemos»
(o al corregir uno contado como nuevo), aparece una cuadrícula de fotos de ~130 px con nombre, marca, código y colores. Al escribir quedan solo las
que coinciden y primero las marcas del envío (`lib/recepcion-galeria-reglas.ts`); tocar una la elige, y la ficha queda a un toque. Asociar una
prenda pasó de unos 8 toques a 4. Lo que sigue costando: encontrarla cuando la categoría tiene decenas de prendas parecidas y nadie sabe su nombre.

## Lo que Felipe eligió (2026-11-14)

#1 y #3, con un agregado suyo: «los que tengan el mismo precio y costo, para que se vayan ordenando arriba las más parecidas». Se hicieron en el PR #1862. #2 y la visión quedan como propuestas.

## Ahora

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-galeria#1 | La tarjeta dice «Ya en tu lista» antes de tocarla | quien recibe | Linear (avisa del duplicado antes de crear) | 2 | S | Alta | 2,0 |
| recibir-galeria#2 | Elegir con el teclado: flechas entre las fotos, Enter elige | quien recibe en el Mac mini | Linear y Superhuman (modo solo teclado) | 2 | S | Media | 1,4 |
| recibir-galeria#3 | Primero lo que este proveedor ya te mandó, con su porqué | quien recibe | Shopify POS (recibir desde la compra), Linear (sugerencia con su porqué) | 3 | M | Media | 1,05 |

## Visión

| # | Propuesta | Para quién | Referente | Impacto | Esfuerzo | Confianza | Puntaje |
|---|---|---|---|---|---|---|---|
| recibir-galeria#4 | El código de la etiqueta del proveedor se aprende: la próxima vez, un disparo de la pistola | quien recibe | Shopify POS (recibir escaneando) | 4 | L | Media | 0,93 |
| recibir-galeria#5 | Una foto de la prenda en la mano ordena la galería por parecido | quien recibe | Lightspeed AI y Shopify Magic (IA sobre la foto), visión de Claude | 4 | L | Baja | 0,53 |
| recibir-galeria#6 | La foto del papel de la compra propone los modelos y su prenda que ya existe | quien recibe, Compras | Visión de Claude sobre facturas y PDF | 5 | XL | Baja | 0,40 |

## Detalle de cada propuesta

### recibir-galeria#1 · La tarjeta dice «Ya en tu lista» antes de tocarla  ·  Ahora · impacto 2 · esfuerzo S · confianza Alta
- **Hoy:** que la prenda ya está en el envío se sabe recién al elegirla: el botón cambia a «Ir a contarla» (`elegidaEnLista`, `NuevoModelo.tsx:138`).
- **Propuesta:** la tarjeta que ya está en la lista lleva un `<Chip>` «En tu lista» sobre la foto. Tocarla sigue llevando a contarla. Es un cálculo puro
  (`paradaDelNombre` ya existe), sin base.
- **El momento que mejora:** el fardo trae dos bolsas del mismo modelo; la segunda vez, quien recibe ve que ya lo agregó y no duda.
- **Cómo lo hacen los mejores:** Linear sugiere los duplicados antes de crear y dice por qué (radar, referentes #40;
  [fuente](https://linear.app/docs/triage-intelligence), consultado 2026-11-13).
- **DECIDÍ** marcar la tarjeta y no esconderla: puede que la persona quiera ir a contarla. **DESCARTÉ** un aviso aparte: es otra frase a la vista.
  **SE ROMPE SI** dos prendas se llaman igual en marcas distintas: `paradaDelNombre` compara por nombre; hay que comparar por `productoId`.
- **Primer paso:** pasar a `ElegirPrendaExistente` los `productoId` que ya están en la lista.

### recibir-galeria#2 · Elegir con el teclado  ·  Ahora · impacto 2 · esfuerzo S · confianza Media
- **Hoy:** en el Mac mini, se escribe en el buscador y después hay que ir al mouse para tocar la foto. Tab recorre las tarjetas una por una.
- **Propuesta:** con el cursor en el buscador, ↓ entra a la galería; las flechas se mueven por la cuadrícula (dos dimensiones); Enter elige; otro Enter
  confirma («Sí, es esta»). Con el patrón de `useFlechasDelCajon` (que ignora la flecha de un campo) y sin robarle el Escape a la hoja (ADR-0136).
- **El momento que mejora:** escribir «crop» y elegir la tercera sin soltar el teclado.
- **Cómo lo hacen los mejores:** Linear (modo solo teclado) y Superhuman (radar, referentes #35;
  [fuente](https://linear.app/docs), consultado 2026-11-13).
- **DECIDÍ** solo flechas y Enter, sin atajos de letras: nadie los aprende en Recibir. **DESCARTÉ** la paleta Cmd+K para esto: es de todo el ERP
  (referentes #35), no de una hoja. **SE ROMPE SI** el número de columnas cambia con el ancho: la flecha arriba/abajo debe leer las columnas reales.
- **Primer paso:** la regla de movimiento en la cuadrícula, pura y con su prueba (`lib/recepcion-galeria-reglas.ts`).

### recibir-galeria#3 · Primero lo que este proveedor ya te mandó  ·  Ahora · impacto 3 · esfuerzo M · confianza Media
- **Hoy:** el orden pone primero las marcas del envío y después el nombre (`galeriaDePrendas`). No sabe qué se recibió antes de ese proveedor.
- **Propuesta:** una función de solo lectura dice, por prenda de la categoría, cuándo llegó por última vez de este proveedor. La galería pone primero
  lo repuesto hace poco y lo dice en la tarjeta («Llegó el 2 de nov»): una reposición es casi siempre algo que ya vino.
- **El momento que mejora:** 40 blusas en la categoría y 6 de ellas son las que ese proveedor trae cada mes: quedan arriba.
- **Cómo lo hacen los mejores:** Shopify POS 11.8 recibe la mercadería desde la orden de compra, que ya dice qué se espera (radar, referentes #5;
  [fuente](https://www.shopify.com/blog/shopify-retail-roundup-june-2026), jun-2026); Linear muestra por qué sugiere (referentes #40).
- **DECIDÍ** ordenar y decir el porqué, nunca esconder lo que no vino antes. **DESCARTÉ** un puntaje de parecido: con 3 tiendas no hay volumen para
  aprenderlo. **SE ROMPE SI** el envío no tiene proveedor (sin aviso): entonces no cambia nada.
- **Primer paso:** contar en local cuántas reposiciones de un mes vienen de prendas recibidas antes del mismo proveedor.

### recibir-galeria#4 · El código de la etiqueta del proveedor se aprende  ·  Visión · impacto 4 · esfuerzo L · confianza Media
- **Hoy:** las prendas de marca llegan con la etiqueta de su proveedor, pero ese código no se guarda (no hay columna para él: `grep codigo_proveedor` no
  encuentra nada). Cada reposición se reconoce a ojo.
- **Propuesta:** la primera vez que se asocia una prenda, se ofrece escanear la etiqueta del proveedor y se guarda junto a la variante. La siguiente
  vez, un disparo de la pistola en el buscador de Recibir la encuentra sola.
- **El momento que mejora:** el fardo de CLAURE del mes que viene se cuenta escaneando, sin buscar fotos.
- **Cómo lo hacen los mejores:** Shopify POS recibe escaneando (radar, referentes #5, ADOPTAR;
  [fuente](https://www.shopify.com/blog/retail-roundup-february-2026), mar-2026).
- ⚠ **Toca lo delicado (modelo de datos del catálogo):** una tabla o columna nueva. Espera el OK de Felipe.
- **DECIDÍ** que el código se aprenda al recibir, no que alguien lo cargue antes. **DESCARTÉ** reemplazar nuestro código: la etiqueta de CAYLA sigue
  siendo la de la tienda. **SE ROMPE SI** un proveedor usa el mismo código para dos colores: se guarda por variante y se pregunta si choca.
  Se roza con la tarea 26 (el código de la bolsa), que reconoce la bolsa, no la prenda.
- **Primer paso:** preguntar en las sedes qué proveedores traen etiqueta con código de barras.

### recibir-galeria#5 · Una foto de la prenda ordena la galería por parecido  ·  Visión · impacto 4 · esfuerzo L · confianza Baja
- **Hoy:** reconocer la prenda depende de que la persona recorra las fotos.
- **Propuesta:** un botón de cámara junto al buscador: la foto de la prenda en la mano se compara con las fotos de la categoría y la galería se
  ordena por parecido. Siempre elige la persona.
- **Cómo lo hacen los mejores:** Lightspeed AI y Shopify Magic trabajan sobre la foto del producto (radar, referentes #24, PROBAR); la visión de Claude
  acepta imágenes de alta resolución (radar, stack, PROBAR; [fuente](https://docs.claude.com), consultado 2026-11-13).
- ⚠ **Toca lo delicado (gasto de IA):** necesita tope y freno (referentes #49), como «Catálogo con IA» (ADR-0659).
- **DECIDÍ** ordenar, nunca elegir sola. **DESCARTÉ** guardar vectores de cada foto en la base: el radar no trae pgvector y para una categoría de 30 a
  200 fotos alcanza comparar al vuelo. **SE ROMPE SI** las fotos del catálogo no son parejas: depende de la tarea 27 (el rincón de fotos).
- **Primer paso:** con 20 fotos reales, medir cuántas veces la correcta queda entre las 3 primeras.

### recibir-galeria#6 · La foto del papel de la compra propone los modelos  ·  Visión · impacto 5 · esfuerzo XL · confianza Baja
- **Hoy:** lo que llega sin aviso se agrega modelo por modelo.
- **Propuesta:** la foto de la boleta o la nota del proveedor propone las líneas (categoría, cantidad, costo) y, para cada una, la prenda que ya existe
  más probable. La persona confirma cada una.
- **Cómo lo hacen los mejores:** el radar pone la lectura de facturas con visión y salida estructurada en PROBAR (stack, «PDF + Files API GA»).
- ⚠ **Toca lo delicado (costo y dinero):** propone costos. Se roza con las tareas 15 (hoja borrador) y 25 (el papel de la compra).
- **DECIDÍ** que proponga y no guarde. **DESCARTÉ** confiar en el costo leído sin mirarlo. **SE ROMPE SI** la nota es a mano: se prueba con notas reales.
- **Primer paso:** 10 fotos reales de notas de proveedor y medir qué lee bien.

## Descartadas

- **Sacar las fichas dobles de CLAURE (Trujillo y Arequipa) con una migración:** **ya existe** «Fusionar productos repetidos» en Catálogo ▸ Productos
  (ADR-0650), que junta dos fichas y suma su stock por sede. No hace falta una migración nueva; lo que queda es que Felipe decida fusionarlas
  (mueve stock: es su OK).
- **Escanear el código de CAYLA en el buscador de la galería:** ya funciona: el buscador tiene el foco al abrir y busca también por el código de la
  variante (`galeriaDePrendas`).
- **Filtrar por color tocando un chip:** sin referente en el radar, y escribir el color en el buscador ya filtra. Si la prueba con la prenda en la
  mano muestra que hace falta, se vuelve a evaluar.

## Para otras skills

- `/chaos`: doble toque rápido en una tarjeta y «Sí, es esta» con una búsqueda tardía en vuelo (la respuesta vieja no pisa a la nueva, pero conviene atacarlo).
- `/formidable`: la prueba ciega de «encuentra tu prenda entre 30» (la verificación que pide el tablero) con una colaboradora real.
