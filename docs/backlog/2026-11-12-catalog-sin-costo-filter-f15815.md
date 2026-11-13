## 🏷️ Productos ▸ «Por completar ▸ Sin costo» (2026-11-12) — web + migración `20261112155000` (pegada); rama `claude/catalog-sin-costo-filter-f15815`

- [x] La base filtra y cuenta «Sin costo» (variante con costo 0 o vacío), solo para quien ve el dinero de Compras.
- [x] La web ofrece la opción en «Por completar» solo a quien ve el costo; con la base de antes no aparece (el conteo no la trae).
- [x] Prueba de base `pruebas:productos-sin-costo` (9 casos, con control), registrada en el CI.
- [x] Migración `20261112155000` pegada en producción el 2026-11-12 por orden de Felipe (subida a la página, huella SHA-256 igual al archivo,
  «QUEDÓ BIEN»). La opción aparece en producción cuando se publique la web de este PR.
