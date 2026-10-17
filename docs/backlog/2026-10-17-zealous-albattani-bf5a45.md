## 🧾 La reversa de un cobro sale por su cuenta, nunca por la 451 (2026-10-17, ADR-0120 act.) — solo prueba y docs, sin migración; rama `claude/zealous-albattani-bf5a45`

- [x] Verificado en producción (solo lectura, 2026-10-17): `fn_asientos` viva llama a las cuatro reversas (anulación, devolución,
      diferencia de un cambio, adelanto devuelto) con `'entra'`, ninguna con `'sale'`; el parche de F7 (`20260925170000`) sigue vivo
      y ninguna migración posterior recreó la función entera. 0 anulaciones, devoluciones ni cambios con tarjeta en producción: nada
      que corregir.
- [x] Convenio escrito en el ADR-0120 («Actualización 2026-10-17»): `'entra'` = cobro y su reversa (la plata vuelve por donde entró;
      tarjeta → 105); `'sale'` = solo lo que CAYLA paga con un medio propio (tarjeta de crédito → 451).
- [x] `scripts/pruebas/reversa_de_cobro_por_su_cuenta.mjs` (`pnpm pruebas:reversa-de-cobro`, en `PRUEBAS` de las tandas): 28
      verificaciones con ROLLBACK, por cada medio, más el contraste del gasto con tarjeta de CAYLA y una autoprueba que vuelve
      `fn_asientos` a su versión original y exige que la prueba se ponga roja. Corrida en un Postgres desechable con las 724
      migraciones y el seed (28/28), también con el parche `qr → 105` de ADR-0429 puesto (28/28): conviven en cualquier orden.
- [ ] **Una línea para el PR #1138 (ADR-0429), que ya parcha `fn_asiento_cuenta_de_medio`:** `comment on function` con el convenio
      nuevo; el texto que guarda la base hoy («'sale' (pagos, reembolsos a la clienta)») es de antes de F7 y fue lo que confundió.
- [ ] **Para la rama de las máquinas de cobro (PR #1138), visto de paso:** su migración `20261016190000` acepta que una devolución
      con tarjeta sobre un día YA depositado «aparece como saldo en la puente hasta el próximo depósito». No se absorbe sola: el
      siguiente depósito llega neto de esa devolución, el lote solo suma los días nuevos, y `comisión = bruto − neto` se infla por
      el monto devuelto (gasto 639 de más) mientras la puente conserva ese negativo para siempre. Hace falta que el día ya cruzado
      vuelva a quedar pendiente por su diferencia (una línea negativa que el próximo lote pueda marcar). Hoy 0 casos en producción.
