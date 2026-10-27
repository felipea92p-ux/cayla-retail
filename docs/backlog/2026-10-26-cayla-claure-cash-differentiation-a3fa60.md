# Backlog · En Lima manda la marca: CAYLA y CLAURE (2026-10-26, ADR-0532)

- [x] `20261026232000` y `20261026234000` pegadas en producción el 2026-10-26 con el OK de Felipe (versiones `20261027000005` y `20261027000049`), verificadas con lecturas y la sesión de un líder en una transacción de solo lectura.
- [ ] Fusionar la web (abrir el PR con `/abrir-pr`): hasta entonces Caja, Historial, Movimientos y Nuevo producto se ven como antes.
- [ ] Refrescar el volcado (`pnpm datos:generar:produccion`) cuando estén en producción: una columna nueva (`empresas.marca_id`) y seis funciones.
- [ ] Felipe: las etiquetas de precio, el filtro «Tienda» de Catálogo ▸ Productos y la tienda online siguen leyendo `productos.empresa_id`. Una prenda de otra marca compartida con Trujillo se imprime y se filtra como CAYLA aunque en Lima su dinero sea de CLAURE. ¿Las llevamos a la regla por marca?
- [ ] Felipe: la «Prenda sin registrar» es marca CAYLA: vendida en Lima cuenta como CAYLA. ¿Debería contar como CLAURE en Lima?
- [ ] «Es nueva» al recibir y el censo crean prendas sin preguntar: nacen CAYLA en `productos`. En Lima su dinero ya cuenta por la marca, pero el candado de ADR-0505 no las encierra en Lima. Hacer que también decidan por la marca.
- [ ] El Excel del Historial (`/vender/historial/exportar`) no trae la empresa de cada venta.
- [ ] Con los filtros que la base no suma (por enviar, factura, con cliente, con posventa) el reparto del Historial no se muestra.
- [ ] Lo que CAYLA le debe a CLAURE (a costo, la liquidación) no está en estas pantallas: Felipe eligió ver solo lo vendido.
