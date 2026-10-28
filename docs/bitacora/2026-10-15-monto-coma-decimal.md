## 2026-10-15 (El campo de plata entiende la coma decimal — ADR-0419)
Qué hice: `CampoMonto`, el campo de plata de 20 pantallas (el cobro de Vender, abonar y entregar apartados, Producción, Compras…), ahora entiende «2,5» como S/ 2.50; antes el navegador borraba la coma y se guardaba S/ 25. Lo que no se entiende («12.500», «abc») queda en rojo y no deja guardar.
Por qué así: usa la misma regla que Felipe eligió el 14-oct para las hojas del fondo (`leerMontoPlata`), en vez de una regla nueva; y al salir del campo muestra el número que entendió, para que se vea antes de cobrar.
Felipe se lleva: quedan 25 campos `type="number"` propios (varios de plata: los pagos de la venta, la caja, devoluciones, proformas, compras) y el lector de Caja que borra la coma; están listados en el ADR.

## 2026-10-15 (Todos los campos de plata y el arqueo de Caja leen la coma — ADR-0419 act. b)
Qué hice: los 11 campos de plata que aún borraban la coma (pagos de la venta, «Otro monto recibido» y el descuento en soles del cobro, monto a devolver, ingreso/egreso de Caja, costos de Llegó mercadería, Recibir envío y Compras, precio de maquila, precio y costo de la ficha) y el lector del arqueo de Caja, que leía «1299,50» como 129 950, usan la misma regla. Probado en la tienda local: un cobro con descuento «5,5» y recibido «100,5» guardó 74.40 y 100.50; un retiro «12,5» guardó 12.50.
Por qué así: Felipe dijo «Caja entra»; una sola regla para toda la plata escrita, con su prueba en cada lugar donde se leía con `Number(…)`. Lo que no se entiende frena en vez de adivinar.
Felipe se lleva: «10.005» en el arqueo ya no se redondea a 10.01, se pide de nuevo. Quedan los porcentajes con coma y unificar los demás lectores de `lib/`.
