## 2026-09-30 (Club de clientas, tanda 1c: el 10 % de cumpleaños, un canje por año)

Qué hice: tres migraciones sin pegar, `20260930230000` (parte 1: `venta_items.descuento_club_unitario`), `230100`
(parte 2: el % en `configuracion_empresa`, 10.00 por defecto) y `230200` (parte 3: `club_canjes`, `registrar_venta` con
`p_canjear_cumpleanos`, `resumen_clienta_caja` con el estado del cumpleaños y la fecha del canje, y un disparador que
libera el canje al anular). En Cobrar, la tarjeta de la socia ofrece «Canjear 10 %» solo en su mes, y el pie del ticket
muestra UNA línea «Cumpleaños del club · 10 % de la compra», como el spike. La base lo reparte por prenda para que cada
línea quede con su precio real en el comprobante, pero eso no se ve en pantalla. El ticket impreso dice que incluye el 10 %.

Por qué así: un canje por año lo hace cumplir la base (ficha bloqueada con `for no key update` en la misma lectura, y un
canje vivo por clienta y año), no la pantalla; dos cajas a la vez no pueden canjearlo dos veces. Sin conexión no se
ofrece: otra tienda podría canjearlo a la vez. Anular lo libera; devolver no. Cada tabla se altera en su propia parte
porque una venta lee `configuracion_empresa` y escribe `venta_items`: juntas, la migración y una venta a medio camino se
esperaban en cruz (deadlock).

Felipe se lleva: pegar las tres partes en orden, cada una sola, DESPUÉS de las dos de la 1b, y fusionar al final. Probado a
375 px contra una copia aislada de la base: canjear → la línea del pie → cobrar → «Cumpleaños canjeado el 30 sep».
Capturas en `docs/capturas/2026-09-30-club-paso1c/`.
