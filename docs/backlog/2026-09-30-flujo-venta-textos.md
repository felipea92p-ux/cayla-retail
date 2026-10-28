## 🧾 Venta: textos del caso «boleta sin DNI con Yape» (2026-09-30) — rama `claude/flujo-venta-textos`, solo web, sin migración

- [x] Aviso de serie duplicada (`lib/error-escritura.ts`), píldora + pie del DNI (`PuntoDeVentaTicket`, `ConsultaDocumento`) y explicación de «Pendiente de enviar» (`VentaRegistradaModal`). `tsc`, vitest (21 archivos) y eslint en verde; probado a 1280 px y 375 px.
- [ ] **Sin decidir (Felipe):** ¿la serie de una sede puede repetir la de otra? En el seed local Lima y Trujillo tienen ambas B001 y el primer comprobante de Trujillo choca; en producción hoy son B001/B002/B003.
- [ ] **Sin decidir:** el «desde S/10.00» de tarjeta y la píldora «Apartar N» (nombre y cuenta) — diseño.
- [ ] **Sin decidir:** Yape como medio que no cuenta como cuenta de dinero; y los nombres de los botones de la venta (vocabulario).
- [ ] **Regenerar la guía** de `/flujo-de-negocio` (capturas del ERP) cuando esta rama llegue a `main`: las pantallas de Cobro y «Venta registrada» cambiaron de texto.
