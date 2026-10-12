## 🏷️ El precio 0 solo vale en Empaque, también en la base (2026-10-12, ADR-0380) — migración `20261012190000` **sin pegar en producción**; rama `claude/precio-cero-solo-empaque`

- [x] `fn_categoria_admite_precio_cero` (la regla, un lugar) y candados en `registrar_venta` (`venta_sin_precio`), `revisar_producto_censo`,
      `crear_producto_con_variantes` y `catalogo_actualizar_producto` (`sin_precio`). Reemplazos anclados, idempotente, una sola parte.
- [x] Web: la caja no deja entrar al ticket una prenda de mercadería en S/ 0 (`sinPrecioParaVender`, también la cámara); «Por revisar» frena aprobar
      sin precio y lleva a la ficha; Nuevo producto bloquea una celda de la tabla de precios en 0 y la nombra en «Falta»/«Siguiente».
- [x] Pruebas: `pruebas:registrar-venta` (+4), `pruebas:revisar-productos` (+4), `pruebas:precio-cero` (nueva, en el CI); vitest con paridad contra la
      migración. Las dos regresiones fallaban antes del arreglo.
- [x] Verificado en el navegador local (1440 y 375 px en Vender), con la base fotografiada antes y restaurada idéntica después.
- [ ] **Pegar `20261012190000_precio_cero_solo_empaque.sql` en producción** (OK puntual de Felipe). Después: `pnpm datos:generar:produccion` y
      `pnpm datos:comparar`.
- [ ] **Sin revisar:** Apartados (`separaciones` exige `precio_unitario > 0` con un CHECK: apartar una prenda en 0 ya fallaba, pero con el mensaje
      crudo del candado) y Cambios (`registrar_cambio` con una prenda nueva en 0). Con alta, edición, aprobación y caja cerradas es difícil llegar ahí;
      no se tocó.
