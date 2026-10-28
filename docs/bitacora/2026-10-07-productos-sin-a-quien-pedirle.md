## 2026-10-07 (Productos: se quita la barra «A quién pedirle»)
Qué hice: borré la tarjeta «A quién pedirle · Pedir a · N productos para pedir» de Catálogo ▸ Productos, su consulta
(`getReposicionPorProveedor`, hasta 3 llamadas más a `fn_productos_listado` por carga) y su conteo (`contarProductosPorProveedor` y su prueba).
Por qué así: Felipe preguntó si era necesaria; repetía los filtros Disponibilidad ▸ «Pedir a proveedor» + Proveedor, que dan la misma lista y la misma cifra.
Qué se rompería sin esto: una tarjeta entera arriba de los filtros para un atajo duplicado, y hasta 300 filas leídas de más cada vez que había algo por pedir.
