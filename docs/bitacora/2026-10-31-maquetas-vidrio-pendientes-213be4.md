# 2026-10-31 · Maquetas del vidrio: las piezas de pantalla (ADR-0596)

- **Base del marco:** el marco ya elegido (Aurora, riel con gota, dos islas, combo gota) se separó en `docs/maquetas/vidrio-base-2026-10/`
  (`marco.css` + `marco.js`) para montar encima cada maqueta de la sección 3 del tablero sin copiar 800 líneas cada vez.
- **Cabecera de pantalla (`EncabezadoPagina`, 115 archivos):** maqueta `docs/maquetas/cabecera-vidrio-2026-10/` con «Como ahora», A · Plana
  con gotas (recomendada), B · Placa y C · Se acomoda arriba, sobre Existencias, Órdenes de compra y una orden; medida a 375 px en los dos
  temas sin desbordes. Felipe eligió **A · Plana con gotas**. Sin cambios en `apps/web`.
- **Tarjetas de cifra (`TarjetaCifra`, 238 usos en 68 archivos):** la base suma lo ya elegido que toda pantalla trae (botones gota, la
  cabecera A). Maqueta `docs/maquetas/cifras-vidrio-2026-10/` con «Como ahora», A · Placa Serena (recomendada), B · Plana y gotas y
  C · Franja de vidrio, sobre Compras, Gastos (las tarjetas filtran de verdad) e Inicio; medida a 375 px sin desbordes. Felipe eligió **A · Placa Serena**.
- **Tablas (`Tabla` en 75 archivos + `.fila-cayla` en 20):** las tarjetas de cifra A pasan a la base. Maqueta
  `docs/maquetas/tablas-vidrio-2026-10/` con «Como ahora», A · Lámina casi papel (recomendada: la de las hojas en Serena), B · Placa Serena
  y C · Plana sobre la Aurora, sobre Órdenes (se ordenan y se abren) y Movimientos; medida a 375, 723 y 1500 px. Espera a Felipe.
- **Tablas, elegida B · Placa Serena,** y Felipe pidió una tabla «con superpoderes»: maqueta `docs/maquetas/tabla-superpoderes-2026-10/`,
  con letra de 15 px (17 con «Letra grande»), todo al centro con los montos alineados por sus cifras, filtros y orden desde la cabecera
  (A · Globo, recomendada; B · Fila de filtros), la frase de lo que ves, cabecera pegada, fechas que dicen cuánto falta, total de lo que
  ves y vacío con salida. Probada al tocar (filtros, orden, vacío, limpiar) y medida a 1500 y 375 px. Espera a Felipe.
- **Tabla con superpoderes, elegida A · Globo desde la cabecera,** «siempre super responsive»: la tabla responde a su propio ancho
  (contenedor) en cuatro escalones (7 columnas · 5 · 4 · tarjetas), lo que se esconde baja a la línea del proveedor, y en el teléfono el
  filtro es la hoja a media altura. La base suma los anchos 320/375/430/768/1024/1280/1440/1920 (con zoom si no caben). Medidas 216
  combinaciones sin desbordes.
- **Cabecera pegada de la tabla** (Felipe: «se confunde con el contenido»): era vidrio al 72–86 % y se pegaba 92 px más abajo (el `top`
  de `sticky` se mide desde el relleno de #cont), así que se leían filas a través y por encima. Ahora se pega justo bajo las islas, al
  98 % con su sombra, y la franja de arriba es el mismo vidrio.
- **Cabecera pegada, segunda vuelta** (Felipe: «no me gusta que se extienda tanto hacia arriba»): sin la franja de vidrio que subía al
  borde; la cabecera queda de su tamaño, con las esquinas de arriba redondeadas, y lo que sube por encima se esconde con una máscara en
  `#cont` solo mientras está pegada.
- **Cabecera pegada, tercera vuelta** (Felipe: «que los bordes se redondeen»): detrás de sus esquinas seguía el vidrio de la tabla y se
  veían cuadradas. Ahora la tabla pegada se recorta desde la cabecera con `clip-path: inset(… round 22px)` (reemplaza la máscara de
  `#cont`): esquinas redondas de verdad, con la Aurora detrás, en claro y oscuro.
- **Cabecera pegada, cuarta vuelta** (Felipe: «si se hace el scroll muy rápido, igual pasa a la cabecera el contenido»): el recorte lo
  hacía JavaScript en cada evento de desplazamiento y llegaba un cuadro tarde. Ahora es CSS guiado por el desplazamiento
  (`animation-timeline: view()`): cada fila se recorta al pasar bajo la cabecera, el vidrio de la tabla (en su capa `.t-fondo`) se
  recorta con sus esquinas y la cabecera se vuelve opaca, todo en el mismo cuadro. Medido al píxel; JavaScript queda de respaldo.
- **Cabecera pegada, quinta vuelta** (Felipe: «se siguen viendo las puntas del contenido»): dos esquinas redondeadas iguales, una sobre
  otra (cabecera y vidrio de la tabla), dejaban un filo por el suavizado. La cabecera lleva su propio vidrio y `.t-fondo` empieza bajo
  ella. Medido en Chrome sin ventana: 384 mediciones con la rueda a toda velocidad, 0 asomadas; esquinas limpias
  (`docs/maquetas/tabla-superpoderes-2026-10/medir-cabeza.cjs`).
- **Pestañas de sección (`Pestanas`, 35 archivos):** maqueta `docs/maquetas/pestanas-vidrio-2026-10/` con «Como ahora» (píldora de tinta
  sólida), A · La gota de Mi perfil (recomendada: la de las hojas, que fluye de una a otra), B · Vidrio ahumado y C · La gota del menú,
  sobre Compras (conteos que piden y que avisan) y Finanzas (seis con ícono). Medidas 96 combinaciones (320 a 1920 px, claro y oscuro)
  en Chrome sin ventana: sin desbordes y la gota siempre sobre la elegida. Felipe eligió **A · La gota de Mi perfil**.
- **Lo elegido, a la sesión que implementa** (Felipe: «pásale todo lo que elegí a la otra sesión y que lo implemente en local»): mensaje
  a la sesión de los modales con las cuatro piezas de pantalla y la técnica de la cabecera pegada; la rama subió a origin.
- **Inicio del líder, entero:** maqueta `docs/maquetas/inicio-lider-vidrio-2026-10/` con lo ya elegido y un selector por cada pieza que
  faltaba (títulos, «Te toca», accesos, equipo, barra de avance, interruptor de «Ajustar», barra del celular); medida en 72 + 6
  combinaciones sin desbordes. Espera a Felipe.
- **El Observatorio con vidrio** (Felipe: «me refería al observatorio»): sale de «fuera hasta que Felipe diga». Maqueta
  `docs/maquetas/observatorio-vidrio-2026-10/`: la v3 aprobada tal cual con una capa de vidrio (Aurora, marco elegido, placas, controles
  en pozo y gota, orbes en lente, barras en tubo) y tres selectores. La del Inicio de una líder de tienda queda aparte. Espera a Felipe.
- **Observatorio, elegido:** B · El mapa al aire, controles B · Ahumado y orbes A · Lente. Más contraste en los controles (pista con
  `borde-control`, lo no elegido en tinta al 80 %) y cuatro extras para mirar (orbes con líquido, cinta de vidrio, anillos de tubo, el
  Perú de vidrio). Corregido: en oscuro, «el mapa al aire» volvía a meter el mapa en su tarjeta.
