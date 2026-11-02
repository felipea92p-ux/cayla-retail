## 2026-10-31 (Simulación: todos los modales con el vidrio de «Mi perfil»)
Qué hice: analicé la hoja de vidrio de Mi perfil (`perfil-vidrio.css`: vidrio al 54 % con desenfoque, borde de luz y sombra, filo y brillo que siguen al mouse, velo liviano, título de 30 px por su ranura, segmento con gota, filas de vidrio) y armé `docs/maquetas/modales-vidrio-2026-10/`: 9 modales que representan los 275 `<Modal>` y los 14 `<Cajon>`, cada uno hoy y con vidrio, en dos intensidades (Completa = Mi perfil tal cual; Serena = sin filo ni brillo, más opaco, tablas sobre lámina y papel si hay botón rojo), en claro, oscuro y 375 px.
Por qué así: la cara de toda hoja es una sola desde la ronda 12 (ADR-0358), así que el cambio real serían dos piezas (`Modal.tsx`, `Cajon.tsx`) y conviene decidirlo mirando. Lo que se vio: Cobrar y las filas lucen; la planilla de Ajustar inventario y el rojo de Anular pierden con «Completa»; la luz de la guía de foco se apaga sobre el vidrio.
Felipe se lleva: la recomendación es «Serena» para todas y «Completa» solo en Mi perfil; nada del código cambió, la decisión es suya y pasaría por `/unificar`.

## 2026-10-31 (Los campos sobre el vidrio «Serena»)
Qué hice: Felipe eligió «Serena» y vio que las cajas de texto ya no iban con el modal (hueso con borde: papel pegado sobre el vidrio). Sumé a la maqueta el selector «Campos» con tres caras —A · Hundido (un pozo del vidrio que sube como la gota al escribir), B · Placa (vidrio como las filas) y C · Hilo (sin caja, sobre una línea)—, aplicadas a cajas, combos, montos y los pasos de cantidad, en claro, oscuro y 375 px.
Por qué así: las tres conservan el borde-control (3:1), el hilo rojo y la luz de «Sigue aquí», que además vuelve a verse (pizarra al 26 %). Recomiendo A: habla el idioma del segmento y el campo se reconoce por borde y profundidad.
Felipe se lleva: elegir A, B o C mirando; falta medir el borde sobre el vidrio con una prenda oscura detrás antes de llevarlo al código.

## 2026-10-31 (Los botones sobre el vidrio)
Qué hice: Felipe eligió los campos «A · Hundido» y pidió los botones. Sumé el selector «Botones» con tres caras —A · Gota (píldora; el secundario es la gota del segmento, el primario tinta con brillo), B · Placa (el radio de los campos) y C · Humo (el primario también es vidrio ahumado)—, aplicadas a botones, píldoras, flechas del cajón y la ×, en claro, oscuro y 375 px.
Por qué así: con los campos hundidos, lo que haces tiene que sobresalir; las tres conservan el borde-control, el negro → rojo profundo, la subida de 2 px y la luz que cruza. Recomiendo A; C deja el primario casi apagado (se vio en Cobrar).
Felipe se lleva: elegir A, B o C mirando; con A, dentro de una hoja los botones son píldora y en la pantalla no, y eso lo decide él.

## 2026-10-31 (Botones «A · Gota» y el campo que no se vuelve sólido)
Qué hice: Felipe eligió los botones «A · Gota» y pidió que el campo no se pusiera de un color sólido al escribir. Al escribir, el campo hundido ahora sube y se ilumina con un degradado de vidrio (50 % → 22 %, en oscuro tinta 14 % → 6 %), gana su sombra afuera y sigue dejando ver lo de atrás; «Sigue aquí» también pasó a vidrio.
Por qué así: el foco lo dicen la subida, la sombra y el hilo rojo, no el relleno; un relleno sólido era papel otra vez sobre el vidrio.
Felipe se lleva: queda la cara completa —vidrio Serena, campos A · Hundido, botones A · Gota— para llevarla al código por `/unificar`; antes, medir el contraste del borde con una prenda oscura detrás.

## 2026-10-31 (La nota y el aviso sobre el vidrio)
Qué hice: Felipe pidió mejorar la nota («Si ya tiene ficha…»), que sobre el vidrio era una losa plana y en oscuro negra. Sumé el selector «Notas» con tres caras —A · Placa (vidrio como las filas), B · Tinte (sin caja, un tinte que nace en la «i») y C · Al pie (sobre una línea fina)—; la «i» va en una lente de vidrio y el aviso de atención sigue la misma cara con su ámbar.
Por qué así: el modal ya habla dos idiomas (hundido = tu dato; relieve = tu acción) y una nota no es ninguno; recomiendo B. A parece una fila que se toca y C le quita fuerza al aviso.
Felipe se lleva: elegir A, B o C mirando.

## 2026-10-31 (El combo, y botones sin color sólido)
Qué hice: Felipe eligió la nota «A · Placa» y pidió mejorar el combo y que los botones no fueran sólidos. El primario pasó a vidrio ahumado de tinta (72 % → 93 %) y el peligroso a vidrio rojo, los dos con desenfoque; la gota secundaria quedó más clara y lo elegido en un mosaico ya no es blanco sólido. Sumé el selector «Combo» —A · Pozo y gota, B · Ficha, C · Píldora— con el avatar en una lente y una lista de vidrio que se abre de verdad (hilo de canto, ✓, la persona sin asistencia que no se elige; el primer Escape cierra la lista). De paso: a 375 px el contenido de la hoja ya no se sale por la derecha (la cuadrícula no se encogía) y los botones del pie van a lo ancho.
Por qué así: el combo guarda un dato y se aprieta; A lo dice con el idioma del modal (pozo + gota). Por debajo de ~70 % el primario se ve gris, por eso es más denso abajo.
Felipe se lleva: elegir A, B o C para el combo mirando.

## 2026-10-31 (El aviso sobre el vidrio)
Qué hice: Felipe eligió el combo «A · Pozo y gota» y pidió mejorar el aviso («Ya se cortaron 24 prendas»): sobre la placa de 18 px la franja se curvaba como una medialuna. Sumé el selector «Aviso» —A · Filo (la franja como un filo redondeado adentro), B · Lente (sin franja, lente ámbar grande y borde tenue) y C · Borde de luz (el borde se enciende de ámbar desde la izquierda)—; las tres ponen el ícono en una lente ámbar que se dibuja al entrar.
Por qué así: recomiendo A porque conserva la franja, lo que hace reconocible al aviso en todo el ERP; B se confunde con la nota y C, en cuatro tonos, sería mucha luz.
Felipe se lleva: elegir A, B o C mirando.

## 2026-10-31 (La planilla de tallas y su movimiento)
Qué hice: Felipe eligió el aviso «B · Lente» y pidió mejorar las tablas tipo planilla y darles más animación. La matriz de Ajustar inventario ahora dice la diferencia de cada talla (+1 / −1), suma cada color (Total) y el pie resume los cambios; sumé el selector «Tabla» —A · Celdas vivas, B · Filas de vidrio, C · Baldosas (dos por fila en el celular)— y el movimiento de «Ajustar stock» (ADR-0494): luz que cruza, filas en cascada, celdas en ola, número que rueda, diferencia que aparece, total que cuenta, la cruz de fila y talla al pasar el mouse y el sello de cada talla al guardar (la maqueta no guarda). De paso: la barra de controles es más compacta y deja de quedarse fija bajo 1300 px.
Por qué así: recomiendo B (todo a la vista, con su borde de control, y escala a más tallas); A esconde − y + al mouse y C es el doble de alta.
Felipe se lleva: elegir A, B o C mirando; y decidir si el movimiento de Ajustar stock pasa a toda planilla en una hoja (actualización de ADR-0136).

## 2026-10-31 (La barra de pagos sobre el vidrio)
Qué hice: Felipe eligió la planilla «A · Celdas vivas» y pidió mejorar la barra de pagos de «Detalle de la venta». Sumé el selector «Barra» —A · Tubo de vidrio (pozo con tramos de vidrio de color y una leyenda con monto y parte), B · Etiquetas (el texto dentro de cada tramo) y C · Fichas (cada medio en una fila de vidrio con su barra fina)—; en las tres el total cuenta al abrir, los tramos crecen uno tras otro y el apuntado se estira. De paso: una tabla del análisis forzaba la página a 2 000 px de ancho, y la barrita de las fichas chocaba con la clase de la miniatura de prenda.
Por qué así: recomiendo A (el idioma del modal, sirve con 2 o 5 medios); B se corta con un tramo chico (visto a 375 px) y C ocupa el triple de alto.
Felipe se lleva: elegir A, B o C mirando.

## 2026-10-31 (La cara completa del vidrio, elegida)
Qué hice: Felipe eligió la barra «A · Tubo de vidrio» y con eso quedó toda la cara: vidrio Serena, campos A · Hundido, botones A · Gota sin color sólido, notas A · Placa, combo A · Pozo y gota, aviso B · Lente, planilla A · Celdas vivas y barra A · Tubo de vidrio. La maqueta abre así y el README lo deja escrito.
Por qué así: cada pieza se eligió mirando, una por una, sobre los mismos 9 modales.
Felipe se lleva: antes del código faltan dos medidas (contraste sobre el vidrio con una prenda oscura detrás; desenfoque en el Mac mini) y tres decisiones de regla suyas (ADR-0358 ronda 12, ADR-0136 para el movimiento de las planillas, y el − + al apuntar en Celdas vivas).

## 2026-10-31 (La lista de prendas sobre el vidrio)
Qué hice: Felipe pidió mejorar la lista de prendas de «Detalle de la venta». Sumé el selector «Prendas» —A · Filas de vidrio, B · Lámina de vidrio (talla como insignia en la lente) y C · Ticket vivo (puntos guía hasta el precio)—; en las tres la prenda sin foto lleva el ícono de su categoría sobre su color (ADR-0333, que la maqueta no cumplía), la talla va en una pastilla, el color con su punto y el precio en serif, con su entrada en cascada.
Por qué así: recomiendo B porque se lee como lista y no como botones, y aguanta muchas prendas; A parece tocable y C pierde el color en el celular.
Felipe se lleva: elegir A, B o C mirando.

## 2026-10-31 (Lista de prendas elegida)
Qué hice: Felipe eligió la lista de prendas «B · Lámina de vidrio»; queda marcada en la maqueta y sumada a la cara completa del README (Serena · campos A · botones A · notas A · combo A · aviso B · planilla A · barra A · prendas B).
Por qué así: se lee como lista y no como botones, y aguanta muchas prendas.
Felipe se lleva: siguen pendientes las dos medidas (contraste sobre el vidrio, desenfoque en el Mac mini) y las tres decisiones de regla antes de llevarlo al código.

## 2026-10-31 (El ERP pasa al vidrio: decisión, tablero y el marco)
Qué hice: Felipe decidió llevar todo el ERP al vidrio «Serena», componente por componente. Lo dejé en el ADR-0596 (reservado con `pnpm reservar adr`), armé el tablero `docs/vidrio/README.md` (marco, hojas ya elegidas y 22 piezas de pantalla por auditar) y empecé por el marco: `docs/maquetas/marco-vidrio-2026-10/` con tres caras de fondo (Crema quieto, Aurora, Tejido), de menú lateral (Panel flotante, Riel de vidrio, Isla de íconos) y de cabecera (Barra flotante, Fundida, Dos islas), con el menú real de una líder, plegar, el cajón del celular y una hoja Serena encima.
Por qué así: el vidrio necesita algo detrás; sobre el crema plano de hoy, una placa de vidrio es una placa crema. Recomiendo Aurora + Panel flotante + Barra flotante (el marco como dos placas sobre el fondo, la fila activa como la gota).
Felipe se lleva: elegir fondo, lateral y cabecera mirando; después siguen los íconos del marco.

## 2026-10-31 (El marco elegido y el combo)
Qué hice: Felipe eligió fondo B · Aurora, lateral B · Riel de vidrio pero con la gota del panel en la fila activa (la fila corre 6 px para que la marca roja no toque el ícono) y cabecera C · Dos islas; quedaron marcados en la maqueta, su README y el tablero. Después pidió mejorar el combo de las sedes y que quede así para todos: el combo es una sola pieza (`Desplegable`, siete formas), así que sumé a la maqueta del marco el selector «Combo» —A · Gota viajera, B · Brota del botón, C · Tarjetas— aplicado a la sede, a un filtro y a un campo dentro de la hoja (con buscador desde 9 opciones). La lista flota en su propia capa, como `useDestinoFlotante`, porque un vidrio dentro de otro no ve lo de atrás.
Por qué así: recomiendo A, el mismo gesto que el menú (la gota en la elegida que viaja a la que apuntas), que sirve con 6 o con 50 opciones.
Felipe se lleva: elegir la cara del combo mirando.

## 2026-10-31 (Combo elegido; el menú completo y su despliegue)
Qué hice: Felipe eligió el combo «A · Gota viajera» para todos los combos, y pidió que el lateral tenga todos los íconos de hoy, también en los submódulos, y un despliegue menos brusco. Saqué el árbol real (`lib/menu.ts`, lo que está «viva») y los 61 trazos de `lib/menu-iconos.ts` con un script de una sola vez y los puse en la maqueta del marco: 11 módulos, sus submódulos y Abastecimiento y Posventa de tercer nivel, con globitos que suman y el acordeón de hermanos del ERP. El despliegue nuevo: la caja crece en 460 ms con una curva que frena, un hilo baja desde el ícono del módulo con una rama por submódulo, las filas se enfocan en cascada (38 ms), el ícono asiente y la gota acompaña a su fila; al cerrar, 300 ms sin cascada.
Por qué así: hoy (`.lateral-hijos`) la caja crece en 300 ms y las filas solo aparecen, así que lo de abajo baja de golpe.
Felipe se lleva: mirar el despliegue; después siguen los íconos del marco (si se rediseñan o se quedan) y las piezas de pantalla.

## 2026-10-31 (Plegar desde el menú y submódulos sin líneas)
Qué hice: Felipe pidió el botón para plegar arriba a la derecha del menú y que las ramas del hilo que salían a cada submódulo se rediseñaran. El botón pasó de la cabecera al lado del logo (plegado, baja bajo el colibrí y su ícono se da vuelta; en el celular, en su lugar va la ✕ del cajón). Quité el hilo y sus ramas y sumé el selector «Submódulos» con tres caras sin líneas —A · Bandeja, B · Sangría limpia, C · Tarjeta—; la cascada de entrada se queda. La gota ahora toma el ancho de su fila, para caber dentro de una bandeja o una tarjeta. De paso: una fila tocada encendía todas las demás (`classList.toggle` con `undefined`).
Por qué así: recomiendo C, porque lo que abriste sobresale como en las hojas y se ve dónde termina cada módulo; A se lee como un campo y B se pierde con dos niveles abiertos.
Felipe se lleva: elegir la cara de los submódulos.

## 2026-10-31 (Submódulos en bandeja; plegar flotante)
Qué hice: Felipe eligió los submódulos «A · Bandeja» y pidió que el botón de plegar no le quite el logo, quizá flotante. El botón ahora es una gota de 28 px montada sobre el borde derecho del menú, a la altura del logo, que viaja con el borde al plegar y da vuelta su flecha; el logo queda entero y, plegado, el colibrí centrado (antes quedaba corrido fuera de la columna). Las islas de la cabecera se apartan 22 px para no tocarlo; en el celular no aparece (ahí está la ✕ del cajón).
Por qué así: en el borde no compite con nada y se encuentra siempre en el mismo lugar, abierto o plegado.
Felipe se lleva: el marco completo para revisar; después, los íconos y las piezas de pantalla.

## 2026-10-31 (Buscador que no se sale; plegado cuadrado)
Qué hice: Felipe vio el buscador saliéndose de su isla y los íconos del menú plegado corridos a la izquierda, con espacio de sobra. La cabecera pasó a ser un contenedor: el buscador se encoge con ella, pierde la «/» bajo 700 px y queda en una lupa bajo 560 (medido de 1440 a 600 px, abierto y plegado: sin solapes ni cortes). En el plegado, el nombre invisible ya no ocupa lugar: cada fila es un cuadrado con el ícono al centro (0 px de corrimiento medido), la gota es ese cuadrado y la marca roja sale al canto. Nuevo selector «Plegado»: A · Con nombre (84 px, nombre corto bajo cada ícono) o B · Solo íconos (64 px).
Por qué así: recomiendo A, porque usa el espacio para que nadie tenga que apuntar para saber qué es cada ícono (ley 1 de Formidable).
Felipe se lleva: elegir cómo se ve plegado.

## 2026-10-31 (Plegado con nombre: el marco, completo)
Qué hice: Felipe eligió el plegado «A · Con nombre» (84 px, nombre corto bajo cada ícono). Con eso el marco queda entero en la maqueta y en el tablero: fondo Aurora; menú en riel de vidrio con todos los íconos de hoy, la gota de selección, submódulos en bandeja con despliegue en cascada, botón de plegar flotante y plegado con nombre; cabecera en dos islas con el buscador que se encoge; combo con la gota viajera.
Por qué así: cada pieza la eligió Felipe mirando la maqueta.
Felipe se lleva: siguen los íconos del marco (si se rediseñan) y las piezas de pantalla del tablero.

## 2026-10-31 (El vidrio entra al código, de forma modular)
Qué hice: Felipe pidió pasar ya al sistema todo lo elegido, de forma modular. Las recetas del vidrio (placa, gota, pozo, ahumado, lente, velo, con su oscuro y su versión para quien pide menos transparencia) viven en `apps/web/app/estilos/vidrio/recetas.css`, y las piezas armadas con ellas en `app/estilos/vidrio/` (hoja y cajón, campos y botones, notas/avisos/listas de combo, segmento/barra/paso; el marco en `marco.css`), sin capa: cambian las ~275 hojas, los 14 cajones y todos los campos, botones, notas, avisos y combos del ERP sin tocar una pantalla. En TSX: `hoja-serena` en `Modal`, `cajon-serena` en `Cajon`, la gota que se estira en `SegmentoDeslizante` y `combo-pastilla` para la sede. Abrí la sesión «maquetas-vidrio» para las maquetas de lo que falta. Regla nueva en CLAUDE.md («El vidrio «Serena»») y ADR-0596 act. b.
Por qué así: lo que se cambia en un solo lugar se cambia en todo. La hoja no lleva `backdrop-filter` (recortaría la lista de cada combo de adentro): el desenfoque lo pone el velo. La gota de las listas es la `opcion-activa` de siempre (sigue al mouse y a las flechas) con un fundido, no un elemento que viaja.
Qué se verificó: `tema-colores`, `tema-tokens`, `hover-con-mouse`, `unificar`, `barra-apilada`, `foco-comun`, `combos-fuera-de-la-cascada`, `hojas-escape`, `hojas-atras` en verde; `tsc` y `eslint` limpios; en el navegador (localhost, cuenta de prueba local), «Registrar cliente» en escritorio, celular y oscuro, y su combo abriendo sin recortarse.

## 2026-10-31 (El menú usa el alto que tiene)
Qué hice: Felipe vio mucho espacio vacío bajo el menú y pidió módulos más holgados que se acomoden siempre al desplegar submódulos. `components/useMenuHolgado.ts` reparte el alto del `<nav>` entre las filas de primer nivel: crecen hasta 56 px (plegado, 66) y lo que sobra es aire entre filas (hasta 14 px), con la letra medio punto más grande; al abrir un módulo su bandeja toma lo que necesita y las demás bajan hasta 40 px (plegado, 54), y recién ahí el menú corre. Se recalcula cuadro a cuadro mientras una bandeja crece (un `ResizeObserver` por bandeja) y la gota se vuelve a medir sobre las filas acomodadas.
Qué se verificó: en local, escritorio abierto (9 filas de 56 px con 14 px de aire; con Catálogo abierto, 47 px llenando justo el alto), plegado (64 px) y en el celular (40 px y corre con un módulo abierto); la gota queda sobre su fila. Pruebas del menú, guías, tema, hover y unificar en verde; Knip limpio.

- **El pie del menú (Felipe 2026-10-31):** se fue la firma «Donde el estilo transforma.» y la persona pasó a una placa de vidrio (`.marco-yo`,
  `vidrio/marco.css`): el avatar en su lente, el nombre y «Líder · Tienda Lima» en letra normal, y «Salir» como una gota redonda con el ícono
  (`LogoutButton forma="icono"`, que pasa a rojo profundo al apuntar). Plegado queda solo el avatar, centrado. Verificado a 1440 claro y
  oscuro, plegado y a 375 px; las pruebas de menú, guías, tema, hover, unificar y ancho, tsc y Knip en verde.

- **Las piezas de pantalla al vidrio (Felipe 2026-10-31, lo que eligió en la sesión de maquetas):** nuevo `vidrio/pantalla.css` y la
  receta `--serena-*` (más `--hundido-*` y los hilos) en `recetas.css`. Cabecera «A · Plana con gotas» (Volver es una gota; `ResumenSede`
  en placa Serena, clase `resumen-sede`), tarjetas de cifra «A · Placa Serena» (`tarjeta-cifra` + `data-conducta`/`data-puesta`/
  `data-sin-dato`: la que lleva se alza 2 px, la puesta se hunde, sin dato punteada sin vidrio), pestañas «A · La gota de Mi perfil»
  (pozo + `IndicadorDeslizante` variante `gota` que se estira 220 ms y se recoge 300 ms, también al cambiar de ruta) y tablas
  «B · Placa Serena» (`tabla-cayla` en `TABLA.contenedor`: sin rayado, hilo entre filas, encabezado suelto). Dentro de una hoja manda la
  lámina de la hoja (pantalla.css se importa antes que hoja.css). Verificado en Compras, Por pagar e Inventario, claro y oscuro.

- **La tabla con superpoderes, en piloto (Felipe 2026-10-31, «A · Globo desde la cabecera»):** pieza nueva `ui/TablaViva.tsx` (+ `useTablaViva`)
  con su lógica pura en `lib/tabla-viva-reglas.ts` (24 pruebas) y su CSS en `vidrio/tabla-viva.css`; `<Tabla>` no cambia para las demás.
  Piloto: Inventario ▸ Movimientos ▸ Ingresos (todas las filas ya en el navegador; la página es la que corre, donde la cabecera pegada se
  luce). Letra de 15 px y «Letra grande» recordada en el aparato; todo al centro con los montos en su caja; globo de vidrio desde cada
  cabecera con ordenar y «mostrar solo» con su conteo (en el celular, la hoja a media altura); la frase de lo que ves con sus píldoras; la
  fecha que dice cuánto pasó; el total de lo que ves; el vacío con salida; responsive por el ancho de la tabla; la cabecera pegada con
  `animation-timeline: view()` (medida: 0 filas asoman al bajar rápido). Lo que se apartó de la maqueta: la segunda línea a 14 px (el
  piso de lectura), el Modelo a la izquierda (lleva foto), «Limpiar» en vez de «Borrar», y sin trampa de foco en el globo.

- **Buscador, filtros y Observatorio al vidrio (Felipe 2026-10-31, lo elegido en la sesión de maquetas):** el buscador «A · Pozo» (píldora
  hundida de 44 px; el del mostrador conserva su alto) y los filtros «A · Gotas, la puesta ahumada» (gota suelta con `borde-control`; la
  puesta en `--ahumado-denso-*`, receta nueva, con su ✓; lo puesto en el mismo ahumado con su ✕ en lente; «Limpiar todo» punteado; en
  oscuro la puesta va después y con más peso), en `campos-y-botones.css`. El Observatorio (ADR-0322) en `vidrio/observatorio.css` + recetas
  nuevas (tubo, lente grande, líquido, lámina del mapa, gráfico de vidrio, globo): el mapa al aire, controles ahumados con contraste (9–14:1
  la elegida, 6–9:1 lo demás), orbes en lente con líquido, cinta de la venta en vivo, anillos y ranking en tubo, el Perú de vidrio, área de
  vidrio bajo las curvas (`AreaVidrio` con `useId`) y la estela del cometa (el mismo bucle-señal). Sin la línea del día ni el panel que nace
  del mapa (Felipe los quitó). `.o-repetir.va` va después de la piel: la hora se lee mientras repite el día.

- **Insignia y globito al vidrio (Felipe 2026-11-01):** `<Chip>` en «A · Lente de color» (`chip-cayla` + `data-tono`: vidrio teñido de su
  tono al 10→18 %, luz arriba y filo del tono al 26 %, 24 px; neutro sin arena maciza; apagado y tinta, vidrio claro con su contorno) y
  `<Globito>` en «A · Gota» (gota de vidrio teñida: ámbar si pide, rojo si es error; el de la esquina, gota ahumada con anillo de vidrio),
  en `vidrio/pantalla.css`. Visto en Compras, claro y oscuro.

- **Vacío y paginación al vidrio (Felipe 2026-11-01):** `<Vacio>` en «B · Pozo» (`.vacio-ic` es un hueco: tinta al 6 %, filo de
  `borde-control` al 45 %, sombra interior; el ícono que se dibuja y su onda no cambian; sus filtros puestos ya iban en el ahumado) y
  `<Paginas>` en «A · Gota en su pozo» (la fila en un pozo, números de 34 px, la actual es la gota clara que viaja 320 ms con letra tinta en
  negrita). En un teléfono (≤ 400 px de ventana; la maqueta lo pedía por ancho del contenedor, pero `.paginas` no tiene uno propio) se
  esconden las páginas lejanas y los «…»: queda «‹ 2 3 4 ›». `Paginas` marca `lejana` y `lib/paginas.test.ts` lo vigila.

- **Casilla, interruptor, títulos y separador al vidrio (Felipe 2026-11-01):** casilla e interruptor «A · Pozo y gota» (vacía un pozo;
  marcada, el fondo se llena de ahumado con su luz y el ✓ en crema; el interruptor es pozo con perilla gota y encendido ahumado; en oscuro
  el pozo va con `:not([aria-checked="true"])`), en `campos-y-botones.css`. El separador de día «B · Gotas que flotan» (sin franja: el día
  y su total son gotas de 28 px con desenfoque, el contenedor sin clics), la ranura del título de grupo, el globito de los títulos en gota
  y `<EnlaceVer>` como gota chica con borde rojo al 30 % («B · "Ver" en gota»), en `pantalla.css`. Visto en Ingresos y en Caja ▸ Historial.

- **Los gráficos al vidrio (Felipe 2026-11-01):** «B · Tinta sobre vidrio»: el dato sigue en su color pleno; la pista de `BarraAvance` y de
  `BarraApilada` es un pozo fino (tinta al 7 % con sombra interior), el anillo pierde el hueso, la rejilla y el piso son tinta tenue y el área
  bajo `<Linea>` es un degradado de vidrio (nuevo `<linearGradient>` con `useId`, colores por tema en CSS). El globito que lee el dato es
  ahumado con letra crema («B · Ahumado»). El tubo de la barra apilada («A · Tubo», la barra de pagos) queda solo dentro de hojas y cajones;
  el `Sparkline` conserva su área de tinta al 7 %. Todo en `vidrio/graficos-y-pasos.css`.

- **Avisos, loader y versión nueva al vidrio (Felipe 2026-11-01):** avisos de la esquina «B · Lente del tono» (placa teñida 5→10 % del
  tono con filo al 28 %; el detalle sube a tinta al 78 % para pasar 4,5:1 en oscuro), loader «B · Lente sola» (sin tarjeta: velo crema al
  46 % esmerilado, la lente de 96 px con el colibrí y un halo detrás de las palabras: el peor caso medido da 4,7:1 en la etiqueta) y «Hay una
  versión nueva» «A · Gota ahumada» (líquido de tinta al 88 % con su luz y su filo; el movimiento no cambia; va en el hueco entre las dos
  islas si cabe y si no, bajo la cabecera, centrada sobre el contenido). En `vidrio/avisos-espera.css` + recetas nuevas; `Espera.tsx` pasa a
  clases propias (sin cambiar cuándo sale) y `VersionNueva.tsx` mide dónde ponerse. Falta mirar a 375 px exactos la píldora.

- **Íconos de fila, menú «Más» y selector de mes al vidrio (Felipe 2026-11-01):** íconos de fila «A · Gota al pasar» (lápiz, copiar en
  ícono y «⋯», clase `icono-fila`: planos en reposo; la gota con su filo de `borde-control` al pasar el mouse, con el foco o con el menú
  abierto; el área no cambia), el menú «Más» «A · La lista del combo» (`lista-flotante` + `opcion-activa`, en rojo sobre lo peligroso) y el
  selector de mes «B · Gota entera» (la gota del secundario; el mes elegido, ahumado denso). Encontrado de paso: `Desplegable` pinta la
  opción bajo el mouse con su propio fondo y no usa `opcion-activa`, así que en sus listas la gota no viaja con el mouse (sí en ComboBuscable).

- **El Inicio de la líder, la barra de avance y la barra de abajo al vidrio (Felipe 2026-11-01):** en `vidrio/inicio.css`, acotado a
  `[data-inicio]`: títulos «B · Con hilo» (versalitas con su hilo taupe; `<TituloSeccion>` fuera del Inicio no cambia), «Te toca» «A · Placa»
  (cantidad en globito teñido por `data-nivel`, lo urgente con la marca roja), accesos «A · Gotas» (ícono en lente) y equipo «A · Placa»
  (avatar en lente, monto en serif). En `vidrio/barras.css`, para todo el ERP: la barra de avance «A · Tubo» (fina 8 px, normal 14, gruesa
  20; relleno de vidrio teñido de su tono) y la barra de abajo del celular «A · Gota ahumada» (`sola` = el primario ahumado; clara con varias
  acciones = vidrio de lo que flota; `tinta` = ahumado denso con su principal en gota crema; se corrigió de paso que el primario ahumado le
  ganaba al principal crema de la isla oscura). Por mirar con datos reales: las 34 barras `alto="fina"` que pasan de 3 a 8 px en sus filas.

- **Los íconos al vidrio (Felipe 2026-11-01):** el marco «A · Se llena al elegir» (el dibujo de la fila marcada, `data-fila-activa`, lleno
  de su tinta al 34 %; la flecha del grupo no; en `marco.css`) y el contenido «A · Duotono en los de 20» (lucide de 20 px o más con un velo
  del 12 % adentro; los de 12, 14 y 16, solo línea; los dibujos abiertos —✓, flechas, +, −, ×, arcos— quedan en línea porque el relleno
  cerraría su trazo; en `pantalla.css`). Visto el marco en Compras; el duotono, solo por la regla (Compras no tiene íconos de 20 px).

- **El cajón del menú en el celular al vidrio (Felipe 2026-11-02):** «A · Hoja con profundidad»: bajo 640 px el riel es una hoja de
  `min(300px, 86%)` con vidrio denso (90→80 %, 30 px), su asa de 4×44 px y un velo de sombra al 16 % (45 % en oscuro); la cabecera y el
  contenido se alejan de costado (34 px, 0,94, recorte de 22 px) con el mismo mecanismo de las hojas (`alejarFondo(ms, "lado")` en
  `fondoDeLaHoja.ts`) y siguen al dedo en la misma proporción (`fondoDeLadoSegun`, probado en `lib/hoja-gesto.test.ts`). Con «reducir
  movimiento» ya no se desliza. El escritorio no cambia.

- **El Punto de Venta al vidrio (Felipe 2026-11-02):** la mesa «A · Catálogo al aire» (sin la tarjeta grande de crema; el catálogo sobre la
  Aurora) con el ticket en placa Serena (radio 24, vidrio 72→52 %, 26 px) y la tarjeta de prenda «B · Foto al aire» (la foto con esquinas de
  18 px y su sombra, sube 3 px al pasar el mouse; nombre, tallas y precio planos debajo; tallas en gota: agotada hueco punteado, almacén
  ámbar punteada, apartada pizarra punteada; el globito dentro de la foto). En el celular, «Ver ticket» de la isla es la gota crema (15:1 en
  los dos temas). En `vidrio/vender.css` + recetas. El ticket sigue ocupando el alto de su columna (la página no corre en escritorio).

- **Existencias al vidrio (Felipe 2026-11-02):** la Vitrina «A · Translúcida, sin desenfoque» (papel → vidrio claro 86→66 % con su filo;
  sin `backdrop-filter` por costo con cientos de tarjetas; la sombra y la alzada siguen), la chapa de colores en gota y la tira de tallas
  «A · Pozo de vidrio». La talla en cero «A · Lente que pide»: la que tiene 0 en el piso y algo en el almacén sale del pozo como una lente
  ámbar (la agotada, en rojo), su línea dice «↑ 3» (`lineaGuardadas`, con su prueba) y su title «0 en el piso · 3 en el almacén: puedes
  colgarlas». En `vidrio/pantalla.css`; `ExistenciasTarjetas` da `vitrina-talla` + `data-estado`.

- **Caja al vidrio (Felipe 2026-11-02):** el titular «A · Ahumado» (`.cmp-heroe` en vidrio ahumado de tinta 84→95 % con su luz, filo y 28 px;
  sus píldoras en gota crema; en oscuro `.cmp-sobre` sube al 70 % para pasar 5,2:1) y la barra de cierre «B · Isla» (píldora centrada de
  hasta 640 px con los tres tonos por nivel; `.cc-boton` y el «Cerrar» del celular en gota roja; en los niveles 1 y 2, gota crema). La
  bajada de cada nivel ya no se ve: queda para el lector y en el `title` del botón (la hora de cierre del nivel 0 y el «se mezclan» del
  nivel 2 solo se ven al pasar el mouse: lo decide Felipe). La gota roja da 3,6–4,5:1 en claro (bajo 4,5 donde va la letra), como el
  `btn-peligro` de vidrio de todo el ERP. En `vidrio/caja.css`; la persiana de «Caja cerrada» no se tocó.

- **Historial de ventas al vidrio (Felipe 2026-11-02):** la línea del tiempo «B · Solo los días en gota» (sin el hilo vertical; cada día es
  `<SeparadorDia>` con sus gotas que flotan bajo la cabecera, la de hoy con su punto rojo; la tarjeta del día en placa Serena) y la pila
  «A · Lentes apiladas» (cada prenda en una lente redonda con su luz y su aro de vidrio, el «×N» en el `<Globito esquina>` ahumado y el
  «+N» en gota clara). En `vidrio/historial.css` + dos recetas. Visto con la única venta local; foto real, anuladas y varios días, sin ver.

- **El selector de modo al vidrio (Felipe 2026-11-02):** «Grilla / Tabla» y todo `SegmentoDeslizante forma="modo"` / `SegmentoEnlaces`
  pasan a «A · Pozo y gota»: el pozo con la gota de las pestañas que fluye (el mismo `IndicadorDeslizante variante="gota"`), también entre
  enlaces que cambian `?vista=`. Alto de 36 px como siempre. La tarjeta de `ProductosGrilla` queda como estaba: Felipe elige su reparto.

- **Traslados al vidrio (Felipe 2026-11-02):** la billetera de pases (ADR-0355) con el pase «B · Lente del tono» (vidrio teñido del tono
  con su filo, la banda en el tono, las perforaciones recortadas con una máscara: `PaseFrente` mide dónde caen) y el escenario «A · Al aire»;
  el movimiento no cambia. Para que se lea sobre el vidrio, la letra tenue del pase sube a tinta al 78 %, el nombre de la banda lleva algo
  de tinta y la banda en oscuro va más clara que en la maqueta (12→6 %): peor caso medido 4,5:1. Se corrigió de paso que el frente se veía
  a través del reverso al girar. Solo se vio el tono «contando» (la base local no tiene otros).

- **Clientes ▸ Fichas al vidrio (Felipe 2026-11-02):** «A · Filas en la placa»: `FilaClienta` deja de ser una `card-cayla` por persona; las
  filas viven en la placa de la tabla, con un hilo de tinta al 9 % que nace después del avatar (bajo 640 px, a 14 px del borde), la gota
  clara al pasar el mouse y el avatar en su lente. En `vidrio/clientes.css`. Solo cambia el material: el plan de Clientas es de Dany.

- **La tarjeta de Productos «A · Catálogo de moda» (Felipe 2026-11-02):** la foto al aire como en Vender (sobre ella solo insignias en gota)
  y tres renglones: nombre y precio sin «.00» (`lib/precio-de-catalogo.ts`, con su prueba), «Categoría · color que se ve» y los puntos de
  color de 12 px (24 de toque) con el stock tenue (`stockDeTarjeta`). En tarjeta angosta el precio baja. Felipe aceptó las tres reglas que
  cambia (stock de la empresa en la tarjeta, «Sin stock» en rojo, sin el chip de marca/proveedor): escritas en ADR-0596 act. 2026-11-02.

- **Conteo al vidrio (Felipe 2026-11-02):** la planilla «A · Placa Serena» (sigue siendo un `<table>`: placa Serena, encabezado hundido,
  hilo de tinta al 9 % entre filas, sin rayado; los tintes de cuadra y reconteo no cambian) y los pasos «A · Ranura con gotas» (el `rc-riel`:
  ranura de 6 px, el paso hecho en gota verde, el actual en ahumado denso con halo, el pendiente en gota clara). Recibir mercadería hereda
  los pasos. Contar, Revisar y Confirmar pasan de los pasos en «línea» al riel (`forma="riel"`, con sus subtítulos), como en la maqueta; el
  cuadre del piso sigue en línea. Visto con una maqueta montada sobre la página: la base local no tiene un conteo en curso.

- **Apartados al vidrio (Felipe 2026-11-02):** la hoja «A · Al aire» (la hoja grande se va como la mesa de Vender; la cabecera queda plana;
  el ticket y el panel de Entregar en la placa del ticket; prendas, listas y cifras del Historial en placas) y, en el celular, la «Isla de
  pestañas» (vidrio a 12 px de los bordes con la gota que se corre a la elegida; la barra negra de cada paso se apoya sobre ella). En
  `vidrio/vender.css`. Sin apartados en la base local: filas y Entregar con un apartado elegido, sin ver.

- **Cambios y Devoluciones al vidrio (Felipe 2026-11-02):** el paso a paso «A · Hilo de vidrio» (`FlujoGuiado`: ranura de 6 px hundida,
  nudo hecho en ahumado, el de ahora en gota clara con halo, el que falta en gota suelta) y la «A · Balanza» de lo que trae y lo que lleva
  (`CambioResumen`: las dos prendas como fotos al aire con la lente ⇄ al medio; la diferencia, gota ahumada si cobras y clara si devuelves:
  5,0:1 o más en los dos temas). En `vidrio/posventa.css`. Se fueron los dos bucles de la pieza vieja (el hilo que corría y el botón que
  giraba). Siguen sólidos, por fuera de lo pedido: los botones del flujo, las opciones y las tarjetas de papel de cada paso.

- **Frescura del piso al vidrio (Felipe 2026-11-02):** «Lo que mueve la aguja» B · Lentes del tono (cada tarjeta, vidrio teñido del tono de
  su insignia con su filo; receta nueva `--lente-chica-*`, en oscuro más suave para que la insignia pase 4,5:1) y «por decidir» B · Fila
  hundida (la fila en un pozo de 16 px de esquina, sin su raya ni la de abajo; el hilo rojo del mouse se conserva). En `vidrio/frescura.css`.
  Todo pasa 4,5:1 en los dos temas. Visto con un montaje: la base local no tiene tarjetas de la aguja ni filas por decidir.

- **Mis compras al vidrio (Felipe 2026-11-02):** la billetera «A · Ahumada» (el ahumado del titular de Caja con su luz, su filo y 26 px;
  sus notas en gota crema; la barra de lo usado, el tubo en crema) y «¿Qué hiciste?» «A · Gota grande» («Apunte de compras», la gota ahumada
  del primario, con su ícono en gota crema y el detalle en crema plena al pasar el mouse para seguir en 5,5:1; «Me dieron plata» y «Gasté en
  otra cosa», gotas claras). En `vidrio/pantalla.css`. La cuenta local no tiene una ronda abierta: la billetera llena se vio montada.

- **Lo que quedaba sólido en Cambios y Devoluciones, al vidrio (Felipe 2026-11-02):** `BotonRojo` en la gota roja (receta `--gota-roja-*`
  mudada de `caja.css` a `recetas.css`: «Cerrar caja» usa la misma), `BotonPrincipal` en el ahumado, las opciones en gota con la elegida en
  ahumado denso y la talla que no hay en hueco punteado, «Impecable / Con defecto» en gota, «Lo que revisa el sistema» y las tarjetas de cada
  paso en placa Serena (al confirmar, la balanza queda al aire) y las filas de prenda vendida con la gota al pasar. Lo hereda también el
  «Aprobar» de las devoluciones pendientes. La gota roja da 4,1:1 en claro a media altura (3,6 arriba, 4,5 abajo), bajo el 4,5 de su letra
  de 11 px: es la receta que Felipe eligió y vale también para Caja.

- **Devoluciones a 375 px: la fila de la prenda ya no se sale (2026-11-02):** el `fieldset` de las prendas lleva `min-w-0` y la fila baja de
  línea; el chip («Quedan 9 días») va en su propio renglón en el celular, alineado con el texto, como ya hacía Cambios. Medido: la fila
  termina en 337 px dentro de la tarjeta de 359 y la página no corre de costado.

- **Movimientos al vidrio (Felipe 2026-11-02):** el sello «A · Lente del tono» (receta nueva `--lente-sello-*`: la lente teñida de su tipo
  con luz, filo y sombra del tono; el punteado conserva su borde) y los tipos «A · Placas con su tono» (placa Serena; el elegido, teñido de
  su tono con su filo; su texto tenue sube a tinta al 78 %). El riel y el día pasan a ranura; las filas se tiñen sobre el vidrio. El
  movimiento de los sellos (ADR-0353) no cambió. `tema:auditar` sin hallazgos nuevos en oscuro; el ícono rojo del tipo elegido es el más
  justo (3,07–3,19:1, pasa el 3:1 de un gráfico). Lo hereda el sello del cajón de un movimiento y el de Caja.

- **Colaboradores ▸ Equipo al vidrio (Felipe 2026-11-02):** el rol «A · Gotas» (`PildoraRol`: gota clara; el Líder, gota ahumada; lo
  heredan la ficha del colaborador y de la terminal), «Esperan tu ok» «A · Lente ámbar» (lente del tono, receta nueva
  `--lente-tono-grande-*`; cada alta en gota chica `--gota-chica-*`; en el celular en columna; los botones quedan ✕ Rechazar y luego ✓ Aprobar,
  el que guarda a la derecha) y las filas como las de Fichas (en la placa, hilo tras la cara, la elegida en gota). En `vidrio/colaboradores.css`.
  No cambió ningún permiso. Sin altas en la base local: la franja se vio montada.

- **Plan de campaña al vidrio (Felipe 2026-11-02):** la barra de rango «A · Banda esmerilada» (`BarraRango`: la franja de vidrio sobre una
  pista tenue, la marca del normal en tinta, el rombo con aro de vidrio; la leyenda igual) y el centro de avisos «B · Lentes del tono» (la
  campana en gota, el número en gota de su tono, cada aviso en lente de su tono, la lista en el vidrio de los combos, sus botones en gota). La
  hoja «Configuración» de la campaña (ADR-0488) no se tocó. Sin planes en la base local: la barra se vio montada. Ya estaba y sigue: a 375 px
  la lista de avisos se sale 38 px por la izquierda (posición en línea de `CentroDeAvisos.tsx`).

- **Configuración ▸ Tiendas al vidrio (Felipe 2026-11-02):** la casilla «A · Pozo en la celda» (el `fin-control` dentro de `.cfg-casilla`
  es un pozo que se enciende con su hilo; Finanzas no cambia) y «A · Visto en la celda» (`useVistoGuardado` + `<MarcoCasilla>`: el ✓ verde
  sale solo si la base dijo que sí y se va a los 1,6 s; `VISTO_MS` en `lib/configuracion-casilla.ts`, con su prueba). La planilla
  (`cfg-planilla`) pasa a una tarjeta por tienda bajo 560 px de tarjeta. Distinto de la maqueta: el ✓ va en la esquina de arriba (a media
  altura tapaba la casilla de al lado), el borde es `borde-control` pleno (3:1) y el aviso de la esquina sigue (dice lo que el ✓ no dice).
  Se vio con `fetch` simulado, sin escribir en la base.

- **Compras ▸ Proveedores al vidrio (Felipe 2026-11-02):** «Qué hacer» A · Placa con filas y «Comparar» A · Placa con columnas
  (`vidrio/proveedores.css`). La columna derecha (`CLASE_LADO` y «Qué hacer») es la placa Serena de la tabla; entre filas, el hilo de las
  tablas (`--hilo-fila`, 9 %: la maqueta dice 8 %, se usó la receta); cada tarea se aclara al pasar con la gota chica de las listas y la urgente
  lleva su ícono en la gota roja de 28 px; la × de «Comparar» es una gota chica con su filo. Qué tareas salen y qué compara no cambia. Visto a
  1440 px (claro y oscuro) y a 375 px (nada se sale; la isla oscura de los marcados, igual).

- **Recibir mercadería «B» al vidrio (Felipe 2026-11-02):** superficies A · Vidrio claro y avances B · Tubo (`vidrio/recibir.css`; el
  movimiento de ADR-0575 no cambia). Receta nueva `--vidrio-claro-*` (la Vitrina de Existencias ya la usaba a mano: ahora la toma de ahí,
  igual a la vista). Grupos del acordeón, lacre, Vitrina y el contador en vidrio claro sin desenfoque; la prenda, las cifras del lacre y el
  número del Dial al pozo; el «+» en gota ahumada y el «−» en gota clara; la pista del Dial, la vía del Trayecto y las barras del Podio en
  tubo (el Dial suma `rc-dial-luz`, un brillo quieto que sigue al arco). Los rojos de la etiqueta y del lacre, igual. La base local no tiene
  envíos: se vio con los componentes reales en una página temporal (ya borrada), sin escribir en la base. Falta mirarla con un envío real.

- **Gestión ▸ Plan del piso al vidrio (Felipe 2026-11-02):** tarjeta B · Al aire y banda B · Estante de vidrio (`vidrio/plan-piso.css`,
  bajo `.pp-raiz` para no tocar la `.pp-leyenda` del Plan de compra). `.pp-card` sin fondo ni borde; la banda es una vitrina (`--estante-*`)
  con un tubo de vidrio arriba (`::before`, sin tocar el componente) del que suben los postes; la leyenda y el «¿Por qué?» en placas chicas
  de vidrio claro y su panel en lámina (`--lamina-vidrio-fondo`). El riel «La percha» y su movimiento, igual. Quedan en papel las celdas de
  «Color de la tienda», las fichas de «Fuera del riel» y la Mancuerna (la maqueta no las muestra). Visto a 1440, 1920 y 375 px.
