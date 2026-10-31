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

## Lo que decidió Felipe

Pendiente.
