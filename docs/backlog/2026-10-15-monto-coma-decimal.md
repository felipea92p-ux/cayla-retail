## 💵 El campo de plata entiende la coma decimal (2026-10-15, ADR-0419) — solo web, sin migración; rama `claude/monto-coma-decimal`

- [x] `CampoMonto` lee con `leerMontoPlata` (`lecturaCampoMonto`, 4 pruebas nuevas): «2,5» → 2.50, «1.299,50» y «1,299.50» → 1299.50; «12.500», «abc» y «1e3» en rojo y 0 al formulario.
- [x] Verificado con el campo real en Chrome (inglés, español de Perú y 375 px, teclado decimal). Vitest completo, tipos, lint y Knip en verde.
- [x] Los 11 campos de plata que eran `type="number"` propios, con la misma regla (ADR-0419 act. b); los que quedan son cantidades, %, días o copias.
- [x] Caja entra (Felipe 2026-10-15): el arqueo, la apertura y el ingreso/egreso leen la coma; «10.005» ya no se redondea.
- [ ] Porcentajes con coma («12,5 %») y unificar los demás lectores de montos de `lib/`.
- [ ] `/chaos` de un cobro real de Vender con el campo nuevo (doble medio de pago, vuelto) en una base al día.
