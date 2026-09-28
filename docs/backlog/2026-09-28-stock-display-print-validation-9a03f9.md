## 📦 Productos: stock de la sede por talla, en la Grilla y al imprimir etiquetas (2026-09-28) — solo web, sin migración; rama `claude/stock-display-print-validation-9a03f9` (PR #587)

- [x] Tabla: la ficha de variantes muestra el stock de cada talla EN LA SEDE; costo y margen solo si difieren entre tallas.
- [x] Imprimir (talla, modelo, fila, marcadas; Tabla y Grilla) cuenta el stock en el momento: con 0 avisa y el botón queda rojo, no navega.
- [x] Grilla: vista rápida con columna Stock e impresora por talla; tarjetas con «En tu sede: N» y «Sin stock en tu sede» cuando la red tiene y la sede no.
- [ ] **El filtro «Sin stock» de la barra sigue mirando la red** (`fn_productos`, `p_stock = 'sin_stock'` compara `stock_total`): una prenda que dice «Sin stock en tu sede» NO aparece al filtrar «Sin stock». Llevarlo a la sede es cambiar `fn_productos` (migración + producción): decidir si el filtro pasa a ser por sede o si se suma un filtro «Sin stock en mi sede».
- [ ] **La fila de la Tabla muestra solo el total de la red** (la sede se ve al abrir la ficha): si la Tabla también se usa para vender, sumar «En tu sede» bajo el total, como la Grilla.
- Cómo verificas: Catálogo ▸ Productos ▸ Grilla con una sede que no tenga una prenda que otra sí tiene: su tarjeta dice «Sin stock en tu sede»; abre su vista rápida y toca la impresora de una talla en 0: aviso arriba a la derecha y el botón en rojo, sin cambiar de pantalla.
