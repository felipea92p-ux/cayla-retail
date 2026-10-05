## 🪪 La prenda sin foto en un solo lenguaje (2026-10-04, ADR-0332) — solo web, sin migración; rama `claude/isotipo-visual-alignment-458ecd`

- [x] `MosaicoPrenda` gana la forma `relleno`; `SinFoto`, `MiniaturaPrenda` y `FotoDePrenda` la usan (el isotipo deja de ser relleno).
- [x] Existencias trae `categorias.prefijo`/`familia` y los lleva a tarjeta, lista, cajón, Ajustar, Reponer, Subir y Bajar al piso.
- [x] Conteo lleva la categoría de `getCatalogo()` a sus cinco pantallas.
- [x] Candado `lib/sin-foto.test.ts` (el isotipo solo como marca) y regla en `CLAUDE.md`.
- [x] Catálogo ▸ Productos (tarjeta, vista rápida y tabla), Apartados e Inicio de Almacén dibujan el mismo mosaico (Felipe: «unifícalas
      todas»); se borraron `PrendaSinFoto`, su CSS, `IconoPercha` de Productos y `mezclar`.
- [x] La página de Apartados pasa `colorHex` (no lo hacía) y la de Productos pega prefijo y familia desde su lectura de `categorias`.
- [ ] Llevar la categoría (`prefijo`, `familia`) y el color a Movimientos (`lib/movimientos-cajon.ts`: `ItemPrenda`, `FilaBajada`,
      `prenda`, `ContextoCajon`), Traslados (`getAparienciaVariantes`), Cambios, Devoluciones, Compras, Resumen y Análisis: hoy dibujan
      la percha sobre un tono neutro.
- [ ] Probar con fotos reales en TRU: la base local no tiene ninguna, así que el lado «con foto» no cambió pero tampoco se vio.
