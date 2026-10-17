## 2026-10-17 (Tienda web: investigación de las diez grandes de la moda y propuestas de identidad para elegir)
Qué hice: investigué en paralelo las diez empresas de moda con más ventas (Inditex, H&M Group, Fast Retailing, Shein, Nike, adidas, LVMH, Kering,
Hermès y Chanel), leyendo sus informes y sus webs en vivo (tipografías y colores sacados del código de cada página), más el contexto de compra online en
el Perú y las funciones a futuro. Todo quedó en un solo archivo navegable, `docs/investigacion/2026-10-17-identidad-tienda-web.html`: fichas de las diez,
tabla de «lo mejor de cada una» por pantalla, la identidad propia (promesa y cinco códigos), cuatro tipografías, cuatro paletas con contraste medido,
cuatro direcciones de diseño, un probador con dos celulares que combina todo en claro y oscuro, voz y movimiento, 17 funciones a futuro marcables y un
resumen «Copiar mi elección».
Por qué así: Felipe elige mirando, no por descripción. Dos hallazgos verificados mandan sobre el resto: la tienda hoy usa casi la misma paleta y la misma
serif que la interfaz de hermes.com (crema, rojo ladrillo, EB Garamond), y DM Sans no tiene cifras tabulares, así que los precios de la tienda no se
alinean aunque 20 reglas de CSS lo pidan (medido con los archivos oficiales de Google Fonts).
Felipe se lleva: abrir el archivo, elegir en el probador y pegar «Copiar mi elección» en la conversación. La recomendación es Garamond afinado + Carmín +
La mezcla; Carmín cambia el rojo de la marca en todas partes y es decisión suya. No se tocó código de la tienda ni del ERP. No verificado: el modo oscuro
de la página solo se probó forzando el tema (el navegador del panel muestra los archivos locales en claro).

## 2026-10-17 (Tienda web: las letras de dafont, puestas en doce piezas de CAYLA)
Qué hice: recorrí dafont con «CAYLA» como vista previa (257 serifs, 100 sans y 200 manuscritas de uso comercial libre, más las más populares de pago),
leí la licencia de cada candidata en su página y en su zip, y con el OK de Felipe bajé 17. Quedó `docs/investigacion/2026-10-17-fuentes-dafont/index.html`:
15 letras (EB Garamond de hoy, 9 libres y 5 de pago o incompletas) en 12 piezas (logotipo, lema, letrero, web, etiqueta colgante, bolsa, post, celular, ficha, Club,
etiqueta cosida y precios), con vista por letra, por pieza y «tu texto», color rojo colibrí / carmín / tinta, favoritas y «Copiar». Sumé el servidor
`investigacion-docs` a `.claude/launch.json` porque el panel abre los archivos locales sin sus rutas relativas.
Por qué así: casi todo lo «de moda» en dafont es solo de uso personal, así que separé por licencia; descarté Ballet Harmony y Rosehot (sin ñ ni tildes) y pasé Edensor a «solo para mirar» (su versión gratis dibuja ñ y tildes sin su marca, medido glifo por glifo)
y Bauserif (mezcla de dos fuentes comerciales). Ninguna de dafont trae cifras de igual ancho salvo Bodoni XT y Vogue: los precios irían en otra letra.
Felipe se lleva: las fuentes viven en `fuentes/`, que git no sube (el repo es público); abrir la página con el servidor o desde el Finder. Elegir y pegar
«Copiar mis favoritas». Para compartir, `index.html?hojas` arma 25 páginas que se fotografían con Playwright y se juntan en
`letras-dafont-cayla.pdf` (8 MB, fuera de git): son imágenes, así que el PDF no lleva los archivos de las fuentes. No verificado: el uso web de cada licencia «100% Free» más allá de la nota del autor (Butler sí lo permite por escrito).

## 2026-10-17 (Tienda web: la palabra CAYLA con el dibujo del logo del escaparate)
Qué hice: Felipe eligió Ahellya y pidió que la palabra CAYLA use la letra del logo de la tienda física. Con su captura (284×80 px) medí cada letra y
la comparé contra cien fuentes. Ninguna tiene la A con la barra tan baja (17 % del alto), así que la rehice en vector: Libre Franklin (OFL) interpolada
entre 400 y 500 para igualar el grosor, con la barra de la A bajada, cada letra en su posición exacta y el colibrí del ERP al lado. Quedaron
`cayla-palabra-escaparate.svg` y `logo-escaparate.svg` en `docs/investigacion/2026-10-17-fuentes-dafont/`. La comparación y el PDF (24 páginas) usan ese
dibujo para la palabra CAYLA y la letra elegida para todo lo demás.
Por qué así: con 29 px de alto la letra no se puede identificar con certeza, y el dibujo vectorial no depende de la licencia de ninguna fuente.
Felipe se lleva: es provisional hasta tener el archivo original del logo (SVG, PDF, AI o el diseño de Canva). La captura traía un perfil de color de
pantalla ancha: convertida bien, la tinta es #B8422E, el mismo rojo colibrí del ERP, no un café. Falta el ® en el logo principal.

## 2026-10-17 (Tienda web: el logo oficial de CAYLA, calcado a vector)
Qué hice: con el archivo oficial en alta que pasó Felipe (2000×580, transparente) calqué el logo con un trazador propio (marching squares sobre el
canal alfa, en numpy, porque la máquina no tiene potrace): 8 contornos, que superpuestos al original solo difieren en el suavizado del borde (2,8 % de
los píxeles de tinta). Reemplazó al provisional: `logo-escaparate.svg` (completo), `cayla-palabra-escaparate.svg` y `colibri-escaparate.svg`, y la
comparación y el PDF (24 páginas) usan el colibrí y la palabra oficiales.
Por qué así: calcar el archivo da el dibujo exacto, sin adivinar la letra ni depender de su licencia; su A (barra al 17 %) no está en cien fuentes medidas.
Felipe se lleva: el logo usa #D13730, más vivo que el rojo del ERP (#B8412D); para texto rojo chico sobre crema #D13730 no llega a AA (4,3:1). Y el
colibrí oficial difiere un poco del que dibuja el ERP (`IsotipoCayla.tsx`, calcado a mano): unificarlos toca el ERP, tickets y etiquetas, y lo decide él.

## 2026-10-17 (Tienda web: la maqueta de la tienda con Ahellya y el logo oficial, en dos variantes)
Qué hice: copié la maqueta navegable de la tienda (v4) a `docs/maquetas/tienda-ahellya-2026-10/` con un selector arriba («Letra»: A, B, Hoy; también
`?v=a|b|hoy`): A pone Ahellya en todo; B, Ahellya en marca y títulos y Heebo (Google Fonts, cifras del mismo ancho) en botones, formularios y precios;
Hoy deja la tienda como está. En A y B el isotipo + «CAYLA» escrita pasan al logo oficial calcado (encabezado, menú, pie, tarjeta del club, colibrí de
la campaña) y «Aniversario CAYLA» se escribe con la letra del logo. Solo cambia la web del cliente; el ERP de la maqueta queda igual. Armé la lámina
`tienda-nueva-letra.pdf` (14 páginas: 8 pantallas del celular, 3 de la computadora, una en oscuro, portada y lo que queda por decidir).
Por qué así: Felipe elige mirando; con «Hoy» al lado se ve qué gana y qué pierde cada una. Ahellya es más ancha que EB Garamond: a 124 px el título de la
campaña se montaba sobre las fotos en la computadora, así que en A y B su tope bajó a 100 px.
Felipe se lleva: las fuentes, las 116 fotos reales (bajadas del enlace privado de la v4) y el PDF quedan fuera de git (`.gitignore` de la carpeta).
Verificado con Playwright en claro y oscuro, a 375 px sin desborde y en escritorio; el selector cambia la letra y la recuerda. Falta decidir A o B, el
rojo (#D13730 del logo o #B8412D del ERP) y la licencia escrita de Ahellya; no se tocó `apps/tienda`.

## 2026-10-17 (Tienda web: Felipe elige la variante B)
Qué hice: Felipe eligió B (Ahellya para la marca y los títulos, Heebo para botones, formularios y precios); la maqueta abre en B por defecto. Revisé la
licencia antes de construir: el zip de Ahellya trae solo los dos archivos de la letra, sin texto de licencia («© D.N.Barsukov 2014. All Rights Reserved»),
y el FAQ de dafont dice que su etiqueta de licencia «es solo una indicación» y que hay que preguntarle al autor si hay dudas. Contacto del autor: su
Behance (behance.net/string4) o un mensaje privado en dafont.
Por qué así: la tienda es pública y el repo también; subir la letra sin permiso escrito la redistribuye. Heebo (OFL, Google Fonts) y el logo (de CAYLA) no
tienen ese problema.
Felipe se lleva: pedir el permiso escrito al autor; mientras tanto se puede construir Heebo y el logo oficial en `apps/tienda`, con los títulos en EB
Garamond hasta que llegue.

## 2026-10-17 (Tienda web: Heebo y el logo oficial, construidos en `apps/tienda`)
Qué hice: con el OK de Felipe construí la parte de la variante B que no depende de la licencia de Ahellya. Heebo reemplaza a DM Sans en toda
la tienda y en las imágenes para compartir. El logo oficial (colibrí y palabra) vive en `lib/marca.ts` como un solo dibujo y lo pinta
`components/Marca.tsx` con el color de cada lugar: encabezados, menú, pie, tarjeta del Club y el «CAYLA» del título de una campaña; el colibrí
oficial reemplaza al PNG en la campaña, la entrada, las ayudas, el ícono de instalar, las imágenes para compartir y los íconos de la app.
Los títulos siguen en EB Garamond hasta que llegue el permiso de Ahellya.
Por qué así: el calcado bajó de 28 KB a 3,3 KB (tolerancia de media unidad, igual de fiel al medirlo), así que va escrito en la página, sin
una petición aparte y sin un instante sin logo; y las imágenes de `next/og` lo arman del mismo trazo, sin pedir nada a la red. Un
`max-width: 100%` dejaba el logo en 0 px dentro del enlace (un SVG así cuenta como «comprimible»): se quitó.
Felipe se lleva: tipos, lint, pruebas, Knip y `next build` en verde, y la tienda revisada en el navegador a 320, 375 y 1280 px, claro y
oscuro. La decisión quedó en el ADR-0446; falta Ahellya, cuando llegue el permiso.
