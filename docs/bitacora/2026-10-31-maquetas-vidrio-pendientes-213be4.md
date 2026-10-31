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
