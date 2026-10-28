## 🛍️ Vender: una tarjeta por prenda (2026-10-03, ADR-0323) — solo web, sin migración; rama `claude/pos-grid-variant-layout-3dd71c`

- [x] Grilla por prenda, ordenada por nombre (`agruparPorPrenda`, `filtrarConStock`, `colorInicial`, `puntosAVista`, `resumenDePrenda` en `lib/catalogo-grupos.ts`, con pruebas).
- [x] Tarjeta con puntos de color, tallas del color elegido o «Agregar · color», tope y globito (`components/punto-de-venta/TarjetaPrenda.tsx`).
- [x] «Todo de la prenda» en hoja del sistema, agrega sin cerrarse, «Anotar que no había» del color que se mira (`components/punto-de-venta/OpcionesDePrendaModal.tsx`). Se borró `ElegirTallaModal.tsx`.
- [x] Verificado en local (Tienda Lima) en escritorio y a 375 px; suite completa en verde.
- [ ] **Sin probar con datos de TRU:** en local solo hay prendas de 1 a 4 colores. Con una prenda de 12 colores (Gorra Urbana en producción) revisar el «+N» y el largo de la ventana en la tablet de la tienda.
- [ ] **Sin probar con una colaboradora real:** que entienda sola que el punto elige el color y que tocar la prenda abre todo.
- [ ] El escáner no mueve la tarjeta al color leído (la maqueta lo mostraba): la grilla no sabe qué leyó la pistola. Si hace falta, es una prop nueva desde `PuntoDeVenta`.
