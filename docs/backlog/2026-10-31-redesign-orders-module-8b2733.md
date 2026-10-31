## Tienda web ▸ Pedidos: lo que falta tras el rediseño (2026-10-31, ADR-0590)
- [ ] **POR PEGAR (2026-10-31): migración `20261031170000_pedidos_web_conseguir_via.sql`, no está en producción.** Pegarla con el OK de Felipe (una sola parte) y correr `pnpm datos:generar:produccion` para que `pedido_web_lineas.conseguir_via` entre al diccionario. Sin ella nada se rompe (la función vieja ignora la clave `via`), pero «Comprarla» y «Pedirla al taller» no se recuerdan: la hoja dice «Por conseguir».
- [ ] `/chaos` de las hojas que guardan (pago, anular, entregar, confirmar con las salidas nuevas) contra la base local.
- [ ] `/formidable` de la pantalla y la hoja del pedido, con lectores ciegos (el verde del WhatsApp, la píldora del tiempo y los pasos de la entrega).
- [ ] `/unificar`: 4 casillas del código, ruta del pedido, píldora de opciones de una prenda sin stock, franja de color de la fila.
- [ ] `pnpm --filter web guias:recorrer` y `tema:auditar` de `/tienda-web/pedidos` (piden sesión y base); a mano se vio en claro, oscuro y 375 px.
- [ ] Que Compras y Producción lean `conseguir_via` (hoy solo la hoja del pedido lo muestra).
