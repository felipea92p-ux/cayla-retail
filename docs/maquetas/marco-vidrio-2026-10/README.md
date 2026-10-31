# Maqueta · el marco con vidrio: fondo, menú lateral y cabecera (2026-10-31)

Primera pieza del tablero `docs/vidrio/README.md` (ADR-0596). Felipe decidió llevar todo el ERP al vidrio «Serena» de Mi perfil, componente
por componente; el marco va primero porque el vidrio necesita algo detrás: sobre un fondo plano, una placa de vidrio es una placa crema.

Abrir `index.html` en el navegador (no necesita servidor). La barra negra elige el fondo, el lateral y la cabecera (cada uno con «Como
ahora»), el tema y el ancho. Se toca: las filas del menú (la gota viaja a la que tocas), los grupos, plegar el lateral (la flecha de la
cabecera), el cajón del celular (☰) y «Ver una hoja encima», que abre una hoja Serena para ver cómo se apila todo. La pantalla de atrás es
Existencias con prendas de color, para que el vidrio tenga qué desenfocar al bajar.

## Las caras

| Pieza | A | B | C |
|---|---|---|---|
| Fondo | Crema quieto (luz desde arriba) | **Aurora** (tres nubes tenues quietas) — recomendada | Tejido (la trama de una tela) |
| Lateral | **Panel flotante** (placa a 12 px, la fila activa es la gota) — recomendada | Riel de vidrio (pegado al borde, la activa es un pozo) | Isla de íconos (angosta; se abre al apuntar) |
| Cabecera | **Barra flotante** (placa a 12 px, botones redondos) — recomendada | Fundida (sin barra, el contenido se desvanece) | Dos islas (búsqueda y acciones en cápsulas) |

El porqué de cada una está al pie de `index.html`.

## Lo que no cambia

Qué hace el marco: el menú y sus grupos según los módulos de cada rol, plegar, el cajón de un grupo plegado, el cajón del celular, la
persona que abre Mi perfil, «Salir», la sede, el buscador, Actividad, el tema y Demo. Los íconos son los de `lib/menu-iconos.ts` (su
auditoría es otra pieza del tablero).

## Reglas que respeta

Solo tokens (ADR-0169 / ADR-0336), en claro y oscuro; el color de una prenda es dato. Movimiento una vez, sin rebote; la gota del menú se
mueve solo al tocar una fila; todo se apaga con `prefers-reduced-motion` (ADR-0136). En el celular, 375 px.

## El combo (Felipe 2026-10-31: «mejorar el combo de las sedes y que quede así para todos los combos»)

El combo del ERP es una sola pieza (`Desplegable`, siete formas), así que la cara elegida vale para todos. El selector **Combo** la
muestra en la sede (cabecera), en el filtro «Categoría» y en «Qué se probó» dentro de la hoja (con buscador):

- **A · Gota viajera (recomendada):** disparador en gota; lista de vidrio donde la gota del menú se queda en la elegida y viaja a la que
  apuntas; cada sede con su lente del color de la sede.
- **B · Brota del botón:** la lista nace del disparador y sus opciones se enfocan en cascada; la elegida queda hundida.
- **C · Tarjetas:** con pocas opciones (las sedes), un tablero de tarjetas de vidrio; con muchas, la lista de A.

## Lo que decidió Felipe

**Fondo B · Aurora · Lateral B · Riel de vidrio, con la gota del panel en la fila activa** (la fila corre 6 px para que la marca roja no
toque el ícono) **· Cabecera C · Dos islas · Combo A · Gota viajera** (2026-10-31), para todos los combos del ERP.

Además pidió que el lateral tenga **todos los íconos de hoy, también en los submódulos**, y un despliegue menos brusco: la maqueta usa el
menú real (`lib/menu.ts`, con los subgrupos de tercer nivel) y los 61 trazos de `lib/menu-iconos.ts`; al abrir un módulo, la caja crece en
460 ms con una curva que frena, las filas se enfocan en cascada y la gota de la fila activa las acompaña; al cerrar, 300 ms sin cascada.

Después pidió **el botón de plegar arriba a la derecha del menú** (junto al logo; plegado, bajo el colibrí; en el celular, la ✕ del cajón)
y **quitar las ramas del hilo** que salían a cada submódulo. El selector **Submódulos** muestra tres caras sin líneas: A · Bandeja
(hundida bajo el módulo), B · Sangría limpia (sin caja ni línea) y C · Tarjeta (el módulo abierto y sus submódulos en una placa de vidrio;
recomendada). Felipe eligió **A · Bandeja**. Y pidió que el botón de plegar **no le quite lugar al logo**: ahora flota sobre el borde derecho
del menú, a la altura del logo (una gota de 28 px que viaja con el borde y da vuelta su flecha); plegado, el colibrí queda centrado.

Después: **el buscador no se sale de su isla** (la cabecera es un contenedor: angosta, el buscador pierde la «/» y luego queda en una lupa;
medido de 1440 a 600 px, abierto y plegado) y **el menú plegado con los íconos bien cuadrados** (cada fila un cuadrado con el ícono al
centro, la marca roja al canto). Para aprovechar el espacio plegado, el selector **Plegado**: A · Con nombre (84 px, el nombre corto bajo
cada ícono; recomendada) o B · Solo íconos (64 px). Pendiente que elija.
