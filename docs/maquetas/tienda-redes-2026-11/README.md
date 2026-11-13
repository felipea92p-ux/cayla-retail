# Redes sociales en la tienda web: maquetas (2026-11-12)

**Qué es:** Felipe pidió sumar las redes de CAYLA a la tienda web (`apps/tienda`) y ver dónde irían. Son maquetas para elegir mirando.

**Elegida: C (Felipe 2026-11-12), ya construida** en `lib/redes.ts`, `components/Redes.tsx` y `app/estilos/redes.css`. La maqueta usa los colores de «G · Pasarela» (blanco y negro, casillas cuadradas); la tienda ya tenía la identidad Premium (ADR-0615), así que lo construido va redondo, con la tinta y el filo de lo que se toca de esa identidad. El lugar, el tamaño y el color al pasar el puntero son los de la maqueta.

**Cómo verla:** abre `index.html`, o sírvela con `maquetas` de `.claude/launch.json` y entra a `/tienda-redes-2026-11/`. La barra gris de arriba cambia de vista y no es parte del diseño. La raya roja punteada marca lo nuevo (se apaga con la casilla).

## Las vistas

- **Dónde van:** cada lugar de la tienda con su veredicto. Sí: el pie, el final del menú del celular y la página «¡Listo, lo separaste!». No: la cabecera, la franja de anuncio y la ficha de la prenda, porque sacan a la persona de la tienda antes de comprar.
- **A · En el pie:** seis íconos de 44 px bajo el lema del pie, en todas las páginas, y los mismos al final del menú del celular.
- **B · Banda Síguenos:** una franja negra a todo lo ancho antes del pie, con lo que se encuentra en cada red. Los textos de cada red son un ejemplo inventado.
- **C · En el momento justo (recomendada):** lo de A, más las redes al final de «¡Listo, lo separaste!», debajo de los pasos y del botón de WhatsApp.

## Decisiones de diseño

- Quietos, los íconos van en negro: en la Pasarela (ADR-0524) el único color es el de las prendas.
- **Al pasar el puntero, cada ícono se pinta con el color de su red** (Felipe 2026-11-12): Instagram con su degradado, TikTok negro con su eco celeste y rojo, y el filo de la casilla toma el mismo color. En el oscuro y sobre el escenario negro de B se usan tonos más claros de cada marca. Con el dedo no hay puntero, así que en el celular se quedan en negro.
- Con mouse miden 36 px y con el dedo 44 px, así las seis caben en una fila del pie desde una laptop chica. Entre casilla y casilla van 6 px: con 8, la sexta bajaba sola en el menú del celular a 375 px.
- Se abren en otra pestaña, con `rel="noopener noreferrer"` y un nombre para el lector de pantalla («CAYLA en Instagram (se abre en otra pestaña)»).
- Los íconos son de Simple Icons (licencia CC0), copiados en la maqueta.
- Los enlaces van limpios, sin `?locale=es_LA` ni `?hl=es-la`. YouTube es la única cuenta que no es @caylaperu (`@caylaperu3004`).
- Spotify se sumó el 2026-11-12 (`https://open.spotify.com/user/caylaperu`). Es un perfil de usuario: conviene tener al menos una playlist pública antes de poner el ícono.

## Lo que decide Felipe

1. ~~A, B o C~~: C.
2. El orden de las redes (la maqueta usa Instagram, TikTok, Facebook, Pinterest, YouTube, Spotify) y si alguna que casi no se usa se queda fuera.
3. En B, los textos de cada red.

## Cómo quedó construida

La lista de redes vive en `apps/tienda/lib/redes.ts` (con su prueba) y sus dibujos en `lib/redes-trazos.ts`. La pieza `components/Redes.tsx` la dibuja en `components/Pie.tsx`, en `HojaMenu` de `components/CabeceraConCuenta.tsx` y en `app/bolsa/separado/[numero]/page.tsx`. Sus estilos están en `app/estilos/redes.css`, porque la tienda y el ERP no comparten estilos (ADR-0616). Una red nueva o un enlace que cambia se toca en `lib/redes.ts` y llega a los tres lugares.
