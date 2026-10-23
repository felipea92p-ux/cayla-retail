## 🛒 Compras simple (ADR-0480) — rama `claude/modulo-compras-66e94a`

- [ ] **Ninguna migración pegada en producción.** Van en orden, ANTES de fusionar el PR #1274 (el check «SQL pegado» lo exige) y con el OK de Felipe: `20261022225000`, `20261022235000`, `20261023005000`, `20261023114000`, `20261023121000`, `20261023143000`.
- [x] **Revisar los gastos que anotaron las compradoras** (segunda parte de la actividad 7): pasan a los gastos del viaje desde «Revisar compras».
- [ ] **Una comida, envío, bolsas u otro sin papel no pasa** (solo taxi y cargador van en la planilla de movilidad, decisión 55 de ADR-0362): queda «por revisar». Falta decidir qué hace Compras con ese gasto (pedir el papel, o que CAYLA no lo reconozca y la compradora lo devuelva).
- [ ] **La foto de un gasto revisado no pasa al gasto del viaje** (las fotos de un gasto del viaje viven en la carpeta del gasto): queda en el gasto de la compradora. Si Finanzas la necesita, copiarla al revisar.
- [ ] **Corregir un cierre del día recibido con otro monto o en otra cuenta:** hoy no se puede (su plata no se anula aparte, para que el cierre no quede recibido sin plata). Si hace falta, una acción que anule la plata y reabra el cierre a la vez.
- [ ] **Anular la entrega de una plata ya confirmada** (actividad 2) deja la plata anotada «confirmada» con el fondo más bajo. Revisar si se bloquea como la del cierre o si reabre la confirmación.
- [ ] **El pago del papel sale del fondo «en efectivo»** [provisional]: el papel no guarda cómo se pagó. Si importa para los reportes, se agrega la pregunta al anotar la compra.
- [ ] **Un comprobante completado con «manda el papel» y su costo ajustado** deja una diferencia de unos soles entre el costo con que entró la prenda y el de la factura; el Balance la muestra como «subtotal distinto» o redondeo. Decidido por Felipe (2026-10-23): el catálogo queda con lo anotado.
- [ ] **Corregir la serie o el número de un comprobante completado:** no hay cómo (no se anula porque tiene su pago). Si pasa, se decide con Felipe.
- [ ] **Retirar las pantallas viejas de Órdenes de compra** (siguen en el código sin entrada en el menú).
- [x] **/formidable: los 3 cambios hechos con el OK de Felipe (2026-10-23)** (`docs/formidable/compras-simple.md`). Falta repetir la prueba ciega, la de Revisar compras y la pasada con una compradora real.
- [ ] **Refrescar el diccionario** (`pnpm datos:generar:produccion`) cuando las migraciones estén en producción.
- [ ] **La guía de «Recibir un envío» no se recorrió en el navegador:** el recorredor busca sus ejemplos en la base local compartida, que no tiene envíos.
