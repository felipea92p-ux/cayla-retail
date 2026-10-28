## 🗑️ Eliminar productos: quien edita el catálogo (2026-10-03, ADR-0252 act.) — migración EN PRODUCCIÓN + web; rama `claude/almacen-delete-catalog-products-fdedf1`

- [x] Migración `20261003232000_eliminar_producto_quien_edita_catalogo.sql`: `fn_producto_se_puede_eliminar`, `eliminar_producto`,
      `fn_producto_como_eliminar` y `eliminar_producto_con_historia` piden `fn_puede_editar_catalogo()`; en «con historia», `puedes`
      ya no es `fn_es_admin()`. Por reemplazo anclado e idempotente (probada dos veces seguidas).
- [x] Web: `productos/page.tsx` usa `editaCatalogo` para «Eliminar» en la tarjeta y en la tabla; los textos y comentarios de la ventana
      y de `eliminar-producto-reglas.ts` (+ prueba) dejan de decir «solo Admin».
- [x] Pruebas de la base al día: `eliminar_producto.mjs` (8 y 8b nuevos) y `eliminar_producto_con_historia.mjs` (5, 6 y 6b).
- [x] **En producción desde el 2026-10-03** (versión `20261003183002`), después de un ensayo revertido. Verificada por efectos:
      las cuatro funciones llaman a `fn_puede_editar_catalogo()` y ninguna a `fn_es_admin()` ni a `fn_es_lider()`; los md5 están en ADR-0252.
- [ ] Refrescar el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`) en el próximo volcado.
- [ ] **Sin probar con la terminal real:** el último clic necesita a alguien de almacén con su entrada marcada en el kiosco. En local
      no hay marcajes de Dynamic y no se pudo dar.
- [x] **Decidido (Felipe, 2026-10-03):** en Existencias ▸ detalle de la prenda, «Eliminar el producto» también lo ve quien edita
      el catálogo, no solo un Admin (`permisosDelDetalle` con `editaCatalogo`; rama `claude/admiring-wiles-a32176`, solo web,
      ADR-0252 «Existencias sigue la misma regla»).
