## 2026-10-12 (Lote C: una devolución espera a que SUNAT acepte la boleta; reembolso libre con aviso; plazo de cambio en la base — ADR-0390)
Qué hice: con las dos reglas que eligió Felipe. (6) `aprobar_devolucion` se niega mientras la boleta o factura de la venta no esté
aceptada por SUNAT (pendiente, en cola, enviada o rechazada), y Devoluciones lo dice desde la tarjeta y en el panel, con «Aprobar» apagado.
(7) El medio del reembolso es libre: la pantalla propone el medio con que se pagó y avisa si se elige otro. Y el plazo de cambio de 15 días
pasa a la base (`registrar_cambio`), igual que la pantalla.
Por qué así: sin una boleta aceptada no sale la nota de crédito, y la boleta llegaría después por el total, con IGV de una venta devuelta.
Diferir la nota era una cola más que vigilar.
Felipe se lleva: dos migraciones (`20261012221000`, `20261012222000`) esperan su OK para pegarse. Pendiente: Cambios todavía no propone el
medio original en una diferencia negativa.
