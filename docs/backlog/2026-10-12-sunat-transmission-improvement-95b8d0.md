## Comprobantes: lo que SUNAT aceptó no retrocede (2026-10-12, ADR-0382)
- [x] **Una respuesta vieja de Lucode no pisa un aceptado ni un anulado** (`actualizar_transmision_comprobante` con `for update`) y el disparador `comprobantes_estado_no_retrocede` deja solo los pasos que existen. `20261012180000`.
- [x] **Anular una venta no libera la boleta que ya intentó salir a SUNAT** (opción A de Felipe). `20261012180100`.
- [ ] **Pegar en producción, en orden, con el OK puntual de Felipe**: primero `20261012180000`, después `20261012180100` (cada una se detiene sola si la función viva no es la revisada). Después, la consulta de control del ADR debe seguir dando 0.
- [ ] **Al pegar: refrescar el volcado y el diccionario** (`docs/datos/generado/COMO-REFRESCAR.md`, `pnpm datos:generar:produccion`): nace un disparador y su función.
- [ ] **Ver el mensaje de «Anular venta» en la pantalla** (Devoluciones, también a 375 px): no se miró en el navegador porque las migraciones no se aplicaron a la base local compartida. La pantalla muestra el mensaje de la base tal cual (`traducirError`, P0001).
- [ ] **Hoy «Anular venta» se ofrece aunque la base lo vaya a negar** (también con una boleta aceptada, desde antes): la tarjeta podría decir de entrada por qué no se puede. Mejora de pantalla, no de datos.
