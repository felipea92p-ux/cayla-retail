## 💵 El campo de plata entiende la coma decimal (2026-10-15, ADR-0419) — solo web, sin migración; rama `claude/monto-coma-decimal`

- [x] `CampoMonto` lee con `leerMontoPlata` (`lecturaCampoMonto`, 4 pruebas nuevas): «2,5» → 2.50, «1.299,50» y «1,299.50» → 1299.50; «12.500», «abc» y «1e3» en rojo y 0 al formulario.
- [x] Verificado con el campo real en Chrome (inglés, español de Perú y 375 px, teclado decimal). Vitest completo, tipos, lint y Knip en verde.
- [ ] Los 25 `<input type="number">` propios (varios de plata: `LineasPago`, `MovimientoCajaModal`, `HojaDeCobro`, `DevolucionesFlujo`, `CambioReemplazo`, `NuevaProformaModal`, `CompraFormV2`, `ProductoForm`).
- [ ] Unificar los ocho lectores de montos de `lib/`; el de Caja borra la coma y espera la decisión de Felipe (2026-10-14).
- [ ] `/chaos` de un cobro real de Vender con el campo nuevo (doble medio de pago, vuelto) en una base al día.
