## 🗂️ Redondeo del efectivo (2026-10-02) — investigado, **sin construir y sin aprobar**; rama `claude/sales-rounding-cash-36d9cd`

Investigación y diseño: `docs/investigacion/2026-10-02-redondeo-del-efectivo.md`. Regla: S/ 0.10, solo efectivo, solo hacia abajo, una vez sobre el total a pagar en efectivo (100.02 → 100.00, 100.12 → 100.10, 100.19 → 100.10). ADR-0310 y las migraciones `20261003100000`–`20261003190000` están **propuestos en el documento, no reservados** en ningún otro lado: volver a barrer ramas antes de usarlos.

**Decisiones** (Felipe aprobó el diseño y la lista el 2026-10-02 con «hazlo»; lo demás sigue las recomendaciones del ADR-0310 §7 y es provisional)
- [x] Diseño (fila `metodo='redondeo'` en `venta_pagos`) y lista de actividades: aprobados.
- [ ] Contador: ¿qué cuenta recibe el redondeo (provisional, propia y de gasto; 6599 es faltantes y 659 es mermas) y cómo trata el IGV de un comprobante exacto? Hasta que conteste, la cuenta es provisional.
- [ ] ¿Se autoriza el spike en el sandbox de Lucode para declarar el redondeo en el XML (sin emisión real)? Sin su OK explícito no se hace (actividad 8).
- [ ] Confirmar con un abogado: la regla «solo hacia abajo» (lectura de textos oficiales) y, en cambios y devoluciones, que se redondee hacia ARRIBA a favor del cliente cuando CAYLA entrega efectivo (ninguna norma lo trata). Provisional.
- [ ] Coordinación: #719 ya está en `main`; esperar #722 (Caja) antes de la actividad 2 si sigue abierto; decidir quién porta la rama local `top-30-pendientes-erp` (comparte `ParamsRegistrarVenta`).

**Actividades (cortes verticales; orden de construcción = orden de la lista)**
- [x] Paso 0, terreno (hecho 2026-10-02: rama al día con `main`, base desechable con 410 migraciones, fila en `SESIONES-ACTIVAS`; las huellas de producción se sondean al empezar cada parche): llevar la rama a `origin/main` (estaba 21 commits atrás, sin `HojaDeCobro.tsx`), fila en `SESIONES-ACTIVAS`, Postgres desechable con las migraciones de main (la base local compartida tiene 365 y `registrar_venta` de 16 parámetros), sonda de huellas md5 de las funciones a parchar (`registrar_venta` vivo: `525479a95e59063b5f9e86f63119e27e`).
- [x] 1. Regla en la base `retail.fn_redondeo_efectivo` (hecha 2026-10-02, ADR-0310 escrito), verificada en los 99 999 montos de 0.01 a 999.99. **Pendiente para la actividad 5:** su gemela TS `redondeoDelEfectivo` y la paridad caja ↔ base (el repo no admite una regla sin pantalla que la use; copia lista en el scratchpad de la sesión).
- [x] 2. Los lectores entienden «redondeo» (hecha 2026-10-02; **migraciones `20261003110000` y `20261003111000` SIN PEGAR en producción**, ver ADR-0310 §8): CHECK de medios sobre la lista viva, `fn_resumen_caja`, `fn_ventas_del_dia`, `fn_cuenta_sellada`, Caja e Historial en la web, y la auditoría de toda función que lee `venta_pagos`. `fn_totales_historial_ventas` no se parchó a propósito (el redondeo es una fila de «cómo se pagó»).
- [x] 3. Diario y estado de resultados (hecha 2026-10-02; **migración `20261003120000` SIN PEGAR en producción**): `fn_asiento_cuenta_de_medio` manda `redondeo` a la cuenta de gasto **6598** (provisional hasta el contador); `fn_asientos` no se tocó. Pendiente del contador: código y nombre de la cuenta, y el tratamiento del IGV de un comprobante exacto.
- [x] 4. Papel y reimpresión (hecha 2026-10-02; solo web, sin migración): ticket de 80 mm, boleta A4, modal «Venta registrada» y detalle del Historial. Verificado en el navegador con datos reales el ticket y la A4; **falta ver los dos modales y todo a 375 px** (PL-105) en el PR final.
- [x] 5. Vender cobra en efectivo redondeado de punta a punta (hecha 2026-10-02; **migraciones `20261003130000` y `20261003140000` SIN PEGAR en producción**): `registrar_venta` verifica el redondeo, hoja de cobro, cola sin conexión, bandera; probado en la pantalla real, a 375 px y con la red cortada. **Orden de pegado y cómo apagarlo: ADR-0310 §8.** Tras pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] 6. Apartados: el saldo en efectivo al entregar (`entregar_separacion`); abonos y adelanto no se redondean.
- [ ] 7. Cambios y devoluciones en efectivo (depende de las respuestas de arriba).
- [ ] 8. Condicional: declarar el redondeo en el comprobante SUNAT, solo spike en el sandbox de Lucode.

**Pendientes que salieron de la investigación (fuera de esta lista)**
- [ ] El cierre de AQP del 1-oct «cuadró» con 603.44 tecleando la cifra del sistema (desde ADR-0186 el esperado se ve antes de contar) y 303.44 pasaron a la caja fuerte. El redondeo no arregla ese hábito: decidir si el cierre vuelve a ser ciego.
- [ ] `main` tiene dos ADR-0307 (`0307-cobro-en-hoja-lateral.md` y `0307-pestanas-siguen-la-cuenta-del-navegador.md`) y su CI falla en «Números de ADR»; hay una tarea aparte para renumerar uno.
- [ ] Un comentario engañoso: `PuntoDeVentaTicket.tsx` dice que `recibido` nunca viaja a la venta, pero sí viaja y se guarda desde `20260919210000`.
- [ ] 77 de 84 líneas vendidas en producción son «Prenda sin registrar» con precio tecleado a mano: de ahí salen céntimos como 62.15 y 309.59, no de los descuentos.
