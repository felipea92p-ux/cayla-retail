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
