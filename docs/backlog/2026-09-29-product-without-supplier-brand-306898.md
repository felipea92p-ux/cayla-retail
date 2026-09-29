## 🏷️ Producto sin marca ni proveedor (2026-09-29, ADR-0283) — web + 1 migración; rama `claude/product-without-supplier-brand-306898`

**Estado:** hecho en la rama y verificado en local (19/19 SQL, 242 archivos de pruebas web, recorrido en el navegador); **la migración YA está en producción (2026-09-29)**, la web todavía no se despliega.
Si no le sirve: «volver» = `git revert` de la rama y, ahora que la migración ya se pegó, volver a poner `NOT NULL` **solo si ningún producto quedó sin marca**
(`select count(*) from retail.productos where marca_id is null or proveedor_id is null`; si hay filas, completarlas antes; y volver a poner el cuerpo viejo de `fn_validar_marca_proveedor`, el de `20260918231100`).

- [x] Migración `20260930020000_producto_sin_marca_ni_proveedor.sql`: `productos.marca_id` / `proveedor_id` admiten `NULL`, `fn_validar_marca_proveedor` relajada
      (las cuatro puertas de alta la llaman igual), filtro del uuid nulo en `fn_productos` y `fn_productos_resumen`. Prueba `pnpm pruebas:producto-sin-marca` (19 casos) y su paso en `ci.yml`.
- [x] Web: selector de dos campos que se filtran entre sí (`ElegirMarcaProveedor.tsx`), alta y edición opcionales, chip «Sin…» (`MarcaProveedorLinea.tsx`), filtros
      `?marca=sin` / `?proveedor=sin`, «Sin proveedor» en «A quién pedirle», línea de aviso en la pantalla de éxito, Marcas ya no revienta con `NULL`.
- [x] **Migración pegada en producción (2026-09-29)**: ensayo que se revirtió solo + aplicación por MCP + verificación por efectos y md5 (ver ADR-0283, «Estado»).
- [ ] **Desplegar la web** (commit → PR → merge a `main`) y probar en producción con una prenda real: crear sin marca, ver el chip, completar al editar.
- [ ] Refrescar el diccionario (`docs/datos/generado/`, ver `COMO-REFRESCAR.md`): dice `marca_id` / `proveedor_id` `NOT NULL` y hoy ya no lo son.
- [ ] **Censo de Conteo (`components/conteo/AltaAlVuelo.tsx`)**: sigue exigiendo marca y proveedor (línea 83). Tres líneas: quitar la validación, mandar
      `p_marca_id: marcaId || undefined` y pasar `opcional` al selector. Esperar a que la sesión del Conteo (ADR-0282) libere el archivo.
- [ ] Probar en local con un proveedor que trae varias marcas y una marca con varios proveedores (el local tiene una sola marca; las reglas puras lo cubren, el navegador no).
- [ ] Decidir si, cuando «Sin marca» pase de decenas de productos, se vuelve una alerta en Inicio del líder (hoy: chip + filtro + línea al terminar el alta).
- [ ] Al buscar por marca (Vender, Existencias, Análisis, Movimientos) un producto sin marca no aparece: es lo correcto, pero conviene mirarlo con el catálogo real cargado.
