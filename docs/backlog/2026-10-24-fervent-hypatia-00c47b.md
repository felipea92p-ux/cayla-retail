# Backlog · 2026-10-24 · Recibir mercadería

- [ ] **Pegar `20261024235000_observaciones_de_envio.sql` en producción** (con el OK de Felipe; una sola parte) y refrescar el volcado del diccionario. Hasta entonces, en producción «Anotar observación» no puede guardar (la pantalla muestra el error, no se cae).
- [ ] Mostrar las observaciones al **cerrar** el envío y a Compras («Nos debe») para que sirvan al reclamo al proveedor.
- [ ] Registrar lo **recibido contra lo enviado por línea** con observaciones cuando no cuadre (lo que Felipe pidió al inicio): hoy Contar guarda cuántas llegaron por categoría y las diferencias se explican al cerrar.
- [ ] Revisar a 375 px y en una pantalla ancha: la lista nueva de envíos, la hoja «Detalle», el riel de dos pasos y la hoja de observaciones.
- [ ] Limpiar `subtitulosDelRiel` (la clave «1» ya no se usa).
- [ ] Borrar los envíos y órdenes de prueba de la base local (nota «PRUEBA Recibir»).
