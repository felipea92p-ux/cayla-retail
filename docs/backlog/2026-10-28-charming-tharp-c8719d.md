# Backlog · La mercadería de CLAURE en el Balance: consignación (2026-10-28, ADR-0558)

## POR PEGAR en producción — ANTES de cerrar octubre (4-nov)
- [ ] `supabase/migrations/20261028212000_balance_mercaderia_de_claure_en_consignacion.sql` (una sola parte, solo funciones y una fila de `cuentas`). **Va DESPUÉS de** `20261027222000` y `20261028153000` (ADR-0542): aborta con un mensaje si faltan. Termina en «QUEDÓ BIEN». Si octubre se cierra antes, el diario de octubre se congela sin las reclasificaciones y la 201 queda desfasada en los Balances siguientes.
- [ ] Después de pegar: refrescar el volcado de producción (`pnpm datos:generar:produccion`: función `fn_asientos_claure`, `fn_dueno_del_movimiento`, cuenta 4699) y abrir Finanzas ▸ Balance para ver la fila «Mercaderías».

## Pendiente (decisión de Felipe y del contador)
- [ ] **El pago a CLAURE (la liquidación).** La 4699 sube con lo vendido y todavía no baja. Hace falta registrar «le pagué S/ X a CLAURE» sin pasar por Gastos (inflaría el total y daría IGV). Sin esto, el día que se le pague, esa plata sale como diferencia en la comprobación de caja o bancos.
- [ ] **¿Quién responde por una prenda de CLAURE que se pierde o se daña en Lima?** Hoy CAYLA (la merma sigue siendo su gasto y se le debe a CLAURE). Si CLAURE asume, se cambia `claure_merma`.
- [ ] **Para el contador:** ¿CLAURE es tercero (46) o relacionada (47)? 4699 es provisional. ¿Cómo se factura la consignación frente a SUNAT (quién factura a quién el costo, crédito fiscal)? Hoy CAYLA vende con su boleta y reconoce el ingreso completo.
- [ ] **Cambio con una prenda de CLAURE:** su ajuste de costo no se reclasifica; la 201 saldría «sin explicar» por ese monto. Solo si se vuelve común.
- [ ] **Pedido web con una prenda de CLAURE:** hasta entregarse, su dueño se lee de la ficha. Sin probar.
- [ ] Medir en producción cuántas unidades y soles de CLAURE cuenta hoy la 201 (la sesión que lo hizo no tenía acceso a `cayla-dynamic`): consultas de solo lectura en la nota de la sesión.
- [ ] Existencias: el valor de inventario a costo debe mostrar a CLAURE aparte y fuera del total de CAYLA (coincide con esta decisión).
