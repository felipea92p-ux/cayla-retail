## Tienda web ▸ Pedidos: lo que falta tras el rediseño (2026-10-31, ADR-0590)
- [x] **PEGADA en producción (2026-10-31, con el OK de Felipe):** migración `20261031170000_pedidos_web_conseguir_via.sql`; la consulta de verificación dio `true` en `confirmar_ok`, `detalle_ok` y `columna_ok`. Falta correr `pnpm datos:generar:produccion` para que `pedido_web_lineas.conseguir_via` entre al diccionario.
- [ ] `/chaos` de las hojas que guardan (pago, anular, entregar, confirmar con las salidas nuevas) contra la base local.
- [ ] `/formidable` de la pantalla y la hoja del pedido, con lectores ciegos (el verde del WhatsApp, la píldora del tiempo y los pasos de la entrega).
- [ ] `/unificar`: 4 casillas del código, ruta del pedido, píldora de opciones de una prenda sin stock, franja de color de la fila.
- [ ] `pnpm --filter web guias:recorrer` y `tema:auditar` de `/tienda-web/pedidos` (piden sesión y base); a mano se vio en claro, oscuro y 375 px.
- [ ] Que Compras y Producción lean `conseguir_via` (hoy solo la hoja del pedido lo muestra).
