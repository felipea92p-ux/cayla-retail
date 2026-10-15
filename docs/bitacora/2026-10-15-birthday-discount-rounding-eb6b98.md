## 2026-10-15 (el 10 % de cumpleaños también deja el precio sin céntimos — ADR-0403 act. 2026-10-15)
Qué hice: el cumpleaños del club ahora usa la misma regla que el descuento en %: sobre lo que la prenda ya cobraba, el precio que queda
baja al S/ 0.10 de abajo. Una blusa de S/ 59.90 pasa de S/ 53.91 a S/ 53.90 (el club pone 6.00, no 5.99). En la caja, `descuentoClubLinea`
llama a `descuentoUnitarioPorPorcentaje`; en la base, `registrar_venta` lo verifica con `fn_descuento_campana` (migración 20261015182000) y,
por un tiempo, también acepta la cuenta vieja.
Por qué así: Felipe lo vio en la caja: un descuento en % ya no dejaba céntimos y el cumpleaños sí. Una sola cuenta del % en todo el ERP
evita que vuelva a pasar. La cuenta vieja se acepta porque Vender nunca se recarga sola: una caja abierta desde antes de publicar seguiría
mandando 5.99 y, sin eso, la base le rechazaría cada canje hasta que alguien apriete F5.
Felipe se lleva: el canje de cumpleaños sin céntimos sueltos en cada prenda, también con campaña (la cascada sigue en 28 %). La migración ya está
pegada en producción (antes que la web, con ensayo previo); la caja muestra el redondeo cuando se publique este PR.
