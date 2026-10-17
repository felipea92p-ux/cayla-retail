## 2026-10-16 (Cobros con tarjeta y QR: la máquina que cobra, Interbank, las cuentas «por depositar» y la comisión real — ADR-0429, decisión 3 del ADR-0417)
Qué hice: construí la decisión 3 del ADR-0417 en seis actividades (`/construir`, lista aprobada por Felipe): (1) nacen Interbank y las
puentes «Por depositar Izipay» y «Por depositar Vendemás», y las máquinas con sus tiendas; «A qué cuenta entra cada cobro» aprende el QR y,
desde el 30 de septiembre, manda la tarjeta a Vendemás (TRU y AQP) o Izipay (Lima) y el QR a Izipay; el sello valida que la máquina elegida
opere en esa tienda y el diario asienta el QR en la 105. (2) La hoja de cobro de Vender pregunta «¿Con qué máquina la tarjeta?» solo donde
hay dos (Vendemás marcada), lo marcado viaja como `cuenta_id` y `registrar_venta` lo sella; probado a 375 px con doble clic. (3) El «Depósito
de la máquina» (antes «Abono de tarjeta») cruza el neto que llegó contra los días pendientes que la persona marca: la comisión real es la
diferencia, queda como gasto 639, qué días cubrió queda escrito y un día no se liquida dos veces; la puente vuelve a 0 y Conciliación cuadra.
(4) La tarifa por máquina y medio solo estima la comisión de lo pendiente y avisa «no depositó N días». (5) Una migración de datos, con
ensayo, pasa los cobros con tarjeta y QR desde el 30-sep del banco a su puente, con rastro. (6) ADR-0429, este cierre y el PR #1138 (borrador; su SQL se pegó en producción el 2026-10-17).
Por qué así: la máquina es una entidad chica aparte (no engorda `cuentas_dinero`), el destino por defecto sigue siendo `medios_de_cobro`
(ya guardaba historia y el medidor de confianza del ADR-0417 lo lee), el cobro no gana columnas (la máquina se deduce 1 a 1 de la cuenta
sellada) y la comisión nunca se teclea: sale del cruce, y el cruce deja rastro de qué día cubrió cada depósito para poder ver «cruzado
entre máquinas». Las cinco migraciones son reemplazos anclados sobre las funciones vivas (la de `fn_asiento_cuenta_de_medio` y la de
`fn_cuenta_sellada` difieren de las del repo solo en un comentario ADR-0310/0311).
Felipe se lleva: las cinco migraciones se pegaron en producción el 2026-10-17 con su OK, en orden, y la quinta se ensayó primero (coincidió con la sonda). Y
rehacer el histórico tiene un costo suyo que el ADR-0417 no nombraba: los depósitos que Izipay y Vendemás ya hicieron a Interbank desde el
30 de septiembre hay que registrarlos con la pantalla nueva (pueden ir agrupados por semana, con el extracto); hasta entonces las puentes
muestran todo como pendiente y el aviso de atraso se prende. Visto de paso y propuesto aparte: una devolución con tarjeta se asienta en la
451 (la tarjeta de crédito de CAYLA), no en la puente ni en el banco.

**2026-10-17 · verificación con el navegador (sesión aparte).** QUÉ HICE: corrí `tema:auditar`, `guias:recorrer` y `/formidable` sobre la hoja de cobro con máquina, el depósito, la tarifa y el aviso; arreglé lo que encontré sin cambiar qué hace ningún botón: el CSS que la fusión con `main` dejó sin cerrar (la rama no compilaba), el aviso que abría el depósito con la máquina equivocada, el ejemplo del voucher que decía «Izipay» con Vendemás elegida, la fila del día y la tabla de máquinas que se cortaban a 375 px, y el halo de la guía de la tarifa. POR QUÉ ASÍ: un aviso que dice «con esa máquina» y abre otra hace que la persona registre el depósito en la puente equivocada, y la comisión saldría negativa o cruzada. QUÉ SE ROMPERÍA SIN ESTO: Vercel no habría podido compilar el CSS y las guías del depósito habrían enseñado una pantalla distinta de la real. Los 3 cambios de `/formidable` esperan el OK de Felipe (informe en `docs/formidable/`).

**2026-10-17 · los 3 cambios de `/formidable`.** QUÉ HICE: «Por depositar» se ve con céntimos (S/ 149.90 y no S/ 150), el depósito dice «Depósito de Vendemás», da un ejemplo que no inventa números, habla de «número de operación» y ya no de «gasto 639»; y en la hoja de cobro la máquina elegida lleva ✓, el texto sube a 12 px y a 375 px la hoja baja sola al comprobante. POR QUÉ ASÍ: la persona dudó de una diferencia de 10 céntimos que no existía y no sabía dónde elegir el comprobante en el celular. QUÉ SE ROMPERÍA SIN ESTO: un depósito que no cuadra por 10 céntimos de redondeo hace desconfiar de toda la pantalla de plata, y una hoja de cobro donde no se ve el último paso se abandona. Solo presentación: ningún cálculo cambió.
