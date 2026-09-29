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
| 1 | **Sale al ingresar mercadería** (Recibir, Ingreso sin comprobante, cierre de una producción del Taller), **una por prenda física**. No al crear el producto. | Recién al ingresar se sabe cuántas prendas hay. Al crear el modelo no existe ninguna todavía. **Desde el 2026-09-29 hay una excepción: el producto que se crea CON su stock de hoy (ADR-0212) sí se etiqueta al terminar el alta** (sección «Actualización 2026-09-29»). |
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

**Actualización 2026-09-26: la configuración vive en la pantalla, en la «Guía de impresión»** (botón junto a «Imprimir
etiquetas» y en la nota del pie; `components/GuiaImpresion.tsx`). Esta sección decía, para Windows, lo contrario de lo que
funcionó en la tienda, y no nombraba los tres ajustes que lo resolvieron. Lo probado por un colaborador en la computadora
Windows de la tienda (fotos de Felipe, 2026-09-26, guardadas en `apps/web/public/guia-impresion/`):

- **Windows — PROBADO:** Configuración → Bluetooth y dispositivos → Impresoras y escáneres → Brother QL-1110NWB →
  Preferencias de impresión: Tamaño de papel **62mm**, **Longitud 40.1**, Orientación **Vertical**, **Cortar cada 1
  etiqueta** y Cortar al final → Aplicar. **Cerrar Chrome por completo** (Chrome lee el papel al abrirse). Al imprimir, en el
  **diálogo de Chrome** (no en el del sistema): destino Brother, tamaño 62mm, páginas por hoja 1, márgenes **Ninguno**,
  escala **Personalizado 100**, forma **A (girada)**.
- **Mac — SIN PROBAR contra la Brother real:** ⌥⌘P (diálogo del sistema) → Tamaño del papel → «Gestionar tamaños
  personalizados…» → «+» → «CAYLA 62 x 40,1», 62 × 40,1 mm, área no imprimible definida por el usuario en 0 → OK; escala
  100 %; guardar como preajuste «Etiquetas CAYLA». Si al probarlo algo difiere, se corrige en `GuiaImpresion.tsx`.

DECIDÍ: una guía paso a paso en un modal, con las fotos reales de la tienda y un número sobre cada clic que se enciende al
leer su instrucción; el último paso es un diagnóstico por síntoma («sale chica / larga / girada») que devuelve al paso que
lo arregla. DESCARTÉ: capturas sacadas de internet, porque mostrarían otra versión de Windows o del driver y en otro idioma
(justo la ambigüedad que había que quitar) y su uso no es nuestro; y reescribir la nota, porque el problema era el formato
—un párrafo que mezclaba impresora y campañas— y no solo el texto. SE ROMPE SI: Brother o Chrome cambian el diálogo (una
foto deja de parecerse a la pantalla) o se cambia el rollo: las medidas viven una sola vez en `lib/guia-impresion-reglas.ts`
(`MEDIDAS`), pero las fotos hay que volver a tomarlas.

## Actualización 2026-09-29: también al terminar el alta de un producto con stock

**Qué pasó:** en la tienda (foto de Felipe, «Almacén Trujillo»), después de crear «Camisa Lara» con 5 unidades, la pantalla
de éxito ofrecía fotos, «Crear otro parecido» e «Ir a productos», pero no las etiquetas. La prenda estaba en la mano y para
etiquetarla había que ir a Productos, buscarla y abrir su menú.

**Por qué la decisión 1 ya no alcanza:** decía «recién al ingresar se sabe cuántas prendas hay». Desde el ADR-0212
(2026-09-26) Nuevo producto guarda el modelo **y** su carga inicial en una sola operación, así que al terminar el alta ya
existen las prendas y se sabe cuántas son. Un producto creado sin stock sigue sin ofrecerlas.

```
DECIDÍ: una tarjeta más en la pantalla de éxito, «Imprimir etiquetas» (`ProductoCreado.tsx`), que aparece solo si el
        producto ya existe en la base y entró con unidades (`etiquetasDelAlta`, pura y probada). Abre
        `/etiquetas-de-precio?producto=` en OTRA pestaña. Sale una etiqueta por unidad cargada.
DESCARTÉ: (a) imprimir sola al guardar: abriría el diálogo de la Brother sin que nadie lo pida y no se deshace (gasta
        rollo); (b) abrirla en la misma pestaña: «Crear otro parecido» vive solo en el estado de esa pantalla, y volver
        dejaba el formulario en blanco, justo cuando se cargan 10 prendas de una colección; (c) leer los movimientos de la
        carga inicial por `lote_id`, como Recibir: la carga inicial no tiene lote (el ADR-0212 descartó `recibir_lote` a
        propósito, para no inflar «sin comprobante»), y `?producto=` ya lee el stock de la tienda, que en un producto
        recién creado es exactamente lo cargado; (d) ofrecerla también sin stock o sin conexión: la pantalla de etiquetas
        solo diría «no hay prendas».
SE ROMPE SI: entre crear y pulsar el botón se cambia de sede en la cabecera: la etiqueta sale de la sede activa, así que
        no encuentra las unidades (la pantalla lo dice, pero la persona no sabe por qué). O si se pulsa dos veces: no hay
        registro de lo impreso (se descartó a propósito arriba), saldrían dos juegos.
```

**Verificado:** 3 pruebas nuevas en `etiqueta-precio-reglas.test.ts` (con stock, sin stock, sin conexión). La tarjeta se vio
en el navegador con datos de ejemplo, con y sin stock: con stock la cuadrícula pasa a 2 × 2; sin stock vuelve a las 3
tarjetas de siempre. El enlace sale `/etiquetas-de-precio?producto=<id>` con `target="_blank"`. **Falta:** crear un producto
de verdad con stock en la tienda e imprimir (Felipe): la captura fue con datos de ejemplo, sin sesión.

## Lo que sigue

- **Paso 2 — construido** (sección de arriba).
- **Paso 3 — construido (ADR-0182):** el precio de campaña baja al .90 en la caja y la base lo verifica. Falta pegar su
  migración en producción con OK de Felipe, el mismo día que se publique la web.
- ~~Ajustar la medida a la cartulina~~ — hecho: 44 × 62 mm para el cartón de 5 × 8 cm.

## Actualización 2026-09-29 — la marca de la prenda en la etiqueta (ADR-0281, decisión 6)

`EtiquetaPrecio.tsx` imprime `productos.marca_id` (`marca`) al pie, a la izquierda del QR y sobre el código, en 2 mm y peso 800,
dos líneas como máximo. Se eligió ese hueco tras medir la etiqueta: con campaña solo sobran 1,4 mm entre el bloque de precio y el
pie, así que cualquier línea nueva sobre el nombre empujaría el QR. No suma alto. `lib/etiquetas-precio.ts` la lee junto al producto.

## Actualización 2026-09-29 (b) — el ícono de cada etiqueta comercial sale en el papel

**Qué pidió Felipe:** al elegir una etiqueta comercial para una prenda (Nuevo, Para liquidar, Black Friday…), su **ícono** tiene que
salir en el papel para saber a cuál pertenece. Una prenda puede tener dos etiquetas y las dos pueden traer descuento, pero
**solo se aplica el mayor: no se acumulan** (eso ya era así en la caja; ADR-0107).

**Decisiones de Felipe (2026-09-29, preguntadas una por una antes de programar):**

| # | Decisión | Por qué |
|---|---|---|
| 1 | Salen **todas las etiquetas de la prenda que rigen, con o sin descuento, hasta 2 íconos**. | Nuevo o Hecho a mano no tocan el precio, pero identifican la prenda. Con 3 o más entran 2: primero las de descuento (mayor % antes), luego las que no rebajan. |
| 2 | Con **dos descuentos**, salen **los dos íconos**; el «−20 %», el motivo, «válido hasta» y el precio son **solo de la ganadora**. | Ningún % se suma ni se muestra dos veces. La ganadora es la que ya elegía la caja (`mejorCampanaPorVariante`); el papel no calcula otra. |
| 3 | ~~El ícono va al lado del nombre y sobre el precio.~~ **Reemplazada el mismo día: ver «Actualización 2026-09-29 (c)».** | Un ícono solo no decía qué era y las etiquetas con campaña se dibujaban distinto. |
| 4 | Sale **también una etiqueta que todavía no empieza**, no una que ya terminó. Va detrás de las que ya rigen. | Es para la colaboradora: reconoce la prenda por su campaña desde que la etiqueta. El precio sigue siendo el de hoy. |

**Decisiones técnicas (Claude):**
- **Sin migración.** `etiquetas`, `variante_etiquetas` y `etiqueta_categorias` ya se leen con `authenticated`. `lib/etiquetas-precio.ts`
  trae las elegidas a mano embebidas en la variante (`variante_etiquetas ( etiqueta_id )`) y, por las pocas categorías del envío,
  las que alcanzan por categoría, los mismos dos caminos de `fn_campanas_por_variante`. Solo aprobadas y activas. **La caja no
  cambia:** `fn_campanas_por_variante` sigue devolviendo solo las etiquetas con descuento.
- **La regla vive en `iconosDelPapel` / `iconosPorVariante`** (`lib/etiqueta-precio-reglas.ts`, pura y probada). Dos etiquetas de la
  misma familia («Para liquidar — Taller» y «— AQP») comparten dibujo y ocupan un solo lugar. Un nombre que no se reconoce cae en
  el ícono genérico, como en la grilla de Atributos.
- **Íconos propios para el papel** (`components/IconoEtiquetaPapel.tsx`), no los de `MuestraEtiqueta`: esos usan tintes,
  transparencias y trazos de 1 unidad. La Brother imprime solo negro y blanco: una transparencia sale como trama y un trazo fino
  se corta. Mismos 21 conceptos, con `#000`/`#fff`, trazo mínimo de 1,8 unidades (0,29 mm; el mínimo de la Brother es 0,2 mm) y
  4,8 mm de lado.

**DESCARTÉ:**
- Reusar los íconos de pantalla con el acento en negro: las transparencias del 14 al 55 % saldrían como trama.
- Los íconos **en la cabecera**, junto al colibrí (lo comparé con el CSS real, a 300 dpi, mismos 4,8 mm): **también entran**. La
  cabecera crece 0,63 mm (4,17 → 4,8), el pie no se mueve y los dos íconos terminan a 2,24 mm del borde en vez de 3 (0,76 mm dentro
  del acolchado). Su ventaja: el nombre conserva los 34,1 mm. Se descartó porque Felipe pidió el ícono junto al nombre; queda como
  la salida si el nombre cortado molesta (abajo).
- Un ícono debajo del precio o en el pie: no hay alto (1,4 mm con campaña) ni el pie tiene hueco.

**Lo que se paga (medido, mismo banco para las dos ubicaciones):** con 2 íconos el nombre tiene **22,5 mm** de los 34,1 (≈ 13
caracteres por línea); con 1, 28,1 mm. Sin campaña el nombre baja a 2 líneas y se lee entero. **Con campaña el nombre sigue en 1
línea** («VESTIDO MIDI FLORAL» sale «VESTIDO MIDI…»). Nada más se mueve: la cabecera, el precio y el pie quedan donde estaban. Si en la
tienda se ve seguido, la salida es pasar los íconos a la cabecera (mismo tamaño, un cambio de unas 10 líneas en `EtiquetaPrecio.tsx`
y `globals.css`).

**SE ROMPE SI:** se agrega un ícono a `IconoEtiqueta` (`lib/etiqueta-visual.ts`) sin su dibujo de papel en `IconoEtiquetaPapel.tsx`:
TypeScript lo marca (el `Record` exige los 21) y el papel saldría sin ícono. O si alguien pone gris o transparencia en un dibujo.

**Verificado:** 18 pruebas nuevas en `etiqueta-precio-reglas.test.ts` (71 en el archivo; suite completa 242 archivos, 153.035
pruebas), incluida la de punta a punta con dos descuentos (Para liquidar 20 % y Aniversario 10 %: cobra 71.90 sobre 89.90, no
sube ni baja por la de 10 %). Etiqueta real (`EtiquetaPrecio` + CSS de `globals.css`) fotografiada a 300 dpi con 6 casos sin
desbordar; los 21 íconos revisados grandes y a 4,8 mm. Producción, solo lectura (2026-09-29): hoy 22 prendas tienen etiqueta
(1 cada una: Nuevo 8, Top ventas 8, Últimas unidades 6); «Para liquidar» 20 % rige hasta el 1-oct y «Aniversario CAYLA» 10 %
empieza ese día, así que el caso de dos descuentos aparece recién al elegir las dos en una prenda.
**Falta (Felipe):** crear un producto con 2 etiquetas, imprimir en la Brother real y mirar el ícono de 4,8 mm en la térmica.

## Actualización 2026-09-29 (c) — una sola manera de dibujar las etiquetas: ícono + palabra, en una fila (propuesta A)

**Qué pidió Felipe:** (1) que el ícono diga qué significa, sin sobrecargar la etiqueta; (2) que Black Friday y Para liquidar **no se
vean distintas** de las demás etiquetas: todo de una sola manera; (3) guiarse de la «propuesta A» (fila sin cajas, bajo el color).
Reemplaza la decisión 3 de la sección (b) (los íconos al lado del nombre) y quita el bloque «ícono junto al nombre».

**Cómo queda:**
- **Una fila bajo el nombre y el color**, para TODAS las etiquetas de la prenda, traigan descuento o no: ícono de 3,6 mm + una
  **palabra corta** (NUEVO, ÚLTIMAS, TOP VENTAS, LIQUIDAR, A MANO, PIEZA ÚNICA, REEDICIÓN, ANIVERSARIO, BLACK FRIDAY…), sin cajas. La
  palabra sale de `rotuloDeEtiqueta` (`lib/etiqueta-visual.ts`): una por familia de concepto, no el nombre de la etiqueta («Día
  Internacional del Gato» → DÍA GATO). Un nombre que no se reconoce imprime el suyo, cortado con «…» si no cabe. Máximo 12 letras
  por palabra, y lo vigila una prueba.
- **La campaña que rebaja el precio ya no se dibuja aparte.** Su ícono y su palabra van en la fila como los demás. El bloque de precio
  conserva el precio tachado y el «−20 %», **deja de repetir el nombre de la campaña** (`campanaSaleEnLaFila`) y **la fecha de validez pasa a
  la derecha del precio tachado** («Válido hasta el 30.10», antes «Precio válido hasta el 30.10» bajo una raya): esa línea tenía la mitad
  libre, y quitar la franja de abajo libera ~4 mm. Si la campaña no salió en la fila (una etiqueta armada sin íconos), el bloque la nombra
  como antes: nunca queda sin decir cuál es.
- **Si dos etiquetas no caben juntas, una debajo de la otra** (Felipe, tras ver la hoja de combinaciones). Cada chip mide ~1,4 mm por letra de
  su palabra, así que dos entran en la misma línea solo si son cortos (NUEVO + TOP VENTAS sí; LIQUIDAR + ANIVERSARIO no). La fila es un
  `flex-wrap` sin cajas ni rayas: lo que no cabe baja a una 2.ª línea. Esa fila es además el único bloque de la etiqueta que puede
  encogerse (`flex-shrink: 1`, piso de 3,4 mm = una línea) con `overflow: hidden`: red por si algún día el contenido no entra, y nunca
  empuja el precio ni el QR fuera del papel.
- **Espacio:** sin campaña sobran ~10 mm y las dos líneas caben con holgura; con campaña, tras mover la fecha, sobra ~1 mm con las dos
  líneas. El caso más apretado es un nombre en 2 líneas + dos etiquetas largas: sobran 0,35 mm. Para que entre entero, el ícono bajó de 3,6 a
  3,4 mm (trazo mínimo 0,20 mm, el mínimo de la Brother), el precio sin campaña sube 0,8 mm hacia la fila y el hueco entre líneas es de 0,3 mm.
- **Íconos más gordos:** a 3,4 mm los trazos de 1,6 unidades quedaban en 0,18 mm; ahora ninguno baja de 1,8 unidades (0,20 mm).

**Lo que se paga:** la frase de validez es más corta y sale del bloque que Felipe aprobó en el paso 2 (raya + «Precio válido hasta el…»);
las etiquetas con campaña quedan con poco aire (~1 mm) bajo la fila. Si se ve apretado en la Brother, la salida es una sola línea de chips
con campaña (la segunda se recorta), como antes.

**Visto de paso, no es de este cambio:** con un precio de lista de 4 cifras y campaña (S/ 1,199.90 con −30 % → 839.90), el bloque negro del
«−30 %» llega al borde derecho de la etiqueta. `.etq-precio-largo` solo se activa cuando el precio cobrado tiene 8 caracteres.

**Verificado:** 116 pruebas entre `etiqueta-precio-reglas.test.ts` y `etiqueta-visual.test.ts` (suite completa: 242 archivos, 153.054),
`tsc` sin errores nuevos (los de `conteo` ya estaban), eslint limpio. Tres hojas con la etiqueta real (`EtiquetaPrecio` + CSS de
`globals.css`) a 300 dpi: cada etiqueta sola (12), pares (12) y casos límite (12: nombre largo, nombre en 2 líneas, talla única, 8 tallas,
precio de 4 cifras, tres etiquetas, nombre propio, campaña sin fecha). En las 36 el pie queda a 3 mm del borde, ninguna se sale y
**las 23 que llevan dos etiquetas las muestran las dos** (las que no caben juntas van una debajo de la otra).
**Falta (Felipe):** imprimir en la Brother una prenda con 2 etiquetas y otra con campaña y 2 etiquetas, y mirar el ícono de 3,4 mm.
