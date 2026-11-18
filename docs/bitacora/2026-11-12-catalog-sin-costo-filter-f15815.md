# 2026-11-12 · Catálogo ▸ Productos: «Por completar ▸ Sin costo»

- **Qué:** el filtro «Por completar» de Productos suma «Sin costo»: las prendas con alguna variante visible con el costo en 0 o vacío. Lo
  aplica la base (`fn_productos_filtro`, `fn_productos_listado` y `fn_productos_facetas`, reemplazo anclado en
  `20261112155000_productos_por_completar_sin_costo.sql`) y la web solo lo dibuja (`faltasVisibles`, `lib/productos-filtros.ts`).
- **Por qué:** Felipe lo pidió para encontrar lo que falta cargar; sin costo no hay margen ni precio propuesto que valga. Es por variante, como
  todo el listado (ADR-0308), y con la misma regla del precio propuesto (`costo > 0` = tiene costo).
- **Cómo se verificó:** `pnpm pruebas:productos-sin-costo` 9/9 con control; en local la opción dice 363 y la lista trae 363; quien no ve el
  dinero de Compras no la ve ni encuentra nada con ella. `tsc`, Knip y las pruebas de `productos-filtros` en verde.
