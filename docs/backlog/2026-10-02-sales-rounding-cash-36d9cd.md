## 🗂️ Redondeo del efectivo (2026-10-02) — investigado, **sin construir y sin aprobar**; rama `claude/sales-rounding-cash-36d9cd`

Investigación y diseño: `docs/investigacion/2026-10-02-redondeo-del-efectivo.md`. Regla: S/ 0.10, solo efectivo, solo hacia abajo, una vez sobre el total a pagar en efectivo (100.02 → 100.00, 100.12 → 100.10, 100.19 → 100.10). ADR-0310 y las migraciones `20261003100000`–`20261003190000` están **propuestos en el documento, no reservados** en ningún otro lado: volver a barrer ramas antes de usarlos.

**Esperando decisión de Felipe**
- [ ] Aprobar el diseño (fila `metodo='redondeo'` en `venta_pagos`) y la lista de actividades de abajo.
- [ ] Contador: ¿qué cuenta recibe el redondeo (provisional; 6599 es faltantes y 659 es mermas) y cómo trata el IGV de un comprobante exacto?
- [ ] ¿Se autoriza el spike en el sandbox de Lucode para declarar el redondeo en el XML (sin emisión real)?
- [ ] Cambios y devoluciones: dirección del redondeo cuando CAYLA entrega efectivo (la ley no lo cubre; se recomienda hacia arriba) y tope del reembolso (lo pagado de verdad en efectivo).
- [ ] Coordinación: esperar #722 (Caja) y #719 («cliente»/«miembro»); decidir quién porta la rama local `top-30-pendientes-erp` (comparte `ParamsRegistrarVenta`).

**Actividades (cortes verticales; orden de construcción = orden de la lista)**
- [ ] Paso 0, terreno: llevar la rama a `origin/main` (estaba 21 commits atrás, sin `HojaDeCobro.tsx`), fila en `SESIONES-ACTIVAS`, Postgres desechable con las migraciones de main (la base local compartida tiene 365 y `registrar_venta` de 16 parámetros), sonda de huellas md5 de las funciones a parchar (`registrar_venta` vivo: `525479a95e59063b5f9e86f63119e27e`).
- [ ] 1. Regla única `redondeoEfectivo` / `retail.fn_redondeo_efectivo`, con paridad TS/SQL sobre los 99 999 montos de 0.01 a 999.99, y el ADR.
- [ ] 2. Los lectores entienden «redondeo»: CHECK de medios (rehecho desde la definición viva, sin soltar `qr` ni `anticipo`), `fn_resumen_caja`, `fn_totales_historial_ventas`, `fn_ventas_del_dia`, `fn_cuenta_sellada`, y una prueba que lista toda función que lee `venta_pagos`.
- [ ] 3. Diario y estado de resultados: `fn_asiento_cuenta_de_medio` manda `redondeo` a una cuenta de gasto propia (hoy un medio desconocido cae en la 104, banco).
- [ ] 4. Papel y reimpresión: el recibo dice el redondeo; la boleta y el QR siguen exactos.
- [ ] 5. Vender cobra en efectivo redondeado de punta a punta: RPC (`registrar_venta`, parche por ancla con candado md5), hoja de cobro, cola sin conexión (acepta el contrato viejo), bandera `fn_acepta_redondeo_efectivo`; probado a 375 px y con la red cortada.
- [ ] 6. Apartados: el saldo en efectivo al entregar (`entregar_separacion`); abonos y adelanto no se redondean.
- [ ] 7. Cambios y devoluciones en efectivo (depende de las respuestas de arriba).
- [ ] 8. Condicional: declarar el redondeo en el comprobante SUNAT, solo spike en el sandbox de Lucode.

**Pendientes que salieron de la investigación (fuera de esta lista)**
- [ ] El cierre de AQP del 1-oct «cuadró» con 603.44 tecleando la cifra del sistema (desde ADR-0186 el esperado se ve antes de contar) y 303.44 pasaron a la caja fuerte. El redondeo no arregla ese hábito: decidir si el cierre vuelve a ser ciego.
- [ ] `main` tiene dos ADR-0307 (`0307-cobro-en-hoja-lateral.md` y `0307-pestanas-siguen-la-cuenta-del-navegador.md`) y su CI falla en «Números de ADR»; hay una tarea aparte para renumerar uno.
- [ ] Un comentario engañoso: `PuntoDeVentaTicket.tsx` dice que `recibido` nunca viaja a la venta, pero sí viaja y se guarda desde `20260919210000`.
- [ ] 77 de 84 líneas vendidas en producción son «Prenda sin registrar» con precio tecleado a mano: de ahí salen céntimos como 62.15 y 309.59, no de los descuentos.
