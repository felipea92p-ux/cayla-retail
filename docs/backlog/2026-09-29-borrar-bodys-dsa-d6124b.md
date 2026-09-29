## 🧹 Se limpió el vocabulario de prueba de producción (2026-09-29) — solo datos de producción, sin código ni migración; rama `claude/borrar-bodys-dsa-d6124b`

Cierra en parte el pendiente «Limpiar las categorías y prendas de prueba de producción» (`docs/BACKLOG.md`, 3a · Temporadas).
Todo se hizo en `cayla-dynamic`, schema `retail`, a pedido de Felipe (que ya no quería «Bodys › dsa» en el selector de categoría).

- [x] **Desactivadas y después borradas por Felipe** (el `delete` lo corrió él en el SQL Editor; yo solo desactivé y verifiqué):
  categorías «dsa» (`DSA`, subcategoría de Bodys) y «prueba Lapicero» (`PLP`); marcas «Prueba», «prueba marca1» y «dfsdf»;
  proveedores «pruebaProveedor» y «PRUEBApROVEDOR 2»; colores «Prueba rosa» (`PRR`) y «prueba Verde» (`PRV`). Ninguna tenía
  productos, lotes, compras, conteos ni cotizaciones; solo enlaces marca ↔ proveedor, tejido y patrón, que se fueron con
  ellas. Los proveedores reales enlazados («Fibras Collection SAC», «Y.J.J») **no se tocaron**.
  - Orden del borrado, por las llaves sin cascada: `marca_proveedores` → `marcas` → `proveedores` → `categorias`
    (`categoria_tejidos` y `categoria_patrones` caen solas por `ON DELETE CASCADE`) → `colores`.
  - Verificado por consulta directa después: 0 filas por id o por nombre (`prueba|test|asdf|dfsd|xxx|qwer|dsa`) en
    categorías, marcas, proveedores, colores, familias y productos; 0 enlaces o tejidos/patrones huérfanos; «Bodys» y
    «Lapiceros» siguen activas.
  - Los nombres «dsa» y «prueba Lapicero» y los prefijos `DSA` y `PLP` quedan libres.
- [x] **Ventas de prueba: archivadas, no borradas, a propósito.** Las 3 ventas de `retail.ventas` están `anulada` +
  `es_prueba = true` (ADR-0159/ADR-0224): salen del historial y de los reportes por defecto, y `movimientos` es append-only,
  así que no se purgan. `productos`, `cajas` y `conteos` no tienen ninguna fila `es_prueba`.
- [ ] **Decide Felipe — categoría «Colores»** (activa, 0 productos): el pendiente original la listaba como de prueba y no se
  tocó porque no la nombró. Si lo es: desactivarla.
- [ ] **Decide Felipe — marca «y.j.j» y proveedor «Y.J.J»** (activos, 0 productos): el pendiente original los listaba; el
  proveedor estuvo enlazado a la marca de prueba «Prueba», pero puede ser un proveedor real. No se tocaron.
- [x] «Fhfh», «Test de Produto 2» y «Producto de Prueba» (del mismo pendiente) ya **no existen** en producción: se buscaron
  en categorías, marcas, proveedores y productos (por referencia y por descripción) y no aparecen. No se sabe cuándo se fueron.
- [ ] **Sin verificar:** que no haya datos de prueba SIN marcar y con nombre normal (una caja, un conteo). Los 19 `cajas` y
  los 10 `conteos` no llevan `es_prueba`; si alguno fue de prueba, hay que decirlo para archivarlo.
