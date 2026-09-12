# ESTÁNDAR — Talla y color

> Apartado **C. Comparativa funcional** del documento *CAYLA Retail — el estándar, los doce y el
> camino*, columna 2 de 7. Escrito el **2026-09-11**, el mismo día que la columna 1
> (`ESTANDAR-CAJA-DE-TIENDA.md`), con el mismo método: puntajes transcritos del documento, lo
> que cada sistema hace verificado en su documentación oficial, lo que CAYLA tiene verificado en
> el repo y **medido en producción** donde hacía falta. **Si pasaron semanas, verificá cada
> archivo:línea contra el repo antes de creerle a esto.**

---

## 0. De dónde sale y cómo se lee

Es la prioridad 2 de 6 del documento (§B): *«Inventario con talla y color. Matriz real, varios
almacenes y transferencias entre Trujillo, Arequipa y el taller de Lima.»* La mitad de esa frase
—almacenes y transferencias— es la columna 3; esta columna es la **matriz**: cómo se modela,
cómo nace, cómo se ve, cómo se le pone precio y qué inteligencia sale de ella. La figura de
portada del documento lo dice mejor que la tabla: *«Una blusa son veinticinco posiciones de
stock, no un producto. Los sistemas contables la tratan como un código plano. Los buenos la
tratan como una matriz — y saben que la M vino se está quedando antes de que alguien lo
pregunte.»*

| Talla y color | Sistema | Origen | Lo que el documento ya dijo |
|:-:|---|---|---|
| **5** | Lightspeed Retail | Canadá · retail | §E: «maneja la matriz de talla y color, las órdenes de compra automáticas y las transferencias entre tiendas como nadie». §K: «es el estándar del sector: no hay que superarlo, hay que igualarlo» |
| **5** | ApparelMagic | EE. UU. · moda | §E y §K: «los especialistas de moda suman el vocabulario que importa: curva de tallas, paquetes surtidos, temporadas, rotación por estilo» |
| **5** | Uphance | Reino Unido · moda | ídem |
| 4 | Shopify POS | Canadá · plataforma | — |
| 4 | Odoo | Bélgica · abierto | §E: «su cuadrícula de variantes por talla y color, con precios que cambian por temporada, es sólida» |
| 4 | NetSuite | EE. UU. · corporativo | Blueprint ERP CAYLA (05-sep): *Matrix Items*, «el modelo de variantes más limpio del grupo» |
| 4 | Zoho Inventory | India · suite | — |
| 4 | Katana | Estonia · producción | Blueprint: «disponible / comprometido / esperado» |
| 4 | Doss | EE. UU. · nuevo, con IA | — |
| 4 | INVY | Perú · caja con IA | — |
| 3 | Square · Loyverse · Dynamics 365 BC · Bsale | — | Blueprint sobre BC: «sin generador nativo de matriz — se crea variante por variante» |
| 2 | Alegra · Defontana | — | §E: «Alegra y QuickBooks tratan una prenda como un código plano. Ese es el hueco funcional más grande del mercado peruano» |

**La lectura, antes de las fichas.** Esta columna se lee al revés que la de la caja. Allá los ERP
grandes no enseñaban nada; acá **el modelo de datos correcto viene de los grandes** (NetSuite:
padre sin stock, hijas por talla × color con SKU e inventario propio — el Blueprint del 05-sep ya
lo puso como «máxima prioridad de todo el benchmark»), y **CAYLA ya lo tiene en el núcleo**:
`productos` + `variantes` con `variantes_identidad_unica` (ADR-0025), vocabulario cerrado de
colores (ADR-0024), código corto legible en la etiqueta, y el estándar universal debajo
(ADR-0030). En la caja CAYLA arrancaba desde abajo; aquí arranca cerca de la cima. Lo que separa
a los tres 5 del resto no es el modelo, es lo que se construye **encima**: el vocabulario de la
ropa (curva de tallas, temporada, paquete), la matriz como *vista* y como *forma de entrada*, y
la señal por talla. Y lo que separa a CAYLA de sí misma es la disciplina: el modelo existe, pero
**dos de los cuatro caminos que crean una prenda lo esquivan** (sección 2, mecanismo 1).

---

## 1. Fichas

Los tres 5, a fondo. Los siete 4, en corto: cada uno suma un mecanismo, no un sistema. Los
demás, en una línea.

### Lightspeed Retail — 5 · el estándar del sector

**Lo más resaltante**

1. **Cada variante es un SKU con inventario propio, siempre.** En X-Series un producto con
   variantes lleva hasta **3 atributos** (Talla, Color, Material…) y hasta **200 combinaciones**;
   cada combinación nace con su SKU y su stock. En R-Series el mismo concepto se llama *matrix*:
   *attribute sets* predefinidos (**Color, Size, Color/Size**) o propios, valores compartidos
   (descripción, precio y costo por defecto) que bajan a todas las hijas, y variantes que se
   asignan con un desplegable («Red and Small»).
2. **Reposición por variante y por local.** Cada variante tiene, **por outlet**, punto de
   reorden o mínimo/máximo, ubicación física y método de reposición — de ahí salen las «órdenes
   de compra automáticas» que §E le atribuye.
3. **Un producto simple se convierte en producto con variantes** sin recrearlo — el caso «esta
   blusa que vendía en talla única ahora viene en tres tallas».
4. **Importación por hoja de cálculo con variantes de matriz**, con formato documentado.

**Lo que NO copiar.** El tope de 200 combinaciones no molesta a CAYLA (25 posiciones por blusa),
pero es un recordatorio de que las matrices se diseñan con techo. El tercer atributo: talla y
color bastan; un «largo» o «material» va en atributos del modelo, no en la identidad de la
variante. Y el precio (US$89–289/mes).

**Qué se lleva CAYLA**

- **Reposición por variante y por sede** → ya está: `stock.stock_minimo` por sede
  (`fijar_stock_minimo`; el guard de `0053` para que `recalcular_stock` no lo borre),
  `minimoPorSede` y `reorderPoint = velocidad × lead time + mínimo` en
  `lib/inteligencia.ts:119-122`. Falta el **máximo** (para no sobre-reponer) y que la señal
  abra una orden — es la propuesta 3 del Radar del 08-sep y va en las columnas 3 y 6.
- **Convertir simple → con variantes / agregar una talla a un modelo que ya existe** → hoy solo
  el conteo sabe hacerlo («recordar el modelo», `conteo_crear_variante` con `p_producto_id`);
  «Nuevo producto» solo crea modelos nuevos y «Recibir» duplica el modelo (hallazgo del 04-sep).
  Mecanismo 9.
- **Valores compartidos que bajan a las hijas** → `NuevoProductoForm` ya lo hace (precio/costo
  por fila editable a partir del común). ✅

### ApparelMagic — 5 · moda, EE. UU.

**Lo más resaltante**

1. **La matriz estilo / color / talla se usa en todo el sistema**, no solo en el catálogo: en
   órdenes, en inventario, en producción. Con **curva de tallas y *prepacks*** como objetos
   propios (documentación de terceros y reseñas del sector; la web oficial habla de *Style
   Matrix*).
2. **Fecha de agotamiento pronosticada por SKU** — «drill down by SKU level and see its current
   inventory and its **forecasted sell-out date**». Es, literalmente, la frase de §L del
   documento («avisa qué talla se está quedando»), a nivel de talla.
3. **UPC con prefijo administrado y asignación automática**: nadie inventa un código de barras.
4. *Available to promise*: disponibilidad futura por SKU para comprometer pedidos.
5. Multi-almacén, multi-canal, valorización con costo al día; PLM y portal de ventas B2B.

**Lo que NO copiar.** Nace mayorista: *prepacks*, *allocation*, portal B2B, curva para vender por
paquete a tiendas ajenas. §D: «es para US$5–100 M», US$120–1 250/mes, español 1/5, aprendizaje
1/5. Si CAYLA no vende a terceros, medio producto sobra.

**Qué se lleva CAYLA**

- **La fecha de agotamiento por talla** → `inteligencia.ts` ya calcula `diasInventario` por
  variante (`stock / velocidad`); lo que no hace es **compararla con sus hermanas** — la M que se
  agota en 6 días mientras la S y la L tienen para 40 es «la talla que se está quedando», y hoy
  nadie la nombra. Mecanismo 4; se desarrolla en la columna 6.
- **Código asignado automáticamente, sin excepción** → `fn_asignar_codigo_variante` existe y es
  mejor que un UPC (es legible), pero **no corre en dos de los cuatro caminos de alta**.
  Mecanismo 1.
- **Curva de tallas como objeto** → `categorias.tallas_sugeridas` es el orden (S < M < L), no la
  proporción (cuántas de cada una). Mecanismo 10; es decisión de negocio.

### Uphance — 5 · moda, Reino Unido

**Lo más resaltante**

1. **Pronóstico «at style, color, and size rather than at style total»** — la única de las 16 que
   lo dice con esas palabras.
2. **Traslados conscientes de la curva de tallas** entre tiendas y 3PL, y **reposición en
   proporciones de curva** («size-curve pack ratios rather than single units»).
3. **Gestión multi-temporada**: un modelo *carries across* varias temporadas (carryover), con
   calendario de *drops*.
4. **Especificación graduada**: plantillas de ficha técnica con medidas por talla («graded
   specifications across a full size run»), *tech packs* con desglose por colorway, versionados.
5. Stock por ubicación, escaneo, bitácora de cambios de inventario, *linesheets* y pedido B2B con
   entrada por corrida de tallas y disponibilidad en vivo por talla.

**Lo que NO copiar.** Sin caja (1/5), aprendizaje 2/5, español 1/5 (§D). El *tech pack* y la
especificación graduada son de la columna de Producción (el Taller), no de esta.

**Qué se lleva CAYLA**

- **El traslado que mira la curva** → `sugerenciaTraslado` (`inteligencia.ts:137-160`) ya
  propone mover *una variante* de la sede que le sobra a la que le falta. La versión con curva
  dice: «AQP tiene 4 M y 0 S de la blusa; TRU tiene 3 S y vende una al mes» — la misma regla,
  leída por modelo. Mecanismo 5.
- **Carryover de temporada** → `productos.temporada` es un texto (`'Otoño 2026'`); un modelo
  que sigue vendiéndose en la temporada siguiente hoy solo cambia el texto o no lo cambia.
  Mecanismo 8, junto con precio.
- **Pronóstico por talla** → mecanismo 4.

### Los siete con 4 — un mecanismo cada uno

- **Shopify (4)** — hasta **3 opciones** y **2 048 variantes por producto** (antes 100; la ayuda
  advierte que apps y temas viejos aún se quedan en 100), cada variante con precio, SKU, código
  de barras, stock por local, país de origen y partida arancelaria; hasta 250 imágenes por
  producto con **una imagen por variante**; las opciones se conectan a *metafields* de la
  categoría. *Se lleva:* **foto por color** — `variantes.foto_url` existe desde `0001` y nadie la
  usa: todo lee `productos.foto_url` (`lib/catalogo.ts:119`, `buscar/page.tsx:106`). Mecanismo 7.
  Y la confirmación de ADR-0030: la taxonomía a la que Shopify conecta sus opciones es la misma
  Standard Product Taxonomy que CAYLA puso debajo de su vocabulario.
- **Odoo (4)** — atributos con valores y *display type* (Color con hex → muestra el color),
  creación de variantes *instantly / dynamically / never*, **precio extra por valor de atributo**
  («XL: +S/5»), cada variante con su inventario, y el mecanismo que importa: **Variant Grid
  Entry** — en una orden de venta o de compra, la prenda se abre como cuadrícula talla × color y
  se teclean las cantidades en cada celda; cada celda con cantidad se vuelve una línea. *Se
  lleva:* la **cuadrícula como forma de entrada** en Recibir mercadería y en órdenes de
  producción. Mecanismo 3. *No copiar:* el modo *dynamically* (crear la variante recién al
  venderla): `variantes_identidad_unica` y el stock por variante exigen que exista antes.
- **NetSuite (4)** — *Matrix Items*: padre sin stock, hijas por talla × color con SKU e
  inventario propio. *Se lleva:* nada nuevo — **es el modelo que CAYLA ya tiene** (`productos` /
  `variantes`). El Blueprint lo cerró el 05-sep.
- **Zoho Inventory (4)** — *item groups* con hasta **3 atributos**, variantes generadas por
  combinación, y un **patrón de SKU** (nombre del grupo + atributos + texto) aplicado a todas
  las hijas para no teclear una por una; *composite items* (kits). *Se lleva:* nada — el patrón
  de SKU de Zoho es lo que `fn_componer_codigo_variante` ya hace, y mejor (`BLU-0042-AZM-M` es
  estable y legible, ADR-0025).
- **Katana (4)** — hasta **10 opciones × 40 valores**, código de variante por combinación,
  importación de variantes por plantilla, **agregar variantes a productos existentes por
  importación**; y las tres cantidades disponible / comprometido / esperado (Blueprint). *Se
  lleva:* **agregar una talla o un color a un modelo que ya existe**, fuera del conteo.
  Mecanismo 9.
- **Doss (4)** — plataforma componible (tablas, formularios y flujos sin código), SKUs y
  tamaños de paquete, multi-almacén y 3PL; ropa entre sus industrias. *Se lleva:* nada concreto —
  su 4 es por flexibilidad, no por vocabulario de moda (§D: «otro segmento»).
- **INVY (4)** — variantes por talla, color, fecha de vencimiento y código de barras; alertas de
  stock mínimo. *Se lleva:* es la vara local: variantes + códigos + mínimos **en un plan de
  S/169**. CAYLA ya lo tiene; la diferencia está en lo que se construye encima.

### Los seis restantes, en una línea

- **Square (3):** *variations* con SKU, precio y stock propios; *option sets* que generan las
  combinaciones. Planas: sin vocabulario de moda ni matriz como vista.
- **Loyverse (3):** variantes con SKU, precio y stock; nada más.
- **Dynamics 365 BC (3):** *item variants* sin generador de matriz — variante por variante
  (Blueprint); la matriz la pone un tercero.
- **Bsale (3):** variantes una por una con «Crear nueva variante» (ej. «TALLA 40»), SKU y código
  de barras por variante, stock por variante, y una «variante por defecto» con estrella. Sin
  generador ni vista de matriz.
- **Alegra (2)** y **Defontana (2):** código plano — §E lo llama «el hueco funcional más grande
  del mercado peruano». Alegra es «el nuestro hoy».

---

## 2. El estándar combinado de talla y color

| # | Mecanismo | De quién | Por qué importa | Dónde aterriza | Hoy |
|:-:|---|---|---|---|:-:|
| 1 | **Toda variante nace con color del vocabulario y código corto, por cualquier camino** | Lightspeed (variante = SKU siempre), ApparelMagic (UPC automático), Zoho (patrón de SKU) | Sin código no hay etiqueta legible (ADR-0025: el SKU de 40 caracteres es lo que la Zebra no lee), no hay `codigos_barras`, y el vocabulario cerrado (ADR-0024) se rompe por atrás: «azul» y «Azul marino» vuelven a convivir | **Arreglado en local el 2026-09-11, el mismo día** (`0059_alta_con_vocabulario.sql`): `fn_normalizar_color` (una regla para los cuatro caminos: código del vocabulario → nombre exacto → texto libre sin código), `crear_producto_con_variantes` y `recibir_lote` con la misma firma guardan `color_id` y asignan código; los dos formularios eligen del vocabulario. Verificado en navegador: 14 variantes desde «Nuevo producto» (`BLU-0002-AZM-S…`) y una desde «Recibir» (`FAL-0002-VIN-M`), todas con código y en `codigos_barras`. **Y en producción la misma tarde** (`unificacion/39`, entonces `38`, pegada con autorización explícita): las 2 variantes con `"azul "` pasaron a Azul marino con código (`JEA-0001-AZM-26`, `CMS-0001-AZM-S`); post-check con 0 variantes sin código y los tres cuerpos iguales a los del repo. Era: `0035:65` y `0031:98` insertaban texto sin `color_id` y sin código; solo el conteo y el importador lo hacían bien | ✅ local y producción |
| 2 | **La matriz talla × color como vista de stock** | Lightspeed (*matrix*), ApparelMagic («used throughout»), Odoo (grid) | «Veinticinco posiciones» se leen de un vistazo en una cuadrícula; en una lista de 25 filas se leen una por una | `InventarioAgrupado.tsx:193-215` expande el modelo en **filas** «talla · color» con stock por sede; la ficha `/producto/[varianteId]` muestra **una** variante sin sus hermanas (`page.tsx:150-200`) y sigue con `text-neutral-*` pre-brandbook | 🟡 |
| 3 | **Entrada por cuadrícula** (Recibir, producción, traslado) | Odoo (*Variant Grid Entry*), Uphance (*size-run entry*), Lightspeed (import de matriz) | Recibir 12 unidades de una blusa es una cuadrícula con 12 celdas, no 12 filas agregadas a mano | La matriz existe **solo al crear** (`NuevoProductoForm.tsx:96-103`, «Generar variantes»); `RecibirLoteForm` agrega ítem por ítem; `OrdenesProduccion.tsx:9` ya tiene líneas por talla/color (`OrdenLinea`) pero se llenan una a una | 🟡 |
| 4 | **La talla que se está quedando** (señal por talla dentro del modelo) | ApparelMagic (*sell-out date* por SKU), Uphance (*forecast at size*) | §L: «Esa frase es el producto entero». §G: «el mayor motivo de rebajas es el desbalance de tallas» | `inteligencia.ts` calcula `diasInventario`, `reponerYa` y `estancado` **por variante** (`:117-121`) y nunca compara una talla con sus hermanas; grep `curva|rezagad` → 0. El dato (`movimientos` por variante) ya existe | 🟡 · se desarrolla en la columna 6 |
| 5 | **Traslado consciente de la curva** | Uphance | Mover la S que sobra en TRU a AQP donde falta es la mitad de «rotación por estilo» | `sugerenciaTraslado` (`inteligencia.ts:137-160`) ya propone por variante; falta leerlo por modelo (qué tallas faltan aquí y sobran allá) | 🟡 · columna 3 |
| 6 | **Reposición por variante y por sede, con mínimo y máximo** | Lightspeed (reorder point / min-max por outlet) | Sin máximo se sobre-repone lo que rota rápido en una sola sede | `stock.stock_minimo` por sede ✅, `reorderPoint` ✅, `sedesBajoMinimo` ✅; sin máximo; la señal no abre orden (Radar, propuesta 3) | ✅ / 🟡 |
| 7 | **Foto por color** | Shopify (una imagen por variante), Uphance | Una blusa en vino y en negro con una sola foto es media ficha | `variantes.foto_url` existe (`0001_init.sql:60`) y **nadie la escribe ni la lee**; todo usa `productos.foto_url` (`lib/catalogo.ts:119`) | 🟡 · esquema listo |
| 8 | **Precio por atributo y por temporada** | Odoo (*price extra* por valor; §E «precios que cambian por temporada»), Uphance (carryover) | «Las XL cuestan S/5 más» y «la temporada pasada baja 20 %» hoy se editan prenda por prenda | `variantes.precio / precio_oferta / precio_taller` por variante; `precio_oferta` se captura al crear y **la caja no la usa** (`RegistrarVentaModal.tsx:106`); `productos.temporada` es texto libre | 🟡 · cruza con el descuento de la caja (columna 1, mecanismo 3) |
| 9 | **Agregar una talla o un color a un modelo que ya existe** | Lightspeed (simple → variantes), Katana (import a existentes), el propio conteo | La segunda tanda de la misma blusa llega en una talla nueva; hoy eso es un modelo duplicado o esperar al próximo censo | Solo el conteo («recordar el modelo», `conteo_crear_variante` + `p_producto_id`); `/inventario/producto/nuevo` crea modelos nuevos; «Recibir» duplica (hallazgo del 04-sep) | 🟡 |
| 10 | **La curva de tallas como objeto** (orden + proporción) y los paquetes | ApparelMagic (size curve, prepacks), Uphance (pack ratios), Infor (Blueprint) | Comprar o producir «una curva» (1 S · 2 M · 2 L · 1 XL) es cómo piensa una marca; hoy la proporción vive en la cabeza de Felipe | `categorias.tallas_sugeridas` (`0009:12`) es el **orden**; no hay proporción ni paquete; `OrdenesProduccion` pide cantidad por talla a mano | ❌ · decisión de negocio |
| 11 | **Atributos ricos más allá de talla y color** (tejido, patrón, largo…) anclados al universal | Shopify (metafields de categoría ↔ taxonomía), Uphance (spec), Infor (fibra, origen — Blueprint) | La etiqueta de composición, la tienda en línea y el pronóstico de prendas nuevas (§G) los necesitan estructurados | `producto_atributos` (`0056:62-70`) + taxonomía (`0052`) existen; **solo el importador la llena**; el catálogo actual «no gana atributos ricos» (BACKLOG) | 🟡 |
| 12 | **Vocabulario de tallas** | (todos lo tratan como valor libre de una opción) | — | Sin tabla `tallas` **a propósito** (BACKLOG: agregarla tarde es barato, colores tarde es caro); `fn_token_talla` normaliza `único → U`, `estándar → STD` (`0047:184-190`); el orden vive en `tallas_sugeridas` | ✅ decisión consciente |

**Lo que ya está y ninguno de los 16 trae igual:** el modelo padre/hijas con identidad única
(`variantes_identidad_unica`, `0047:180`), que impide que cuatro personas creen la misma prenda
cuatro veces; el **código corto legible** (`BLU-0042-AZM-M`) impreso en la etiqueta — Zoho tiene
patrón de SKU y ApparelMagic UPC automático, pero ninguno un código que una Encargada lea;
el vocabulario cerrado de **30 colores con familia y anclaje al estándar universal** (ADR-0024 y
ADR-0030) — Shopify conecta sus opciones a su taxonomía, CAYLA pone la suya debajo sin perder
«Arena»; el **censo que es un conteo** que crea prendas al vuelo con el mismo camino que una
prenda real (ADR-0027); y el **importador con IA** que mapea al universal, no al vocabulario
propio (ADR-0035).

---

## 3. Lo que deliberadamente no se copia

- **El tercer atributo en la identidad de la variante** (Lightspeed, Zoho, Shopify: 3; Katana:
  10). Talla y color son la identidad; material, largo o estampado son atributos del modelo
  (`producto_atributos`), no una tercera dimensión de stock.
- **Crear la variante al venderla** (Odoo *dynamically*). En CAYLA la variante existe antes que
  su primer movimiento; es lo que hace posible el conteo y la identidad única.
- **Variante por variante** (Bsale, BC). La cuadrícula al crear ya está y es mejor.
- ***Prepacks* y *allocation*** (ApparelMagic, Uphance) mientras CAYLA no venda a terceros. Si
  algún día vende a tiendas ajenas, el paquete surtido entra por la columna de omnicanal, no por
  esta.
- **Fecha de vencimiento como variante** (INVY): es para bodegas.
- **Una tabla de tallas ahora.** Ya se decidió (BACKLOG): barata después, innecesaria hoy.

---

## 4. Orden sugerido para recolectar

De menor a mayor superficie, y el defecto primero. El 1 se hizo el mismo día, en local y en
producción; del 2 en adelante es el menú para que Felipe elija.

1. **Toda variante nace con color del vocabulario y código corto** (mecanismo 1). **Hecho en
   local el 2026-09-11**, con la decisión de Felipe de que «azul» es Azul marino:
   `0059_alta_con_vocabulario.sql` — `fn_normalizar_color` (una regla para los cuatro caminos),
   las dos RPC con la misma firma guardan `color_id` y llaman `fn_asignar_codigo_variante`, y el
   backfill resuelve los colores escritos a mano que calzan con el vocabulario sin pisar
   hermanas ya normalizadas. Los dos formularios eligen del vocabulario con el mismo `<select>`
   que `AltaEnConteo`. De paso: local arrastraba una segunda `recibir_lote` de 8 parámetros
   (0018) que producción ya no tiene; la 0059 la tira (ADR-0026).
   *Verificado en navegador:* «Blusa prueba vocabulario» con 7 tallas × Azul marino/Negro →
   14 variantes con `BLU-0002-AZM-S … BLU-0002-NEG-XXL` y dos entradas en `codigos_barras`
   cada una; «Falda prueba vocabulario» desde Recibir → `FAL-0002-VIN-M` con sus 2 unidades en
   almacén. Por SQL: texto «negro» calza (`NEG`), «Fucsia chillón» se conserva sin código, sin
   color → `-U`, y un código inventado falla con «El color XXX no está en el vocabulario de
   CAYLA».
   **Producción, la misma tarde:** `unificacion/39` (entonces `38`) pegada con autorización explícita de
   Felipe; pre-flight y post-check en el BACKLOG. Producción quedó con 0 variantes sin código
   (`JEA-0001-AZM-26`, `CMS-0001-AZM-S` incluidas) y desde ahí ningún modelo nuevo nace sin
   código, por ninguno de los cuatro caminos.

2. **La ficha del modelo muestra la matriz** (mecanismo 2). `/producto/[varianteId]` pasa a ser
   la ficha del **modelo**: cuadrícula talla × color con stock por sede en cada celda (piso y
   almacén), la variante actual resaltada; e `InventarioAgrupado` expande en cuadrícula, no en
   lista. Solo `apps/web`; de paso salen los `text-neutral-*` de esa pantalla.
   *Cómo verificas tú:* abres una blusa con 3 tallas × 2 colores → ves 6 celdas con números, no
   6 filas.

3. **Agregar talla o color a un modelo existente desde Inventario** (mecanismo 9). Un botón
   «Agregar talla/color» en la ficha del modelo que llama una RPC `agregar_variantes(p_producto_id,
   p_variantes)` — o reutiliza la mitad de `crear_producto_con_variantes` — con vocabulario y
   código desde el día uno. SQL: una función nueva.
   *Cómo verificas tú:* a la blusa de 3 tallas le agregas XL → nace `…-XL` con código, sin
   modelo duplicado.

4. **Entrada por cuadrícula en Recibir y en órdenes de producción** (mecanismo 3). La misma
   cuadrícula del punto 2, editable: cada celda es una cantidad. `RecibirLoteForm` y
   `OrdenesProduccion` ya tienen las líneas por variante; cambia la forma de llenarlas. Solo
   `apps/web`.
   *Cómo verificas tú:* recibes 12 blusas tecleando 6 celdas, no agregando 6 ítems.

5. **La talla que se está quedando** (mecanismos 4 y 5). En `inteligencia.ts`, por modelo y
   color: la talla cuyo `diasInventario` es menos de la mitad del de sus hermanas, o que ya se
   agotó mientras las otras siguen, se marca «curva rota»; y la sugerencia de traslado se lee
   por modelo. Es la columna 6 (IA accionable) — aquí queda anotado que **el dato ya existe** y
   no hace falta ninguna tabla nueva.

6. **Foto por color** (mecanismo 7). `variantes.foto_url` ya existe: subirla desde la ficha
   del modelo por color, mostrarla en Buscar y en la caja. Solo `apps/web` (Storage en local
   sigue apagado — ADR-0010 — se prueba en producción).

7. **Precio de oferta y temporada de verdad** (mecanismo 8). `precio_oferta` entra a la caja
   como precio vigente (y como descuento con motivo, columna 1); `temporada` deja de ser texto
   libre cuando haya dos temporadas reales en el catálogo — no antes.

8. **Curva de tallas y paquetes** (mecanismo 10). **Decisión de negocio primero:** ¿CAYLA compra
   y produce por curva (1-2-2-1)? Si sí, la proporción vive junto a `tallas_sugeridas` en
   `categorias` (o en el modelo), y las órdenes de producción y de compra la proponen. Si CAYLA
   vende a terceros algún día, el paquete surtido entra por omnicanal.

---

## 5. Fuentes leídas el 2026-09-11

- Lightspeed Retail X-Series — *Adding products with variants*, *How to change a standard
  product into a product with variants*, *Adding products and inventory*:
  https://x-series-support.lightspeedhq.com/hc/en-us/articles/50084017265819 ·
  https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534328900507 (los artículos
  responden 403 a lectores automáticos; se leyeron por los extractos del buscador). R-Series —
  *Creating matrixes*: https://retail-support.lightspeedhq.com/hc/en-us/articles/229130188
- ApparelMagic — https://apparelmagic.com/inventory-management/ · https://apparelmagic.com/erp-software/
  · reseñas del sector sobre *Style Matrix*, curva y *prepacks* (erpfocus, 180systems, appintent).
- Uphance — https://www.uphance.com/features/ · https://www.uphance.com/apparel-erp/ ·
  https://www.uphance.com/inventory-management/ · https://www.uphance.com/line-planning/
- Shopify — *Add variants*: https://help.shopify.com/en/manual/products/variants/add-variants
- Odoo 18 — *Product variants*:
  https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/products/variants.html
  · *Product variants on quotations and sales orders* (Variant Grid Entry):
  https://www.odoo.com/documentation/18.0/applications/sales/sales/send_quotations/orders_and_variants.html
- Zoho Inventory — *Item groups*: https://www.zoho.com/us/inventory/help/items/item-groups.html
- Katana — *How to create variants*: https://support.katanamrp.com/en/articles/5967047-how-to-create-variants
  · *Add variants to existing items via import*: https://katanamrp.com/blog/add-variants-existing-products-materials/
- Square — *Create and edit item options and variations*: https://squareup.com/help/us/en/article/6689-item-options
- Bsale Perú — *¿Cómo crear un Producto?*: https://ayuda.bsale.com.pe/support/solutions/articles/151000017039
- Doss — https://www.doss.com/products/platform · https://www.doss.com/erp
- INVY — https://www.invyperu.com/
- Blueprint ERP CAYLA (artefacto del 2026-09-05): NetSuite *Matrix Items*, BC sin generador de
  matriz, Katana tres cantidades, Infor *Style → Colorway → Talla* y *pre-packs*.
- Producción, medido el 2026-09-11 con una sola consulta de lectura sobre `retail.variantes`,
  `retail.colores` y `retail.codigos_barras`.
