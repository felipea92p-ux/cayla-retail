## 📦 Recibir ▸ Cerrar: «Otro», regalo a S/ 0 y tabla menos ruidosa — rama `claude/shipments-date-filters-497b4b`

- [x] Mensajes de «Cerrar»: queda solo el de lo que pasa al cerrar.
- [x] La categoría de fuera de la guía se contrae; «Falta el costo» y la guía la reabre.
- [x] Una sola caja de costo cuando una prenda cubre toda la línea.
- [x] «Otro» en «¿Qué pasó?» (solo lo de más) con su explicación obligatoria.
- [x] Regalo de fuera de la guía entra a S/ 0 sin pedir costo ni confirmarlo como atípico.
- [ ] **Pegar `20261028182000_recepcion_otro_y_regalo_sin_costo.sql` en producción** (una parte; con el OK de Felipe) y verificar el md5 de `cerrar_conteo_envio` y `fn_recepcion_entrar`. **No está en producción.**
- [ ] Decidir qué significa «precio de venta opcional» para una prenda creada completa al contar (hoy el catálogo exige precio: ADR-0384).
- [ ] ¿«Otro» también para los faltantes? Hoy no: decidir si «otro» debe o no deuda al proveedor.
- [ ] Cerrar de verdad un envío con un regalo y otro con «Otro» desde la pantalla (esta sesión lo probó por Postgres y en la pantalla hasta antes del botón de cerrar; el navegador quedó oculto).
