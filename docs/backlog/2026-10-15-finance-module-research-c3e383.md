## 💰 Finanzas, Fase 1: que el número diga la verdad (2026-10-15, ADR-0417) — reglas aprobadas, sin código; rama `claude/finance-module-research-c3e383`

- [x] Investigación «Finanzas que se entienden» (artefacto privado, fuera del repo porque lleva cifras de producción).
- [x] Felipe aprobó las tres reglas de ADR-0417.
- [ ] **Fase 0, de Felipe, sin código:** reunión con el contador. Lo primero: quién presenta el SIRE y quién lleva el Diario y el Mayor de 2026, porque en 2025 se pasaron las ~324 UIT. Cargar alquileres y servicios como gastos fijos. Saldos al 30-sep (BCP, Interbank, proveedores). Depositar o registrar el efectivo de las cajas fuertes.
- [x] Costo estimado y sellado para la venta sin prenda (`20261015233000`, 20 casos). **SIN PEGAR** en producción: rellena las 755 líneas al pegar.
- [ ] Medir cuántos costos están con IGV y cuántos sin IGV. Ensayar la corrección (con OK de Felipe) y que una regla pura convierta en todas las pantallas.
- [ ] Cuentas Interbank y «Por depositar Izipay/Vendemás»; elegir la máquina al cobrar; cruzar el depósito y sacar de ahí la comisión real; rehacer los cobros con tarjeta y QR desde el corte.
- [ ] La planilla de la oficina va a «empresa» y la del Taller a su sede.
- [x] Medidor de confianza (`20261015235000`, `lib/finanzas-confianza.ts`, 20 + 11 casos). **SIN PEGAR.**
- [x] Pago de planilla y pago a SUNAT como movimientos de dinero (`20261016002000`, 14 casos). **SIN PEGAR.**
- [x] Las seis pantallas en camino A: Resumen (El Pulso), Cuentas y dinero, Impuestos, Gastos, Reportes y Cierre; cada una con su `lib/*-pulso-reglas.ts` probado, su guía y su huella al día; verificadas en el navegador contra una pila local al día con `main` (claro, oscuro, 375 px, sin errores de consola).
- [ ] **Pegar en producción, en orden:** `20261015233000`, `20261015235000`, `20261016002000` (las tres idempotentes; la tercera usa reemplazos anclados y aborta sola si el texto vivo cambió). Hasta entonces la web del PR pediría funciones que producción no tiene: **no fusionar antes de pegar** (lección del PR #444).
- [ ] `/formidable`, `/chaos` (Cuentas y dinero registra los dos pagos nuevos) y `pnpm --filter web guias:recorrer` sobre las seis pantallas: no corrieron en esta sesión (sin panel visible y sin Felipe para el OK de los 3 cambios).
- [ ] Medir en producción cuántos costos están con IGV y cuántos sin (decisión 2) y ensayar la corrección con el OK de Felipe.
- [ ] **Abierto (negocio):** Trujillo −33 % contra 2025 desde junio, antes del ERP; Felipe lo revisa con la tienda.
