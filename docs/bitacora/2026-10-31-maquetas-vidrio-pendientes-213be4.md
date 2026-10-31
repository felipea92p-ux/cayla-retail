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
