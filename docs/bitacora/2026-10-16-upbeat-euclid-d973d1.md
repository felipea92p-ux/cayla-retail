## 2026-10-16 (Cobros con tarjeta y QR: la máquina que cobra, Interbank, las cuentas «por depositar» y la comisión real — ADR-0429, decisión 3 del ADR-0417)
Qué hice: construí la decisión 3 del ADR-0417 en seis actividades (`/construir`, lista aprobada por Felipe): (1) nacen Interbank y las
puentes «Por depositar Izipay» y «Por depositar Vendemás», y las máquinas con sus tiendas; «A qué cuenta entra cada cobro» aprende el QR y,
desde el 30 de septiembre, manda la tarjeta a Vendemás (TRU y AQP) o Izipay (Lima) y el QR a Izipay; el sello valida que la máquina elegida
opere en esa tienda y el diario asienta el QR en la 105. (2) La hoja de cobro de Vender pregunta «¿Con qué máquina la tarjeta?» solo donde
hay dos (Vendemás marcada), lo marcado viaja como `cuenta_id` y `registrar_venta` lo sella; probado a 375 px con doble clic. (3) El «Depósito
de la máquina» (antes «Abono de tarjeta») cruza el neto que llegó contra los días pendientes que la persona marca: la comisión real es la
diferencia, queda como gasto 639, qué días cubrió queda escrito y un día no se liquida dos veces; la puente vuelve a 0 y Conciliación cuadra.
(4) La tarifa por máquina y medio solo estima la comisión de lo pendiente y avisa «no depositó N días». (5) Una migración de datos, con
ensayo, pasa los cobros con tarjeta y QR desde el 30-sep del banco a su puente, con rastro. (6) ADR-0429, este cierre y el PR #1138 (borrador: SQL sin pegar).
Por qué así: la máquina es una entidad chica aparte (no engorda `cuentas_dinero`), el destino por defecto sigue siendo `medios_de_cobro`
(ya guardaba historia y el medidor de confianza del ADR-0417 lo lee), el cobro no gana columnas (la máquina se deduce 1 a 1 de la cuenta
sellada) y la comisión nunca se teclea: sale del cruce, y el cruce deja rastro de qué día cubrió cada depósito para poder ver «cruzado
entre máquinas». Las cinco migraciones son reemplazos anclados sobre las funciones vivas (la de `fn_asiento_cuenta_de_medio` y la de
`fn_cuenta_sellada` difieren de las del repo solo en un comentario ADR-0310/0311).
Felipe se lleva: las cinco migraciones están SIN PEGAR y van en orden con su OK; la quinta toca filas de producción y se ensaya primero. Y
rehacer el histórico tiene un costo suyo que el ADR-0417 no nombraba: los depósitos que Izipay y Vendemás ya hicieron a Interbank desde el
30 de septiembre hay que registrarlos con la pantalla nueva (pueden ir agrupados por semana, con el extracto); hasta entonces las puentes
muestran todo como pendiente y el aviso de atraso se prende. Visto de paso y propuesto aparte: una devolución con tarjeta se asienta en la
451 (la tarjeta de crédito de CAYLA), no en la puente ni en el banco.
