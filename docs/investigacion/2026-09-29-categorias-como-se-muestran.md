# Cómo otras empresas muestran visualmente sus categorías de producto

> Investigación hecha por un agente para el spike `docs/maquetas/categorias-iconos-2026-09/` (2026-09-29). Las medidas salen del DOM de cada sitio, no de capturas. **Corrección al encargo:** las categorías activas son **42** (Indumentaria 18, Calzado 7, Accesorios 8, Bisutería 4, Belleza 1, Papelería 4), consultadas en la base local; el informe dice 41 en algunos sitios porque partió del encargo. Quedó sin abrir: Mango, Depop, Flaticon, Lightspeed (403) y los admin de Shopify y Square (login).

Fecha: 2026-09-29. Pregunta: ¿cómo hacer que la tarjeta de «Categorías» del ERP de CAYLA (6 familias, 42 categorías, casi sin fotos) permita identificar el tipo de producto de un vistazo?

## 0. Cómo se hizo (y qué no se pudo)

- Casi todos los sitios de moda bloquean `WebFetch` (403 o tiempo agotado). Los abrí en el navegador integrado y leí el DOM de la página viva: texto, `alt` de las imágenes, tamaño real renderizado en px CSS (viewport de 1024 px) y origen de cada imagen. Las capturas del panel salieron atrasadas o en blanco, así que **las medidas son del DOM, no calculadas a ojo**. Solo vi una captura útil de Platanitos y una parcial de Uniqlo.
- Para los sistemas de íconos no me basé en memoria: bajé los metadatos oficiales de cada paquete (unpkg / Google Fonts / Iconify) y conté qué prendas existen por nombre. Es un conteo por nombre de ícono, no una inspección visual de cada dibujo.
- **No pude abrir:** Mango (403), Depop (desafío de Cloudflare, no lo rodeé), Flaticon (403), el artículo de Lightspeed X-Series (403; solo tengo el resumen del buscador), el admin de Shopify y el de Square (piden login). **No confirmé:** los colores de grupo de Toast (la doc que abrí no lo dice). **No revisé:** Cin7, NetSuite, Lightspeed R-Series.
- Una discrepancia en el encargo: la lista de Indumentaria trae **18 nombres**, no 17 (Abrigos, Blazers, Bodys, Camisas y Blusas, Casacas, Chalecos, Chompas, Conjuntos, Enterizos, Faldas, Jeans, Pantalones, Poleras, Polos, Ropa interior/Lencería, Shorts, Tops, Vestidos). Medí contra los 18. Solo medí Indumentaria (la familia más difícil); no conozco los nombres de las otras 23 categorías.

## 1. Tabla de lo que realmente vi

### 1A. Moda y retail online

| Empresa | Qué usa | Forma y tamaño | Qué hace bien | Qué NO aplica a CAYLA |
|---|---|---|---|---|
| Zara Perú — https://www.zara.com/pe/es/ (menú abierto) | Solo texto, en mayúsculas. 62 enlaces del menú, ninguno con img ni svg | Lista vertical | Une prendas parecidas con una barra para que la lista no crezca: VESTIDOS \| MONOS, CAMISAS \| BLUSAS, TOPS \| BODIES, SHORTS \| BERMUDAS, ABRIGOS \| TRENCH | Es tienda: la foto la ponen los productos que están debajo |
| H&M EE. UU. — https://www2.hm.com/en_us/women/shop-by-product/view-all.html | Solo texto. 36 entradas en fila de píldoras, 0 img, 0 svg | Alto 48 px cada una (área táctil) | 36 categorías legibles en una pantalla sin una sola imagen. Funde prendas: «Coats & Jackets», «Blazers & Vests», «Sweaters & Cardigans», «Jumpsuits & Overalls», «Tops & T-Shirts» | Mezcla prendas con campañas («Party Wear», «Concert Edit») |
| Uniqlo EE. UU. — https://www.uniqlo.com/us/en/ (bloque «Search by category») | Foto de producto (los `alt` son «Gray Sweat Oversized Full-Zip Hoodie», «Red cropped bra top»; origen `.jpg` de su CMS) + etiqueta | Tarjeta 144×105 px; foto cuadrada 80×80 px arriba, sin radio (≈76 % del alto), etiqueta debajo. 15 categorías | Foto chica y texto siempre presente | Exige una foto curada por categoría. CAYLA casi no tiene fotos |
| ASOS EE. UU. — https://www.asos.com/us/women/ | Barra superior en texto; en el home, carrusel de tarjetas con foto (Dresses, Tops, Jackets & coats, Knits, Chic sets, Shoes & boots) | Foto vertical 151×194 px, esquinas rectas | Foto grande para pocas categorías | Son 6 curadas, no 41 |
| Nordstrom — https://www.nordstrom.com/browse/women/clothing | **Híbrido:** 6 categorías destacadas con foto de modelo + lista completa de 16 en texto | Foto 144×180 px, esquinas rectas | Foto para las que más importan, texto para todas | Fotos de modelo curadas |
| Zalando España — https://www.zalando.es/ropa-de-mujer/ | Árbol lateral de texto, 19 categorías (Vestidos, Sudaderas, Camisetas y tops, Vaqueros, Jerséis y cárdigans, Chaquetas, Blazers, Abrigos, Gabardinas, Monos…) | Lista vertical | Nombres claros y ordenados. Las fotos aparecen solo en los productos (227×328 px, radio 12) | — |
| Ralph Lauren — https://www.ralphlauren.com/women-clothing | Navegación solo texto | — | — | No vi un bloque de categorías con imagen; solo confirmo el menú |
| SSENSE — https://www.ssense.com/en-us/women | Navegación solo texto (Categories, Accessories, Bags, Clothing, Shoes) | Fotos solo en productos (184×276 px) | Mínimo ruido visual | — |
| Falabella Perú — https://www.falabella.com.pe/falabella-pe | Menú de ~20 departamentos en texto. Bloque «Busca por categoría»: 9 tarjetas de foto con el rótulo **dentro de la imagen** (`alt`: Moda Mujer, Zapatos, Belleza…) | Foto vertical 157×255 px | Departamentos grandes reconocibles | Rótulo pintado en la foto: no se traduce ni se edita. No sirve para 41 |
| Ripley Perú — https://simple.ripley.com.pe/mujer/ropa-mujer/chompas-y-cardigans | En la página de categoría, los enlaces a hermanas son texto puro (Poleras, Casacas, Abrigos, Blazers, Vestidos, Blusas, Faldas, Pantalones) | Enlaces de 11–24 px de alto | Mismo vocabulario que CAYLA (chompa, polera, casaca) | No revisé su menú principal |
| Platanitos — https://platanitos.com/pe | Barra superior: minicono ilustrado tipo emoji (~20×24 px) + texto (Ofertas, Mujeres, Hombres, Niñas, Niños, Hogar). Bloque «Lo más Top»: 8 miniaturas + etiqueta (Deportivas, Sandalias, Urbanas, Botas, Estiletos…) | Miniatura 67×54 px en el DOM; en la captura se ven redondas de ~40 px con insignia «TOP» | Ícono chico + texto en el primer nivel | Son 8 categorías de calzado con foto de producto |

### 1B. Marketplaces

| Empresa | Qué usa | Forma y tamaño | Qué hace bien | Qué NO aplica a CAYLA |
|---|---|---|---|---|
| Mercado Libre Perú, home — https://www.mercadolibre.com.pe/ | **Ícono + etiqueta** para las 32 categorías de primer nivel. Es un solo ícono por familia: «Ropa y Accesorios» = una polera; «Belleza» = maquillaje; «Joyas y Relojes» tiene el suyo | Imagen de ~53 px de ancho, etiqueta debajo | Reconocimiento inmediato del nivel más ancho | — |
| Mercado Libre Perú, índice — https://www.mercadolibre.com.pe/categorias | **Solo texto**: cientos de subcategorías en listas. 0 svg, 0 íconos | Lista en columnas | Escala a cientos sin dibujar nada | — |
| Etsy — https://www.etsy.com/ | Menú «Categorías» en texto. El home muestra tarjetas con foto de *intereses editoriales* (no tipos de producto) | Foto vertical 221×276 px, radio 8 px | — | Son curaduría, no taxonomía |
| Amazon — https://www.amazon.com/ | Tarjetas con **cuatro fotos** de producto, una palabra bajo cada una (Auriculares, Tabletas, Juegos, Altavoces; Ropa, Rastreadores…) | Cuatro miniaturas de 143×143 px por tarjeta | Varias fotos por tarjeta aclaran que es una colección, no un producto | Necesita muchas fotos por categoría |
| Vinted — https://www.vinted.com/catalog | Navegación superior solo texto (Women, Men, Designer, Kids, Home…) | — | — | Solo vi el nivel superior |

### 1C. Puntos de venta y back-office (lo más cercano a CAYLA)

| Sistema | Qué usa | Forma y tamaño | Qué hace bien | Qué NO aplica a CAYLA |
|---|---|---|---|---|
| **Odoo 18, POS** (código fuente) — https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/models/pos_category.py y https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/static/src/app/generic_components/category_selector/category_selector.xml | **Color + texto, con foto opcional.** Cada categoría trae un `color` entero (por defecto al azar de 0 a 10, una paleta de 11) y una `image_128` opcional. Un ajuste «Show category images» la enciende o apaga | Botón de **4 rem (64 px) de alto**; con imagen: foto cuadrada en el 33 % del ancho y texto en el 67 % (hasta 3 líneas); sin imagen: el texto ocupa el 100 % | Lo más parecido a la pantalla de CAYLA. La categoría siempre tiene identidad (color) aunque no haya foto | El color es de venta rápida, no de una tabla de administración |
| **Odoo 18, back-office** — https://raw.githubusercontent.com/odoo/odoo/18.0/addons/product/models/product_category.py | Ni imagen ni color: solo `name`, padre, hijos y `product_count` | Árbol de texto con contador | Es exactamente «nombre + N productos» | — |
| Odoo Apps Store, «POS Category Slider» — https://apps.odoo.com/apps/modules/17.0/bi_pos_slide_category | Carrusel de imágenes de categoría; **sin imagen, el nombre va centrado** | Carrusel horizontal | Fallback sin imagen | Es un módulo de terceros |
| Loyverse — https://help.loyverse.com/help/items-categories y https://help.loyverse.com/help/home-sale-screen-layouts | Categoría = **color**. Artículo = color y forma, o foto. Vista Grid «cuando te apoyas en fotos o íconos»; vista List prioriza texto | Grilla de 3 columnas | Color como identidad cuando no hay foto | La doc no dice qué ve un artículo sin foto |
| Square for Retail — https://squareup.com/ca/en/the-bottom-line/inside-square/visual-browse y https://community.squareup.com/t5/Questions-How-To/Can-I-add-a-photo-to-the-Category-tiles-in-Square-for-retail/td-p/655660 | Categoría = **color + texto**. Un usuario «Square Champion» (no empleado, abril de 2023) dice que no hay foto de categoría. Los artículos sí llevan foto, precio y número de variantes | Grilla de tarjetas | Foto solo donde hay producto | La fuente sobre categorías es un usuario, no Square |
| Clover — https://docs.clover.com/dev/docs/managing-categories | Categoría con `colorCode` hexadecimal; la doc no menciona imagen ni ícono | — | Color por categoría | — |
| Lightspeed X-Series (solo resumen del buscador; el artículo dio 403) — https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534083091867-Setting-up-quick-keys | «Quick keys»: etiqueta + color + foto opcional; una sola capa de carpetas | — | Foto opcional por tecla | No lo pude abrir |
| Shopify (código de Polaris, su sistema de diseño del admin) — https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Thumbnail/Thumbnail.module.css | El componente `Thumbnail` recibe **una URL de imagen o un ícono SVG** en el mismo contenedor cuadrado | 24, 40, 60 (por defecto) y 80 px, esquinas redondeadas | Un solo cajón para foto o ícono | No pude abrir el admin real (login) |

### 1D. Sistemas de íconos: ¿cuántas de las 18 prendas de Indumentaria tienen ícono propio?

Conteo por nombre de ícono, en el paquete oficial de cada sistema (fuentes en la sección 5):

| Sistema | Íconos | Prendas cubiertas (de 18) | Lo que falta |
|---|---|---|---|
| Icon Park (ByteDance) | 2 658 | **12** | blazer, body, camisa/blusa distinta del polo, conjunto, jeans, top |
| Hugeicons | 6 117 | 10 | abrigo, blazer, body, casaca, conjunto, enterizo, falda, jeans |
| Lucide Lab (comunidad, no es el Lucide oficial) | 388 | 9 | abrigo, blazer, body, conjunto, enterizo, jeans, polera, polo, top |
| MingCute | 3 364 | 7 | blazer, body, casaca, chompa, jeans, pantalón, polera… |
| Phosphor 2.1.1 | 1 512 | 5 (polo, camisa plegada, vestido, pantalón, polera) | abrigo, chompa, casaca, falda, chaleco, short… (tiene `coat-hanger`, no un abrigo) |
| Iconoir | 2 020 | 5 | abrigo, chompa, casaca, falda, vestido… |
| Tabler 3.48 | 5 166 | 2 (`shirt`, `jacket`) | casi todo |
| Lucide 1.48 (oficial) | 1 854 | 1 (`shirt`) | casi todo |
| Material Symbols | 6 126 | 0 específicos: solo `apparel` (prenda genérica) y `checkroom` (la percha que CAYLA usa hoy) | todo |

- **Ninguno de los 18 sistemas medidos tiene blazer, body ni conjunto**; jeans solo existe en sets de emoji (Noto, Twemoji, Fluent Emoji). «Waistcoat», «jumpsuit» y «bodysuit» dan 0 resultados en Iconify (238 sets, 379 052 íconos).
- Catálogos comerciales: Noun Project lista 700 íconos para «blazer», 189 «jumpsuit», 210 «bodysuit», 391 «waistcoat», 2 805 «sweater», 2 301 «skirt» (https://thenounproject.com/search/icons/?q=blazer, `?q=jumpsuit`, etc.). Existen, pero de autores distintos, con estilos mezclados. Flaticon dio 403.
- **Tamaño mínimo (mi prueba, subjetiva):** dibujé 13 prendas de Icon Park de 16 a 56 px. A 16–24 px, polera, chompa, cárdigan, casaca y abrigo se ven como la misma silueta de manga larga. Vestido, falda, short, pantalón, chaleco y polo sí se distinguen incluso a 16–20 px porque su silueta cambia. A 32 px empiezan a separarse por cuello y cierre; a 40–56 px se distinguen. Es una inspección mía, no un estudio.
- **Guías de tamaño:** Material Design usa 24 dp de estándar; los diseñadores de Material Symbols dibujan versiones ópticas de 20, 40 y 48 (20 para densidad alta, 40 y 48 para títulos) y cambian el grosor del trazo según el tamaño (https://developers.google.com/fonts/docs/material_symbols). Polaris, en el admin de Shopify: miniaturas de 40 (pequeña), 60 (por defecto) y 80 px.

## 2. Qué dice la investigación de usabilidad (páginas que abrí)

- **NN/g, íconos:** «Universal icons are rare.» Casi todo ícono necesita una etiqueta de texto siempre visible. Solo casa, imprimir y lupa se reconocen sin etiqueta. https://www.nngroup.com/articles/icon-usability/ y https://www.nngroup.com/videos/icon-text-labels/
- **NN/g, cómo probar íconos:** mostrarlos **sin** etiqueta y preguntar qué esperan encontrar. Si las respuestas no coinciden, descartar el ícono («ditch that icon idea»). https://www.nngroup.com/articles/icon-testing/ y https://www.nngroup.com/articles/international-shoppers-ecommerce-sites/
- **NN/g, íconos frente a fotos en categorías:** los íconos suelen funcionar mejor que las fotos porque «photos have too many details». https://www.nngroup.com/articles/international-shoppers-ecommerce-sites/
- **NN/g, menús:** imágenes e íconos deben ser apoyo, «rather than replacing clear text labels». https://www.nngroup.com/articles/menu-design/
- **NN/g, cuadrícula de imágenes o lista de texto:** para los niveles más amplios, el texto navega más rápido; las imágenes ayudan cuando las diferencias son sutiles. Las miniaturas diminutas «no ayudan»: las imágenes deben ser lo bastante grandes para reconocerse y llevar etiqueta. Una página con 42 opciones en cuadrícula de imágenes (West Elm) ocupó 12 pantallas y una participante solo miró la segunda fila antes de elegir. https://www.nngroup.com/articles/image-vs-list-mobile-navigation/
- **NN/g, páginas de categoría:** las imágenes ayudan más cuando las subcategorías son numerosas o poco familiares. https://www.nngroup.com/articles/category-pages/
- **Baymard:** usar fotografía de producto clara, no imagen decorativa o de estilo de vida, y mantener el mismo estilo en todas las miniaturas. Es investigación de tienda para clientas, no de administración. https://baymard.com/learn/ecommerce-category-page (En su blog, una nota vía buscador —no la página abierta— dice que la miniatura debe recortar mucho el producto o mostrar varios para que se lea como colección: https://baymard.com/blog/ecommerce-sub-category-pages.)

## 3. Patrones que se repiten (máx. 5)

1. **El nivel fino (tipo de prenda) va en texto puro.** Zara, H&M, Zalando, Ripley, la lista completa de Nordstrom y el índice de Mercado Libre: 6 de los 15 sitios web, más el árbol de categorías del back-office de Odoo. Ninguno pinta un ícono por prenda (0 de 15).
2. **La imagen se reserva para pocas categorías, de nivel alto o curadas:** Uniqlo (15), ASOS (6), Nordstrom (6), Falabella (9), Platanitos (8), Mercado Libre (32 íconos de familia), Amazon (tarjetas de 4), Etsy (editorial). 8 de 15. Tamaños vistos: 53 px (ícono de Mercado Libre) a 80 px (Uniqlo), o foto grande de 144–221 px de ancho cuando son pocas.
3. **Un ícono, si existe, es de la familia y no de la prenda** (Mercado Libre: una polera para toda «Ropa y Accesorios»; Platanitos: un minicono por «Mujeres», «Hombres»). CAYLA hoy hace exactamente esto.
4. **En POS y back-office, el color es la identidad de la categoría y la foto es opcional:** Odoo (paleta de 11 colores + `image_128` opcional), Loyverse, Square, Clover y Lightspeed. 5 de 5 sistemas con evidencia.
5. **El texto nunca se va, y si falta la imagen el texto ocupa todo el espacio** (Odoo POS: 67 % con imagen, 100 % sin ella; Odoo Category Slider: nombre centrado). Todos los que usan imagen mantienen etiqueta salvo Falabella, que la pinta dentro de la foto.

## 4. Qué contradice o matiza la idea de Felipe

La idea («un ícono por prenda para identificar de un vistazo») tiene respaldo en NN/g, que dice que los íconos suelen representar mejor una categoría que una foto. Pero la evidencia le pone cinco condiciones:

1. **Sin etiqueta no funciona.** NN/g: casi todo ícono es ambiguo sin texto. El nombre tiene que seguir en la tarjeta; el ícono ayuda, no reemplaza.
2. **No existe un set listo.** El mejor (Icon Park) cubre 12 de las 18 prendas; blazer, body y conjunto no existen en ninguno de los 18 sistemas medidos y jeans solo aparece en emoji. Un set de 18 en un mismo estilo hay que dibujarlo (o encargarlo), o se mezclan autores y el conjunto se ve inconsistente.
3. **A tamaño chico se confunden justo las prendas que H&M funde en texto.** En mi prueba, polera, chompa, cárdigan, casaca y abrigo colapsan a ≤24 px. H&M ya las junta: «Coats & Jackets», «Blazers & Vests», «Sweaters & Cardigans». Zara hace lo mismo con «Abrigos \| Trench». Las tres parejas más difíciles de CAYLA son abrigo/casaca, blazer/chaleco y polera/chompa.
4. **Ningún sitio de moda revisado usa ícono por prenda (0 de 15).** Al ser tiendas, la foto del producto aparece justo debajo y no lo necesitan. Es evidencia de que no es indispensable, no de que sea malo; lo que CAYLA hace en administración no tiene un caso directo para comparar.
5. **41 tarjetas grandes contradicen a NN/g:** con 42 opciones en cuadrícula de imágenes, la persona dejó de mirar tras la segunda fila. H&M muestra 36 entradas en píldoras de 48 px sin una imagen.

## 5. Recomendación para 41 categorías con pocas fotos (5 líneas)

1. **El nombre manda:** 15–16 px en semibold, junto con «N productos» y el prefijo de 3 letras en pequeño; el ícono nunca va solo (NN/g).
2. **Una miniatura cuadrada de 40 px a la izquierda, con tres contenidos por prioridad** (mismo cajón, como el `Thumbnail` de Polaris): foto de un producto de esa categoría si existe → silueta de la prenda en un solo estilo, a 24–28 px sobre fondo tenue del color de su familia → el prefijo de 3 letras. Icon Park cubre 12 de las 18 de Indumentaria; hay que dibujar las 6 restantes en el mismo trazo, o dejar esas con prefijo.
3. **Quitar la percha repetida de cada tarjeta:** la familia se identifica una vez en el encabezado del grupo (ícono + color, como Mercado Libre) y cada familia usa uno de 6 colores tenues (como la paleta de 11 de Odoo).
4. **Densidad de lista, no de vitrina:** tarjetas de ~64 px de alto (la de Odoo) en 2–3 columnas, o filas de 48 px (H&M), para ver las 18 de Indumentaria de una mirada; no tarjetas grandes.
5. **Probarlo con el método de NN/g antes de dibujar los 41:** mostrar los 18 íconos sin etiqueta a 5 colaboradoras y preguntar «¿qué esperas encontrar?». Los que fallen (probablemente polera/chompa/casaca/abrigo) cambian de silueta o se quedan con el prefijo.

## 6. Objeción y lo que no pidió

- **Objeción:** la lista de Indumentaria trae 18 categorías, no 17. Y el encargo asume que el problema es el ícono; la evidencia dice que el problema principal es **densidad y etiqueta** (H&M resuelve 36 categorías con texto puro), y que el ícono aporta más en las familias que en las prendas.
- **Lo que no pidió:** el mejor uso de la foto no es una por categoría, sino que la miniatura de cada categoría se llene sola con la foto de su producto más vendido en cuanto exista (el mismo cajón). Así el ícono es solo el relleno de hoy y se va sin rediseñar la tarjeta.

## 7. Fuentes

Páginas abiertas en el navegador (DOM leído):
- https://www.zara.com/pe/es/ · https://www2.hm.com/en_us/women/shop-by-product/view-all.html · https://www.uniqlo.com/us/en/ · https://www.asos.com/us/women/ · https://www.nordstrom.com/browse/women/clothing · https://www.zalando.es/ropa-de-mujer/ · https://www.ralphlauren.com/women-clothing · https://www.ssense.com/en-us/women
- https://www.falabella.com.pe/falabella-pe · https://simple.ripley.com.pe/mujer/ropa-mujer/chompas-y-cardigans · https://platanitos.com/pe
- https://www.mercadolibre.com.pe/ · https://www.mercadolibre.com.pe/categorias · https://www.etsy.com/ · https://www.amazon.com/ · https://www.vinted.com/catalog

POS y back-office:
- https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/models/pos_category.py
- https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/models/pos_config.py (`show_category_images`)
- https://raw.githubusercontent.com/odoo/odoo/18.0/addons/point_of_sale/static/src/app/generic_components/category_selector/category_selector.xml
- https://raw.githubusercontent.com/odoo/odoo/18.0/addons/product/models/product_category.py
- https://apps.odoo.com/apps/modules/17.0/bi_pos_slide_category
- https://help.loyverse.com/help/items-categories · https://help.loyverse.com/help/home-sale-screen-layouts
- https://squareup.com/ca/en/the-bottom-line/inside-square/visual-browse · https://community.squareup.com/t5/Questions-How-To/Can-I-add-a-photo-to-the-Category-tiles-in-Square-for-retail/td-p/655660
- https://docs.clover.com/dev/docs/managing-categories
- https://x-series-support.lightspeedhq.com/hc/en-us/articles/25534083091867-Setting-up-quick-keys (no abrió: 403, solo resumen del buscador)
- https://raw.githubusercontent.com/Shopify/polaris/main/polaris-react/src/components/Thumbnail/Thumbnail.module.css

Íconos:
- https://unpkg.com/lucide-static@latest/tags.json (Lucide 1.48.0)
- https://unpkg.com/@phosphor-icons/core@latest/?meta (Phosphor 2.1.1) · https://unpkg.com/@tabler/icons@latest/?meta (Tabler 3.48.0)
- https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=true · https://developers.google.com/fonts/docs/material_symbols
- https://unpkg.com/@iconify-json/{icon-park,hugeicons,mingcute,solar,iconoir,lucide-lab,mdi,ri,fluent,boxicons,reicon,uil,bi,carbon}/icons.json · https://api.iconify.design/search y /collections
- https://thenounproject.com/search/icons/?q=blazer (y `jumpsuit`, `bodysuit`, `waistcoat`, `sweater`, `skirt`)

Usabilidad:
- https://www.nngroup.com/articles/icon-usability/ · https://www.nngroup.com/videos/icon-text-labels/ · https://www.nngroup.com/articles/icon-testing/
- https://www.nngroup.com/articles/international-shoppers-ecommerce-sites/ · https://www.nngroup.com/articles/image-vs-list-mobile-navigation/ · https://www.nngroup.com/articles/category-pages/ · https://www.nngroup.com/articles/menu-design/
- https://baymard.com/learn/ecommerce-category-page · https://baymard.com/blog/ecommerce-sub-category-pages
