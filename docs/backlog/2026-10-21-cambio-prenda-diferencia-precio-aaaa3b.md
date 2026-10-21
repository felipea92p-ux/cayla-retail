## Cambios: una prenda por varias y QR (ADR-0470, 2026-10-21)

- [ ] **Pegar en producción las 7 migraciones** (con el OK de Felipe, por partes y en el orden del ADR-0470; la política `20261021191000` SOLA y al final). Verificar el `md5(prosrc)` de cada función tocada y `fn_acepta_qr_en_cambios() = true`. Hasta entonces la web nueva cae al camino de una prenda y sin QR.
- [ ] **Refrescar el diccionario** (`pnpm datos:generar:produccion`) cuando se refresque el volcado: tabla nueva `cambio_salidas`.
- [ ] **Boleta y nota de crédito de un cambio** (decisión de Felipe/contador, SUNAT): hoy un cambio no emite comprobante y esta entrega tampoco. En B005-000670 las dos boletas suman S/ 10 de más sin nota de crédito.
- [ ] **El candado de líder para un cambio que devuelve plata se quitó el 2026-09-23** (`20260923110500`): hoy cualquier colaboradora lo registra. Revisar si es lo que Felipe quiere (dinero: decide él).
- [ ] **Guía de foco de `/cambios`** sigue `PENDIENTE` (`lib/guia-de-foco-pantallas.ts`): el paso «Reemplazo» ganó campos (las prendas extra); correr `/focus` sobre la pantalla.
- [ ] **Correr `/chaos` y `/formidable` sobre Cambios** (la parte de la base está cubierta: todo o nada, doble clic, token, permisos; falta el catálogo completo en el navegador).
- [ ] **Recorrer la guía interactiva de Cambios** con `guias:recorrer` (necesita instalar el navegador de Playwright; el paso nuevo «Se lleva más de una prenda» es opcional y solo sale con la primera prenda elegida).
- [ ] **El escáner del paso «Reemplazo»** (pistola y cámara) elige solo la primera prenda: una prenda extra se elige a mano. Si se escanea mucho, agregarla a la siguiente extra vacía.
- [ ] **`tallasQueNoCalzan` y `fn_movimientos`** miran solo la primera prenda de un cambio por varias (ADR-0470, «Lo que se rompe»): revisar si hace falta.
- [ ] **Movimiento de S/ 10 sin responsable:** el ajuste de Izipay/Interbank se escribió por SQL sin persona (sin la firma de «Responsable»); revisar en Cuentas y dinero si conviene reescribirlo con quien corresponda.
- [ ] **Reportes por método de pago de B005-000670** siguen con QR 117.70 y transferencia −10 (salen de la venta y del cambio, que no se tocaron).
- [ ] **Datos de prueba en la base local compartida:** 2 ventas, 1 cambio por varias y 3 entradas de stock de la prenda «Blusa Emma / Polo Lucía» de Tienda Lima (motivo «prueba de pantalla ADR-0470»); las migraciones 183000–193000 ya están aplicadas ahí.
