## 🏷️ Productos ▸ «Por completar ▸ Sin costo» (2026-11-12) — web + migración `20261112155000`; rama `claude/catalog-sin-costo-filter-f15815`

- [x] La base filtra y cuenta «Sin costo» (variante con costo 0 o vacío), solo para quien ve el dinero de Compras.
- [x] La web ofrece la opción en «Por completar» solo a quien ve el costo; con la base de antes no aparece (el conteo no la trae).
- [x] Prueba de base `pruebas:productos-sin-costo` (9 casos, con control), registrada en el CI.
- [ ] **Pegar `20261112155000_productos_por_completar_sin_costo.sql` en producción** (una sola ejecución; termina en «QUEDÓ BIEN»). Hasta
  entonces la opción no se ve en producción, sin error.
