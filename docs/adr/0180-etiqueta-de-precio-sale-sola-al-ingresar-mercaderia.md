# ADR-0180 — La etiqueta de precio sale sola al ingresar mercadería, leída de los movimientos del ingreso

**Fecha:** 2026-09-23 · **Estado:** los 3 pasos **publicados**: Felipe fusionó el PR #351 el 2026-09-23 a las 12:16 (Lima)
y Vercel los desplegó; la migración del paso 3 (ADR-0182) se había pegado antes ese mismo día. Los pasos 1 y 2 **no tienen
migraciones**. La medida cambió después: 44 × 62 mm (el cartón), 62 × 62 derecha (2026-09-24) y **40,1 × 62 a lo ancho del
rollo** (2026-09-25, publicada). La legibilidad en la térmica va en el PR del 2026-09-25 (sección «Legibilidad en la
térmica»). · **Falta:** crear el papel de 62 × 40,1 mm en la Mac de la tienda, imprimir una etiqueta y escanearla.
**Número:** 0180 porque el 0179 lo tomó en paralelo «Prendas sin registrar» (rama `untagged-products-pos`).

## El problema

Hoy cada etiqueta de precio se arma a mano en P-touch Editor: se copia el precio, se elige la plantilla y se imprime prenda
por prenda. Es lento, y el precio impreso lo tipea una persona. El ERP tuvo una pantalla de etiquetas (QR verificado con la
pistola Zebra el 2026-09-10, ADR-0025), pero **se perdió en el reemplazo V1→V2** (`0af2f1b`): quedaron huérfanos
`components/CodigoQR.tsx`, `lib/qr.ts` y el CSS de impresión de 62 × 29 mm.

**Ojo con el nombre.** En el sistema, «etiqueta» ya es la **campaña** (Black Friday, Aniversario; ADR-0107/0108). Esta es la
**etiqueta de precio**, la de papel. Todo lo suyo dice `EtiquetaPrecio` / «etiqueta de precio», nunca «etiqueta» a secas.

## Decisiones de Felipe (2026-09-23)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Sale al ingresar mercadería** (Recibir, Ingreso sin comprobante, cierre de una producción del Taller), **una por prenda física**. No al crear el producto. | Recién al ingresar se sabe cuántas prendas hay. Al crear el modelo no existe ninguna todavía. |
| 2 | **Rollo DK-22205 (62 mm continuo, adhesivo) pegado sobre un cartón de 5 × 8 cm con agujero.** | Es lo que se usa hoy (foto del 2026-09-23). El cartón manda la medida: la etiqueta fue de **44 × 62 mm** (sección «El cartón de 5 × 8 cm») y hoy es de **40,1 × 62 mm** («Actualización 2026-09-25»). |
| 3 | **Se imprime directo desde el ERP** (Chrome + driver Brother). Adiós P-touch Editor. | Nadie vuelve a copiar un precio a mano. |
| 4 | **Diseño «D · Editorial, corregida»**, elegido entre 3 rondas de maquetas (`docs/maquetas/etiqueta-precio-2026-09/`). En la ronda 4 (el cartón) eligió el arreglo **«QR abajo»** y pidió **el QR lo más grande que entre**: 22 mm, 20 con campaña. | Inspirado en Zara/H&M. La crítica separó lo que sirve a la clienta de lo que sirve a la colaboradora (ver abajo). |
| 5 | **La etiqueta muestra todas las tallas del modelo, con la de la prenda marcada.** | La clienta sabe hasta qué talla hay sin preguntar. |
| 6 | **En campaña, el precio se redondea hacia abajo a .90** (S/ 71.92 → S/ 71.90). | Precio «de tienda». **Toca el cobro**: va en el paso 3 (ADR-0182), antes que cualquier etiqueta con descuento (paso 2). |
| 7 | **La etiqueta dice lo que la caja cobra HOY**: si al ingresar la prenda tiene una campaña vigente, sale con el precio de campaña. | Nunca un precio distinto en el papel y en la caja. Al terminar la campaña se reimprime con «Volver al precio normal». |

## Decisiones técnicas (Claude)

- **No hay función nueva en la base.** Todo ingreso ya escribe sus `movimientos` de entrada con el origen: `lote_id`
  (`recibir_envio` → `recibir_compras` y los extras; `recibir_lote`) o `produccion_id` (`cerrar_produccion`). La pantalla
  `/etiquetas-de-precio?lotes=…|?produccion=…` solo los lee (principio 4) y les suma código, precio de lista, color y las tallas
  hermanas (`lib/etiquetas-precio.ts`, lógica pura en `lib/etiqueta-precio-reglas.ts`).
- **La seguridad la pone la base.** `movimientos_select` solo muestra las sedes que uno opera: un id escrito a mano de otra
  tienda devuelve una lista vacía. Los ids de la URL se filtran como UUID antes de consultar.
- **No es un módulo del menú (ADR-0161).** Es la salida de tres pantallas que ya tienen su módulo, así que no lleva
  `exigirModulo` ni fila en `retail.modulos`.
- **«Tallas del modelo» son las del modelo en ese color (variantes activas), no el stock del día.** La etiqueta impresa no se
  actualiza sola: con el stock quedaría desactualizada con la primera venta. Por eso dice «Tallas del modelo».
- **El QR codifica `variantes.codigo`** (respaldo: `sku`; la caja resuelve los dos). Sin ninguno, la prenda no se imprime y
  la pantalla lo avisa: una etiqueta con precio que la caja no encuentra es peor que no tener etiqueta. En producción, las
  1.295 variantes activas tienen código (2026-09-23).
- **Lo que llega de otra sede no se etiqueta**: entra por traslado, no por lote, y ya viene etiquetado.
- **Paso 1 imprime el precio de lista.** Si la prenda está en campaña, la caja cobra menos de lo que dice el papel, nunca
  más. El precio de campaña llega con el paso 2, después del redondeo (paso 3).
- **Impresión:** una hoja montada con un portal en `<body>` (`#etiquetas-precio-print`, mismo patrón que la boleta A4) y una
  página nombrada `@page etiqueta-precio { size: 62mm 44mm }`, así no se pisa la regla de la térmica de 80 mm. Cada etiqueta
  (44 × 62) va girada −90° dentro de su hoja (`.etq-hoja`), con `contain: size layout paint` (ver «El cartón»).
  `print-color-adjust: exact` hace que la talla invertida salga negra aunque «Gráficos de fondo» esté apagado. Todo en mm y
  en #000 puro: la QL-1110NWB no imprime otro color.
- **Lecturas con `leerTodas()`**: un envío grande pasa las 1.000 filas de PostgREST en las tallas hermanas, y cortada, la
  etiqueta saldría con tallas de menos sin error.

**DESCARTÉ:**
- Exportar un CSV para P-touch Editor: el diseño viviría fuera del ERP y seguiría el paso manual.
- El SDK b-PAC de Brother: es solo para Windows y ActiveX.
- Mandar el trabajo desde el servidor al puerto 9100 de la impresora: Vercel no llega a la red de la tienda.
- Una tabla que registre cada etiqueta impresa: nadie la pidió (YAGNI). La fecha de impresión va en el papel.

**SE ROMPE SI:**
1. La computadora no tiene un papel de 62 × 40,1 mm (antes 62 × 44): la etiqueta sale en un corte más largo, chica o a lo
   largo. Hay que crearlo una vez por computadora (abajo, «Configurar la Brother»). Si con ese papel sale corrida o
   achicada, revisar que el driver no agregue márgenes al corte (el diseño ya deja 3 mm de acolchado en todo el borde).
2. La web (pasos 2 y 3) se publica sin pegar la migración del paso 3, o al revés: la etiqueta y la caja dirían un precio
   que la base rechaza. Salen juntas (ADR-0182).
3. Se confunde «etiqueta» (campaña) con «etiqueta de precio» en el código.

## Paso 2 — la etiqueta de campaña y la reimpresión (2026-09-23)

- **Con campaña vigente**, la etiqueta lleva el diseño aprobado:
  - el precio de lista tachado;
  - el precio que cobra la caja (el mismo `descuentoDeCampana`, bajado al .90) con su «−20 %» en bloque negro;
  - el motivo (el nombre de la campaña; en el cartón de 5 × 8, una línea con «…» si es largo);
  - «Precio válido hasta el dd.mm».

  Vale para cualquier origen, incluido un ingreso (decisión 7). La campaña de cada prenda la elige
  `mejorCampanaPorVariante` como la caja: la de mayor %.
- **Dos orígenes nuevos en `/etiquetas-de-precio`**, con cantidad = stock físico de la tienda de la sesión
  (`stock.cantidad`: lo apartado también está en la tienda):
  - `?campana=`: las prendas que la campaña alcanza, decidido por `fn_campanas_por_variante`, la misma función de la caja.
    - **Vigente:** «Etiquetas de campaña».
    - **Ya terminó:** se mira su último día para saber qué alcanzó, y las mismas prendas salen con el precio de hoy
      («Volver al precio normal»).
    - **Todavía no empieza:** no imprime nada. La etiqueta diría el precio de hoy, y se imprime el día que empieza.
  - `?producto=`: las tallas y colores del modelo que hay en la tienda. Sirve para la ropa que ya está en tienda y para
    lo que llega del Taller a una tienda que no imprimió.
- **Botones:**
  - En la tarjeta de cada campaña (Atributos ▸ Etiquetas): «Imprimir etiquetas de precio» o «Volver al precio normal».
  - En Productos: el menú «···» de la lista y la ficha en grilla.
- **Textos de la pantalla:** `encabezadoDeEtiquetas`, puro y probado. Una campaña terminada no se ve como un error: es
  el momento de volver al precio normal.

**Verificado:**
- 36 pruebas en `etiqueta-precio-reglas.test.ts`.
- `?producto=` contra la base local: 48 prendas y 8 filas, igual que el SQL.
- El camino de campaña en SQL dentro de una transacción revertida, con permisos de colaborador:
  - vigente: 8 prendas y 48 unidades, lo mismo que contadas por otro camino;
  - precio: lista 99.90, cobra 79.90;
  - terminada: las mismas 8 prendas, y hoy no rige;
  - una colaboradora de Trujillo ve 0 filas del stock de Lima.
- PDF real de 4 etiquetas de campaña. Dos defectos encontrados y corregidos: un precio de 4 cifras con su % se salía del
  borde, y un motivo largo se cortaba en una línea. Los 4 QR, decodificados exactos a 300 dpi.

## La crítica que dio forma al diseño

**Para la clienta:**
- El colibrí y CAYLA.
- La fila de tallas con la suya invertida.
- El color en su propia línea.
- El precio firme.
- En campaña (paso 2), el bloque «−20 %» y el motivo.

**Para la colaboradora:**
- El código en letra monoespaciada del sistema (su 0 lleva barra, no se confunde con la O al teclearlo).
- «Impreso dd.mm.aa»: si conviven dos etiquetas de la misma prenda, manda la más nueva.
- El QR lo más grande que entra en 44 × 62 mm: 22 mm (20 con campaña), más que los 18 mm verificados con la Zebra.
- Con 8 tallas o más, la fila baja un punto de letra. Felipe: «jamás habrá 8 tallas»; la regla queda como red, no como diseño.

## Cómo se verificó (2026-09-23)

- `lib/etiqueta-precio-reglas.test.ts`: 21 casos. Cubren la suma por prenda, el orden de tallas, otro color, las tallas
  apagadas, el respaldo de SKU, la prenda sin código, las cantidades, el precio, la fecha, los ids de la URL y la ida y vuelta
  del enlace. Suite completa: 118 archivos, 24.251 pruebas. `typecheck` y `eslint` en verde.
- Pantalla contra la base local: un lote de 240 prendas da 12 filas y 240 etiquetas, lo mismo que el SQL. Mide 62 × 92 mm y
  el QR 25 mm exactos.
- **PDF real** con el motor de impresión de Chrome (Playwright `page.pdf`, «Gráficos de fondo» apagado) y una página temporal
  con datos inventados: 6 páginas de 62 × 92 mm, una etiqueta por página. Se probaron el nombre largo cortado en 2 líneas,
  la talla única, 5, 8 y 10 tallas, y un precio de S/ 1,299.90.
- **Los 6 QR se decodificaron exactos** desde la imagen a 300 dpi (la resolución de la Brother) con jsQR. El código más largo
  (16 caracteres) entra en QR versión 1, a ~10 px por módulo (el mínimo práctico es 4).
- Producción, solo lectura: `recibir_lote` devuelve el id del lote, `recibir_envio` trae `lotes` y `cerrar_produccion`
  escribe `produccion_id`. Existen las 15 columnas y las 3 relaciones que lee la pantalla.
- **Falta:** imprimir en la QL-1110NWB real y escanear con la pistola (Felipe).

## El cartón de 5 × 8 cm (2026-09-23, ronda 4)

Felipe midió el cartón: **5 cm de ancho × 8 cm de largo**, con el agujero arriba. La etiqueta de 62 × 92 mm no entraba.

- **Formato: 44 × 62 mm.** El rollo mide 62 mm y eso no cambia; en un cartón de 50 mm de ancho, los 62 mm solo entran a lo
  largo (en los 80). Quedan 3 mm de aire a cada lado del cartón, el agujero libre arriba (dibujado centrado a 5 mm del
  borde) y ~6 mm al pie. La etiqueta empieza ~12 mm por debajo del borde de arriba del cartón.
- **Sale de lado:** la Brother corta la tira cada 44 mm. La página que recibe es de 62 × 44 mm (el ancho del rollo por el
  largo del corte) y la etiqueta va girada −90° dentro. Se despega, se gira y se pega.
- **Arreglo elegido: «QR abajo»** (el orden aprobado de la D), con el QR tan grande como entre (Felipe: «hazlo más grande»):
  - **22 mm sin campaña**: lo limita el ancho (el código de 16 caracteres va al lado).
  - **20 mm con campaña**: lo limita el alto (el «−20 %» y el motivo van encima).
  - Su margen blanco cae sobre el acolchado: abajo es el borde del rollo, donde la Brother no imprime, y a la derecha el
    corte. Las zonas negras quedan a ~4 mm de cada borde.
  - Con campaña, el nombre de la prenda baja a 1 línea y el motivo a 1 línea con «…».
- **Medido en la hoja real (PDF de Chrome, 6 casos):**
  - 6 páginas de 62 × 44 mm, una etiqueta completa por página.
  - El caso más justo (blusa con campaña) deja 0,43 mm de aire sobre el QR.
  - Ningún código se corta.
  - **Los 6 QR se decodificaron exactos a 300 dpi**, con la hoja girada (8–9 puntos de la Brother por módulo; el mínimo
    práctico es 4).
- **Defecto que atrapó el PDF, no la pantalla:** sin la propiedad `contain`, Chrome partía la etiqueta girada en el salto
  de página. Antes del giro mide 62 mm de alto, más que la hoja de 44. El QR y el pie aparecían encima del precio en todas
  las hojas menos la última. Con `contain: size layout paint` la etiqueta es una pieza que no se parte.

## Actualización 2026-09-24: sale derecha, en cortes de 62 mm

**Qué pasó en la tienda:** en una Mac, la hoja de 62 × 44 mm con la etiqueta girada salió **derecha pero achicada y
corrida a un lado**, con mucho rollo en blanco. Causa: una página más ancha que alta hace que Chrome la mande en
orientación horizontal, y la Mac y el driver la vuelven a girar para que calce en el rollo. Los dos giros se anulan y la
etiqueta termina escalada. Además, el driver de la Mac no ofrece 62 × 44 mm (el tamaño más cercano es 62 × 48).

**Decisión (Felipe):** la etiqueta sale **derecha**, tal como se lee al salir del rollo. La hoja pasa a **62 × 62 mm**
y la etiqueta de 44 × 62 va centrada en el ancho, con 9 mm blancos a cada lado.
- **Ganas:** una hoja cuadrada no tiene orientación que adivinar, así que ni Chrome ni el driver la giran. Además no hay
  que girar nada al pegarla.
- **Pagas:** cada etiqueta gasta 62 mm de rollo en vez de 44 (≈ 40 % más), y hay que recortar los 9 mm de cada lado para
  que entre en el cartón de 50 mm.

**Dónde está:** `globals.css` (`@page etiqueta-precio` y `.etq-hoja`). Se verificó con el PDF de Chrome: 2 páginas de
62,1 × 62,1 mm, con la etiqueta centrada. Todavía no se probó en la impresora. Los pasos de abajo ya dicen **62 × 62 mm**.

## Actualización 2026-09-25: a lo ancho del rollo, en cortes de 40,1 mm

**Qué pasó:** con la hoja de 62 × 62 la etiqueta salía «a lo largo» y el corte era más largo de lo necesario (Felipe).

**Decisión (Felipe):** la medida de la plantilla P-touch de la tienda, **40,1 × 62 mm**, a lo ancho del rollo: sus 62 mm de
alto cruzan el rollo y la Brother corta cada 40,1 mm. Dos formas de mandarla, elegibles en pantalla y recordadas por
computadora: **A** (por defecto), hoja de 62 × 40,1 con la etiqueta girada −90°; **B**, hoja de 40,1 × 62 con la etiqueta
derecha. `contain: size layout paint` evita que Chrome parta la girada entre páginas, y el colibrí pasó a vector para salir
nítido (`514de694`, `fa22c1e3`, `363904d8`).

## Legibilidad en la térmica y el papel de la Mac (2026-09-25)

**Qué mostró la foto de la tienda.** Felipe mandó una etiqueta impresa con dos quejas: no ocupa todo el papel, y las letras
finas salen débiles. Medida corrigiendo la perspectiva de la foto (el QR tiene que quedar cuadrado):
- **El papel era de 62 × ~100 mm.** La etiqueta salió derecha, a lo largo del rollo, arriba de un corte de 100 mm: el largo
  del papel «62 mm» del driver en la Mac.
- **Lo impreso era la versión del 23-sep (62 × 92 mm), no la de hoy.** El QR ocupa 0,29 del ancho de la etiqueta (la de
  62 × 92 da 0,29 y la de hoy 0,40), el nombre cabe en una línea y la fecha dice «23.09.26». Era una etiqueta de ese día o
  una pestaña abierta desde entonces. Para eso sirve la fecha impresa: si no es la de hoy, la página está vieja.
- **Pero su problema de letras sigue en el diseño de hoy.** La Mac la achicó a ~0,78 y sus letras quedaron del tamaño de las
  actuales (1,5–2,2 mm), en peso 400. Se cortaron los trazos de ~1,7 puntos de la Brother («CUELLO» se leía «CUFLLO»,
  «TALLAS DEL MODELO» casi no se ve) y salieron nítidos los de ~2,5 («NARANJA», el código).

**Por qué la Mac corta 100 mm aunque la hoja mida 40,1.** Chrome en la Mac no elige el papel ni escala: dibuja cada página al
100 % sobre el papel del diálogo y solo la gira si no calza (`PdfMetafileCg::RenderPage` con `autorotate` y sin ajuste, en el
código de Chromium). Su diálogo lista solo los papeles del driver, y el «62 mm» del rollo continuo mide 100 mm de largo. Los
tamaños propios de la Mac («Gestionar tamaños personalizados…») aparecen solo en el diálogo del sistema (⌥⌘P). Con un papel
de 62 × 40,1, las dos formas (A y B) calzan exactas.

**La regla de legibilidad (Claude): trazo mínimo 0,2 mm, unos 2,4 puntos a 300 dpi.** En DM Sans, lo más fino son las barras
de la E: 0,07 em en peso 400, 0,09 en 600 y 0,105 en 700 (medido en su tamaño óptico de letra chica). De ahí:

| Texto | Antes (mm / peso) | Ahora |
|---|---|---|
| «Tallas del modelo» | 1,55 / 400 | 1,9 / 700 |
| Tallas | 2,2 / 400 | 2,3 / 600 (la marcada, 700) |
| Nombre de la prenda | 2,1 / 400 | 2,2 / 600 |
| Color | 2,1 / 700 | 2,2 / 800: sigue siendo la línea firme |
| Precio tachado (campaña) | 2,4 / 400 | 2,4 / 600 |
| «Precio válido hasta…» | 1,75 / 400 | 1,9 / 700 |
| Código | 1,8 / 500, se cortaba | 1,7 / 700, entero |
| «Impreso…» y «cayla.pe» | 1,5 / 400 | 1,9 / 700 (la fecha baja a su propia línea) |
| Colibrí y reglas | 0,19 y 0,22 mm | 0,25 mm |

El precio (6,2 / 500), «CAYLA» (3 / 500) y el «−20 %» no cambian: ya superaban el mínimo.

**El QR baja a 19 mm, con o sin campaña.** Desde que la etiqueta mide 40,1 mm de ancho, el código de al lado del QR de
22 mm se cortaba: «CMS-0011-NAR…». El más largo de producción mide 16 caracteres (consulta de solo lectura, 2026-09-25) y en
la Mac cada carácter de la monoespaciada ocupa 0,6 em: con 19 mm entran sus 15,8 mm en una caja de 16,6. Sigue arriba de los
18 mm verificados con la pistola Zebra: 7,7 puntos por módulo, cuando el mínimo práctico es 4. La etiqueta de campaña gana
aire: 1,1 mm entre el motivo y el QR, antes 0,29.

**De paso:** en esta pantalla, la forma elegida («A · Hoja…») se veía negra y sin texto: un `text-tinta` tapaba la letra
crema de `.pildora-cayla[aria-pressed]`.

**Verificado:**
- **Banco de pruebas, 6 variantes:** sin campaña, con campaña, talla única, 8 tallas, precio de 4 cifras con campaña y nombre
  largo. Usa el marcado de `EtiquetaPrecio` y el CSS real, a 300 dpi. Nada se sale y el código entra entero. Grosor medido
  línea por línea: los textos finos pasan de 2 puntos (el 10 % más fino, 1) a 3–4.
- **Ancho de la Mac, emulado** con una monoespaciada de 0,6 em: «CMS-0011-NAR-XXL» mide 15,8 mm en su caja de 16,6. Un código
  de 17 caracteres (hoy no existe ninguno) mediría 16,75 y saldría con «…»: si aparece, se baja el QR a 18,5 mm.
- **En la app local** (DM Sans de `next/font`, `globals.css`): vista previa de 40,1 × 62 con las fuentes y el QR de la tabla.
  La hoja de impresión, con `@media print` emulado, sale en 3 páginas de 62 × 40,1 (A) y de 40,1 × 62 (B), cada etiqueta
  completa. El PDF de Chrome: 3 páginas de 62,1 × 40,2 mm.
- `tsc`, `eslint` y 77.000 pruebas en verde.
- **Falta (Felipe):** crear el papel en la Mac, imprimir una etiqueta y escanear el QR de 19 mm con la pistola.

## Configurar la Brother (una vez por computadora que imprima)

> Estos pasos no se probaron contra la impresora real: los nombres exactos del driver pueden variar según la versión.

1. Instalar el **driver completo** de la QL-1110NWB desde la página de soporte de Brother, no el genérico de Windows ni el
   AirPrint de la Mac: es el que ofrece cortar cada etiqueta.
2. Crear un papel **62 × 40,1 mm** para el rollo continuo de 62 mm, con márgenes en 0:
   - **Mac:** en Chrome, **⌥⌘P** abre el diálogo del sistema. Tamaño del papel → «Gestionar tamaños personalizados…» → «+» →
     62 × 40,1 mm, área no imprimible definida por el usuario, en 0. Guardar los ajustes como preajuste («Etiquetas CAYLA»).
     El diálogo propio de Chrome no muestra estos tamaños: en la Mac, las etiquetas se imprimen siempre con ⌥⌘P.
   - **Windows:** en las Preferencias de impresión de la Brother, la configuración de tamaño de papel («Paper Size Setup»).
   - Activar **corte automático cada 1 etiqueta**.
3. Al imprimir: papel **62 × 40,1 mm**, márgenes **Ninguno**, escala **100 %** y **sin** encabezados ni pies de página.
4. Primera prueba: imprimir 1 etiqueta y escanearla con la pistola en Vender. Debe salir completa, a tamaño real y a lo ancho
   del rollo, en un corte de 40,1 mm; si sale a lo largo, probar la otra forma (A o B) en la pantalla. Debe decir «Impreso»
   con la fecha de hoy: si dice otra, la página está vieja y hay que recargarla.

## Lo que sigue

- **Paso 2 — construido** (sección de arriba).
- **Paso 3 — construido (ADR-0182):** el precio de campaña baja al .90 en la caja y la base lo verifica. Falta pegar su
  migración en producción con OK de Felipe, el mismo día que se publique la web.
- ~~Ajustar la medida a la cartulina~~ — hecho: 44 × 62 mm para el cartón de 5 × 8 cm.
