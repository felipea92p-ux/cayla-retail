## Filtro «Tienda» en Productos (ADR-0467, 2026-10-20)

- [ ] **Pegar `20261021004000_productos_filtro_por_empresa.sql` en producción antes de fusionar** (una ejecución; cambia las firmas de tres funciones). Con OK de Felipe. Después, refrescar el diccionario.
- [ ] **Conteo por tienda dentro de la píldora:** hoy no hay faceta «empresa» en `fn_productos_facetas`; es otro parche a esa función.
- [ ] **Probar con una cuenta real** y prendas reales de CLAURE (hoy todas son de CAYLA): la pantalla se vio con datos inventados.
- [ ] Si alguna migración vuelve a crear las firmas viejas de `fn_productos_listado` / `fn_productos_facetas` / `fn_productos_filtro`, volver a pegar la 20261021004000 después.
