## Filtro «Tienda» en Productos (ADR-0467, 2026-10-20)

- [x] **Pegar `20261021004000_productos_filtro_por_empresa.sql` en producción:** hecho el 2026-10-20 con OK de Felipe («QUEDÓ BIEN», una firma de cada función). Falta refrescar el diccionario cuando se refresque el volcado.
- [ ] **Conteo por tienda dentro de la píldora:** hoy no hay faceta «empresa» en `fn_productos_facetas`; es otro parche a esa función.
- [ ] **Probar con una cuenta real** y prendas reales de CLAURE (hoy todas son de CAYLA): la pantalla se vio con datos inventados.
- [ ] Si alguna migración vuelve a crear las firmas viejas de `fn_productos_listado` / `fn_productos_facetas` / `fn_productos_filtro`, volver a pegar la 20261021004000 después.
