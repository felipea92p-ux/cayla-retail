# Backlog · De quién es lo vendido: CAYLA y CLAURE (2026-10-26, ADR-0532)

- [ ] Felipe: OK para pegar `20261026232000_vendido_por_empresa.sql` en producción (dos funciones de solo lectura, una sola parte, sin políticas). Antes que la web; sin ella, Caja e Historial salen como antes.
- [ ] Refrescar el volcado (`pnpm datos:generar:produccion`) cuando esté en producción: no suma tablas, solo dos funciones.
- [ ] El Excel del Historial (`/vender/historial/exportar`) no trae la empresa de cada venta. Sumarla si Felipe la necesita ahí.
- [ ] Con los filtros que la base no suma (por enviar, factura, con cliente, con posventa) el reparto no se muestra. Si se pide, hay que llevar esos filtros a `fn_totales_historial_ventas` y a `fn_vendido_por_empresa` a la vez.
- [ ] Lo que CAYLA le debe a CLAURE (a costo, la liquidación) no está en estas pantallas: Felipe eligió ver solo lo vendido.
