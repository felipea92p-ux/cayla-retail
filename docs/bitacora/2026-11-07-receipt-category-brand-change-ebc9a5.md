# 2026-11-07 — Recibir con aviso: corregir categoría y marca en «¿Esta prenda ya existe?»

- **Qué:** llegaron shorts jean y el aviso los traía como «Jean 248A» en Jeans; no se podía asociar al short que ya existe. Ahora, en una línea del aviso, «¿Esta prenda ya existe?» muestra Categoría y Marca (sin «Sin marca») y al confirmar corrige la línea entera (`despacho_items`) con `cambiar_linea_de_pendiente` (migración `20261107185000_corregir_linea_del_aviso.sql`).
- **Candados:** se niega si algo de la línea ya entró al stock, ya tiene su prenda o anotó una diferencia al cerrar. La orden de compra y la factura no se tocan.
- **Pendiente:** la migración NO está en producción: se pega con el OK de Felipe (una parte, idempotente; necesita `20261107142000`). Hasta entonces la pantalla muestra los combos pero la base responde «su categoría se corrige en Compras».
