## 🗑️ Eliminar productos: quien edita el catálogo (2026-10-03, ADR-0252 act.) — migración + web; rama `claude/almacen-delete-catalog-products-fdedf1`

- [x] Migración `20261003232000_eliminar_producto_quien_edita_catalogo.sql`: `fn_producto_se_puede_eliminar`, `eliminar_producto`,
      `fn_producto_como_eliminar` y `eliminar_producto_con_historia` piden `fn_puede_editar_catalogo()`; en «con historia», `puedes`
      ya no es `fn_es_admin()`. Por reemplazo anclado e idempotente (probada dos veces seguidas).
- [x] Web: `productos/page.tsx` usa `editaCatalogo` para «Eliminar» en la tarjeta y en la tabla; los textos y comentarios de la ventana
      y de `eliminar-producto-reglas.ts` (+ prueba) dejan de decir «solo Admin».
- [x] Pruebas de la base al día: `eliminar_producto.mjs` (8 y 8b nuevos) y `eliminar_producto_con_historia.mjs` (5, 6 y 6b).
- [ ] **No está en producción.** Pegar `20261003232000` en el SQL Editor (una sola parte, sin políticas) ANTES de fusionar la web;
      después comprobar por efectos que las cuatro funciones llaman a `fn_puede_editar_catalogo()` y ninguna a `fn_es_admin()`,
      y refrescar el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Sin probar con la terminal real:** el último clic necesita a alguien de almacén con su entrada marcada en el kiosco. En local
      no hay marcajes de Dynamic y no se pudo dar.
- [ ] **Por decidir (Felipe):** Existencias ▸ detalle de la prenda sigue mostrando «Eliminar el producto» solo a un Admin
      (`lib/existencias-permisos.ts`). Con la regla nueva podría ser también de quien edita el catálogo.
