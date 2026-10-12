## 2026-10-12 (Comprobantes: lo que SUNAT aceptó no retrocede, y anular no libera lo que pudo llegar — ADR-0382)
Qué hice: la base ya no deja que una respuesta vieja de Lucode deje en «rechazado» o «en trámite» una boleta que SUNAT aceptó: la segunda
respuesta espera a la primera y, si ya está aceptada, se ignora sin error. Un candado en la tabla deja solo los pasos de estado que existen,
venga de donde venga. Y, con la opción A que eligió Felipe, anular una venta ya no libera la boleta que intentó salir a SUNAT: se niega, la
nombra y dice qué hacer (Reintentar ahora → Devolución con nota de crédito). Las dos migraciones quedaron aplicadas en producción a las
11:37–11:40, con su OK, y comprobadas.
Por qué así: con dos conexiones reales, sin el cambio, la respuesta vieja pisaba el aceptado; en producción no había pasado porque la web tenía
cuidado, no porque la base lo impidiera. Y de 52 boletas en la cola, 41 ya estaban en SUNAT: anular una de esas ventas dejaba una venta
declarada sin su nota de crédito.
Felipe se lleva: ya rige en producción. Una venta cuya boleta intentó salir ya no se anula nunca: se resuelve con «Reintentar ahora» y va por
Devolución. Falta mirar el mensaje en Devoluciones con una venta real en la cola.
