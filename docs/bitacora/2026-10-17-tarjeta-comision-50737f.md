## 2026-10-17 (Tarifas reales de Izipay y de Vendemás a partir de sus reportes — ADR-0429, actualización (c))
Qué hice: Felipe preguntó por qué el QR de Izipay cobraba 0 y luego comisión, y cómo poner los porcentajes. Leí fila por fila los reportes de
abono de Izipay de agosto, septiembre y octubre (tres códigos de comercio; dos archivos eran copias de otros), el estado de cuenta de Vendemás de
septiembre y los crucé con `pos_tarifas` y las ventas de producción (solo lectura). Izipay: el QR sale SIN comisión los primeros ~10 días de cada
mes (agosto hasta el 10, septiembre hasta el 10, octubre hasta el 9: tres meses seguidos) y paga 2.38 % + IGV el resto, igual que la tarjeta, que
nunca fue gratis; no es un tope de monto ni de cantidad; deposita el mismo día. Vendemás: 2.30 % la mayoría, 4.0 % en una minoría de Visa y
Mastercard, 4.45 % American Express; promedio 2.41 %. Un detalle de depósito de Vendemás de 2022 vino mezclado y no sirve. Escribí
`20261017174000_tarifas_reales_de_izipay.sql` (QR con la historia observada, tarjeta desde siempre; PEGADA en producción el 2026-10-17 a las 17:49
Lima, tras un ensayo con rollback que coincidió), ajusté `pos_maquinas.mjs` (sección 8) y el ADR-0429. Corregí mi primera lectura («una promoción que
terminó el 10 de octubre»): con septiembre y agosto a la vista era un ciclo mensual.
Por qué así: la tarifa solo guarda «desde hoy» por pantalla y la historia no se podía corregir desde ahí; una migración con fechas la cubre sin
editar nada (una tarifa no se edita ni se borra). No se siembra noviembre: sería adivinar un contrato que Izipay no ha confirmado. La tarifa solo
estima: la comisión real sigue saliendo del depósito.
Qué se rompería sin esto: todo lo pendiente de QR de Izipay estimaría 0 de comisión, también el 30 de septiembre y desde el 10 de octubre
(2.81 % con IGV de diferencia), y la tarjeta de Izipay no tendría tarifa. Verificado: ensayo con rollback en producción que coincidió, 5 filas y las
estimaciones esperadas con lecturas después, y `pnpm pruebas:pos-maquinas` en verde (79 casos) sobre una base armada solo con las migraciones del
repo (la base local compartida va atrás y otra sesión dejó una función con otro cuerpo). No quedó en `schema_migrations` (se pegó por SQL).
Hallazgos aparte (no son un arreglo): el QR de Izipay se registró como Yape del 30 de septiembre al 8 de octubre y sigue faltando QR cada día
después; va al BCP y no a «Por depositar Izipay». Tienda LIM no tiene ventas en el ERP aunque su código de Izipay recibe pagos.
Pendiente de Felipe: preguntarle a Izipay qué es la ventana gratis del QR, los reportes de Vendemás de 2026 y decidir cómo se registran los QR
en las tiendas. Los montos, los códigos de comercio y la cifra de cualquier reclamo no se escriben aquí (el repo es público).
