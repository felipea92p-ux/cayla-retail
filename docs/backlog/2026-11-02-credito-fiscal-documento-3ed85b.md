## La renta del año y el costo sin factura (ADR-0598, 2026-11-02)
- [x] `fn_sustento_costos`: lo gastado por proveedor y papel (`20261102055000`), con su prueba (`pnpm pruebas:sustento-costos`).
- [x] Escala de la renta y «lo de antes del sistema» como parámetros (`20261102060000`), con su bloque en Configuración ▸ Impuestos.
- [x] Tarjeta «Renta de 2026» y hoja «A quién pedirle factura» en Finanzas ▸ Impuestos, con su guía.
- [ ] **Pegar en producción** `20261102055000` (una parte) y `20261102060000` (dos partes, comparando antes el md5 de `guardar_parametro_tributario`). Cómo verificas tú: Finanzas ▸ Impuestos muestra la tarjeta «Renta de 2026» sin aviso de error.
- [ ] Cargar en Configuración ▸ Impuestos el saldo a favor de IGV de octubre (S/ 62,035) y lo de enero a septiembre de 2026 que da el contador (utilidad, compras sin factura, renta pagada a cuenta).
- [ ] Subir las facturas de compra de octubre (el IGV de compras del mes salía en S/ 59).
- [ ] Revisar con el contador: si algún proveedor que da boleta NO es del Nuevo RUS, su boleta no resta nada (la tarjeta hoy la cuenta hasta el tope del 6 %).
