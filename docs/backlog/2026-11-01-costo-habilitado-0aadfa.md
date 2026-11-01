## 2026-11-01 — El costo de un paso del Taller (rama `claude/costo-habilitado-0aadfa`)

**Estado:** construido y probado en local; **sin commit/PR ni pegar en producción** al escribir esto. ADR-0597.

- [x] Migración `20261101033000`: CHECK más ancho, `fn_fases_de_orden` y `fn_orden_produccion` (reemplazos anclados), `fn_costo_servicios_orden`, `poner_costo_a_fase`.
- [x] `pnpm pruebas:produccion-costo-del-paso` (23 casos, con mutación y camino de vuelta) y en la lista del CI; `produccion_ploteo.mjs` aprende el inverso de esta migración.
- [x] Web: `CostoDelPasoModal`, «Poner costo» en `RutaViva`, cuadro «Costo» con el paso del Taller, guía de foco, pasos de la guía interactiva (huella aceptada) y escenario del auditor de tema.
- [ ] Pegar `20261101033000` en producción (OK de Felipe; después, «Poner costo» a Habilitado de OP-000004).
- [ ] Decidir con Felipe si el sueldo de quien habilita (si está en planilla) se costea aquí o por planilla: poner los dos lo cuenta doble.
- [ ] Costo desde la apertura de la orden / por defecto por modelo o proceso (hoy se escribe después de abrir).
- [ ] `/chaos` sobre «Poner costo» (doble clic, dos pestañas): la base bloquea la orden, pero no se atacó a propósito.
