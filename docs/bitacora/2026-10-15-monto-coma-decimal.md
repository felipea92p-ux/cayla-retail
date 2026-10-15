## 2026-10-15 (El campo de plata entiende la coma decimal — ADR-0419)
Qué hice: `CampoMonto`, el campo de plata de 20 pantallas (el cobro de Vender, abonar y entregar apartados, Producción, Compras…), ahora entiende «2,5» como S/ 2.50; antes el navegador borraba la coma y se guardaba S/ 25. Lo que no se entiende («12.500», «abc») queda en rojo y no deja guardar.
Por qué así: usa la misma regla que Felipe eligió el 14-oct para las hojas del fondo (`leerMontoPlata`), en vez de una regla nueva; y al salir del campo muestra el número que entendió, para que se vea antes de cobrar.
Felipe se lleva: quedan 25 campos `type="number"` propios (varios de plata: los pagos de la venta, la caja, devoluciones, proformas, compras) y el lector de Caja que borra la coma; están listados en el ADR.
