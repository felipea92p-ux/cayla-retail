# Ofertas: la hoja de una oferta va por fases y con todo en grande (ADR-0677, actualización b) · 2026-11-18

- **Hecho:** «Nueva oferta» / «Editar la oferta» vuelve a ir por fases (qué le das · en qué prendas · cuándo y dónde · revisar) con la barra de
  fases, «Siguiente» y la flecha de vuelta; los números («Lleva 3 y paga 2», el %, el monto) van en el paso «grande» (68 px, número a 36 px) con
  una línea que dice qué hacen; opciones, días, categorías, botones y nombres de control crecen a 44 px / 15–16 px. «Nuevo descuento» usa el mismo
  paso grande. Felipe: «las cosas muy pequeñas no funcionan». Solo pantalla.
- **Verificado:** navegador a 1440 (claro y oscuro) y 375 px, las cinco formas, las cuatro fases y el modo editar; tipos, lint, 954 pruebas y
  Knip; guía de Campañas al día con sus huellas.
- **Queda:** `guias:recorrer`, guardar de punta a punta y «Nuevo descuento» en el navegador no se pudieron probar en local (la base local
  compartida está atrás de `main`); `/formidable` y `/chaos` de la hoja; y si el tamaño grande pasa al resto del ERP lo decide Felipe (backlog).
- **Después (Felipe, al probarla: «muy plano», «todo más centrado»):** el contenido va en una columna al centro, con las fases unidas por un
  hilo y, bajo la pregunta, un escenario de vidrio con los números, lo que hacen y «En caja» como talón de ticket (sale en «Qué le das» y en
  «Revisar»; ya no hay columna a la derecha). Mirado a 1440 y 375 px en claro; en oscuro, sin mirar.
- **Después (Felipe: el pie flotaba sobre los números al volver de «Desde S/ 300» a una forma más baja):** la hoja es de alto fijo, el pie va
  siempre al fondo y solo el contenido se desliza; fases y formas miran su propio ancho. Causa: la reserva de `<PaginaEstable>` es relleno de la
  hoja y el pie pegado se mide desde ahí. Medido en cinco tamaños (375 a 1280), sin fallas.
- **Después (Felipe: en «¿En qué prendas?» las chicas escanean; categorías mal presentadas; dos botones planos):** la fase empieza por
  «Agrega una prenda» (pistola, cámara o nombre; las lecturas hacen cola), sigue con lo que la oferta lleva como fichas con ✕ y deja categorías,
  insignias y la lista completa a un toque; categorías como píldoras por familia; los botones planos pasan a tener borde. Probado en una base
  local con prendas a 1280 y 375 px. Sin probar: cámara y pistola de verdad.
- **Después (Felipe: las fichas «horribles», el beige, el desorden con muchas, «Ver todas las prendas» de más):** las prendas van en una lista
  ordenada con «Quitar» y «Deshacer»; categorías e insignias, en una fila cada una con su resumen en una línea; sale la lista completa. Elegir un
  color o una talla de una prenda NO se hizo: la base solo guarda modelos enteros y cambiarlo es decisión de Felipe (backlog).
- **Después (Felipe: la lista de una por fila «se hará enorme»; los grupos, más notorios y con mejor uso del espacio):** las prendas van en un
  mosaico de tres por fila que no crece (seis a la vista, el resto se desliza por dentro), se marcan para quitar varias y también se quitan
  buscándolas; Categorías e Insignias son dos tarjetas lado a lado. Mirado a 1280 y 375 px en claro.
