## 2026-10-17 (Skills de diseño de afuera: se consultan, no mandan)
Qué hice: instalé por usuario (`~/.claude/skills/`, fuera del repo) `vercel-react-native-skills` y `ui-ux-pro-max` (`frontend-design`
ya estaba desde el 25-jul), le corregí a `ui-ux-pro-max` la ruta de su buscador (apuntaba a `${CLAUDE_PLUGIN_ROOT}`, que solo existe
instalada como plugin) y escribí en CLAUDE.md la regla «Skills de diseño de afuera»: se consultan, nunca mandan sobre los tokens ni las
piezas decididas del ERP, y nunca crean `design-system/…/MASTER.md`. Al pedir el rediseño completo de la tienda, Felipe le dio
identidad visual propia: en `apps/tienda` las skills sí proponen paleta y letras, como 2 o 3 maquetas que él elige mirando.
Por qué así: las dos skills de diseño se activan en casi cualquier tarea de interfaz y empujan a elegir paleta, fuentes y estilo propios;
en CAYLA eso ya está decidido (ADR-0169, ADR-0358, ADR-0136), y su `--persist` crearía una segunda fuente de verdad del diseño.
Felipe se lleva: las tres skills disponibles en su Mac sin cambiarle nada al equipo, y la regla escrita para que ninguna sesión las deje
mandar. React Native queda sin uso hasta que haya una app nativa (hoy no hay ni una línea de React Native ni Expo en el repo).

## 2026-10-17 (Rediseño de la tienda online: tres direcciones para elegir mirando)
Qué hice: diagnostiqué la tienda en línea (oscura, con Garamond grande y polaroids; las fotos son prendas recortadas sobre blanco,
sin modelos), consulté `frontend-design` y `ui-ux-pro-max` y dibujé tres direcciones con sus cinco pantallas tocables en
`docs/maquetas/tienda-rediseno-2026-10/`: A «Muro» (galería, cédula de museo), B «Lookbook» (revista, el look Nº con créditos y
el fondo del color de la prenda) y C «Cochinilla» (vino y rosa, la ropa colgada de un riel). Verificadas a 1440 y 390 px y con
el camino de separar recorrido con clics reales en las tres.
Por qué así: Felipe eligió identidad propia para la tienda y maquetas primero; una dirección se elige mirando, nunca por su
descripción, y tres ideas distintas de elegancia dejan una elección real.
Felipe se lleva: una página para comparar las tres y abrir cada una, en escritorio y en celular. Falta que elija; después vienen
el sistema en `apps/tienda/app/globals.css`, su ADR y la construcción con `/construir`.

## 2026-10-17 (Rediseño de la tienda: tres variaciones de A, con movimiento)
Qué hice: Felipe eligió A «Muro» y pidió tres más, elegantes y con mucho movimiento. Construí A2 «Telón» (A contada como cine: telón,
titulares que suben, la foto que viaja de la lista a la ficha), A3 «Recorrido» (azul noche: la portada se camina de lado al bajar,
cursor «Ver», bolsa de costado) y A4 «Luz» (sillar con grano: una luz que sigue al mouse, prendas a distintas profundidades, fotos que
se revelan), con una librería de movimiento común sin dependencias (`movimiento.js`), y la comparación pone a la familia de A arriba.
Por qué así: las tres conservan lo que Felipe eligió de A y cambian solo la idea de movimiento, para que elija qué tipo de movimiento
quiere; sin librerías, para que llevarlo a la tienda no sume peso; y todo se apaga con «reducir movimiento».
Felipe se lleva: cuatro versiones de A para comparar tocándolas. De paso arreglé un error de las seis direcciones (después de separar
seguía a la vista el botón «Separar»). Falta que elija; después vienen el sistema, su ADR y la construcción.

## 2026-10-17 (Rediseño de la tienda: tres hermanas de A con identidad propia)
Qué hice: Felipe aclaró que no quería variaciones de A sino diseños con identidad propia y su mismo gusto. Construí D «Seda» (perla y
ciruela, una cinta que se dibuja al bajar), E «Etiqueta» (celadón y oliva, la etiqueta colgante que se da vuelta y el talón que se
arranca) y F «Friso» (adobe y espresso, un friso escalonado como los de Chan Chan que se dibuja), cada una con sus letras, paleta,
composición y movimiento; la comparación pone a A y sus hermanas arriba y la ronda anterior abajo.
Por qué así: «identidad propia, gusto parecido» se cumple cambiando todo lo que se ve (letras, colores, firma) y conservando lo que A
tiene de elegante (aire, contención, la prenda como protagonista). De paso: sin cuenta ya no se ven tallas en ninguna dirección y los
titulares ya no se cortan a media palabra.
Felipe se lleva: tres diseños distintos para elegir mirando, en escritorio y celular, con el camino de separar probado en los nueve.

## 2026-10-17 (Rediseño de la tienda: tres direcciones inspiradas en las grandes casas)
Qué hice: sin partir de A (que queda como referencia), construí G «Pasarela» (a la manera de la alta costura de París: la portada es
un desfile con flash), H «Vitrina» (a la manera del modernismo italiano: planos camel y negro, nichos con pedestal) e I «Pespunte» (a
la manera de las casas del oficio: costuras que se cosen solas y una caja que se cierra al separar), todas con movimiento rico y
probadas en escritorio y celular; la comparación las pone arriba.
Por qué así: tomar la manera de trabajar de cada casa (su paleta, su tipografía, su forma de mostrar la ropa) y nunca su marca, para
que CAYLA se vea a la altura sin parecer una copia ni usar nada registrado.
Felipe se lleva: tres direcciones más para elegir mirando. Falta probarlas en un celular de verdad y decidir.

## 2026-10-17 (Rediseño de la tienda: tres con los colores de CAYLA, y Felipe elige A)
Qué hice: construí J «Vuelo» (el colibrí se dibuja, aletea y tiñe «transforma.»), K «Sedes» (la costa del Perú con Trujillo y Arequipa
como dos puntos rojos) y L «Probador» (la cortina que se abre sobre un espejo donde se arma el look), con la paleta oficial. Felipe eligió
A «Muro» y pidió llevarla tal cual a la tienda real, en local, para probar y ajustar. Empecé: paleta, letras, botones, cabecera, tarjeta
de prenda, héroe, Club, tiendas y pie ya están en `apps/tienda`; faltan la ficha, la bolsa, entrar y crear cuenta.
Por qué así: A se aplica sobre la tienda de hoy (que desde el ADR-0438 muestra precios y stock sin cuenta), no sobre la maqueta: se
cambia cómo se ve cada pieza y nunca qué hace, para no perder campaña, ofertas, looks, favoritos ni «Agregar» rápido.
Felipe se lleva: el traspaso para seguir en otra sesión, en `docs/backlog/2026-10-17-install-design-skills-4f1aae.md`.
