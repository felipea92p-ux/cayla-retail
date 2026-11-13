# ADR-0652 — Cuadrar con el banco: el saldo de hoy se corta en el momento de anotarlo

- **Fecha:** 2026-11-13 · **Estado:** construido en la rama `claude/cuadre-retiro-error-c18c68`. La migración `20261113170000_cuadre_se_corta_al_anotar.sql`
  **no está en producción**: espera el OK de Felipe para pegarla. Su vuelta: `pegar-en-produccion-vuelta-cuadre-se-corta-al-anotar-2026-11-13.sql`.
- **Nace de:** Felipe (2026-11-13), en Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: «cuadré, pero luego hice un retiro y me sale “No cuadra”;
  no entiende que el retiro se hizo después». BCP Empresa: anotó que el banco decía S/ 1,480.39 (coincidía), registró un retiro de S/ 280.39 con fecha
  de ese mismo día y el cuadre pasó a «No cuadra: hay S/ 280.39 de diferencia», con 0 líneas por revisar que lo explicaran.
- **Relacionados:** ADR-0195 F3 (la conciliación: «el saldo del sistema no se guarda, se suma al leer»), ADR-0637 (`banco_lineas`, el extracto que
  manda; no se toca aquí).

## El problema

`conciliaciones` guarda el saldo del banco por **día** («al cierre de ese día»), y el saldo del sistema de ese cuadre se sumaba al leer con **todo** lo
de ese día. Pero el saldo se anota cuando alguien mira la banca por internet, casi siempre a media jornada. Todo lo que se registra después con
fecha de hoy (el retiro, los Yape de la tarde, un pago a un proveedor) cambiaba el saldo del sistema de un cuadre que ya estaba cerrado.

## La decisión (Felipe eligió la primera de tres)

DECIDÍ: al anotar el saldo de **hoy**, la base guarda cuánto se había movido esa cuenta ese día hasta ese momento (`conciliaciones.movido_del_dia`).
El saldo del sistema de ese cuadre = saldo inicial + lo de los **días anteriores, en vivo** + lo del día **hasta que se anotó, guardado**. Lo que se
registra después con fecha de ese día entra al próximo cuadre, y la pantalla lo dice («Después de anotarlo salieron S/ 280.39 con fecha de ese día»).
Un saldo anotado para un día que ya pasó no guarda corte (`movido_del_dia` nulo): se compara con el día entero, porque el banco ya cerró ese día.

DESCARTÉ: congelar el saldo completo del sistema al anotar, porque entonces registrar un movimiento olvidado de ayer ya no arregla la diferencia y
se pierde el «busca en las líneas lo que falta registrar», que es para lo que sirve el cuadre. Y solo cambiar el texto de la pantalla («anota al
cerrar el día»), porque depende de que alguien lo recuerde y las ventas de la tarde lo rompen todos los días.

SE ROMPE SI: algo que pasó en el banco **antes** de anotar el saldo se registra en CAYLA **después** con fecha de hoy (una compra de la mañana que se
anota a la tarde). No entra a ese cuadre y la diferencia se queda; la pantalla lo dice como «Después de anotarlo salieron…», y se corrige anulando el
saldo y anotándolo de nuevo. No hay forma de saber desde CAYLA a qué hora pasó algo en el banco: la hora que tenemos es la de cuando se registró.

## Qué cambia

- **Base:** la columna `movido_del_dia`, que no se edita (el disparador `fn_conciliaciones_solo_anular` la cuida como las demás);
  `registrar_conciliacion` la llena solo si la fecha es hoy; `fn_conciliacion` (el saldo del sistema del cuadre y del historial, y el nuevo
  `despues`) y `fn_conciliacion_cuentas` (la última diferencia de la lista de bancos, el «No cuadra») cortan el día así. Reemplazos anclados: si una
  función viva cambió, el pegado aborta entero.
- **Pantalla:** «¿Qué saldo dice el banco?» dice «lo que muestra ahora» si la fecha es hoy y «al cierre de ese día» si no; la tarjeta del banco agrega
  lo registrado después de anotarlo (`textoDespuesDeAnotar`, `lib/cuadrar-reglas.ts`).
- **Lo que ya estaba anotado** queda con `movido_del_dia` nulo y se lee como antes. El cuadre de BCP Empresa del 13 nov sigue en «No cuadra» hasta
  anularlo y anotar el saldo que el banco muestra ahora.

## Concurrencia y caídas

Si un movimiento se guarda en el mismo instante en que se anota el saldo, la suma de `registrar_conciliacion` lo ve o no lo ve entero (una sola
lectura); si no lo vio, sale en «después de anotarlo». No hay dependencia externa: la banca por internet la mira una persona.

## Cómo se verificó

`pnpm pruebas:cuentas-dinero` (caso 11, siete comprobaciones): el retiro de la tarde no rompe el cuadre ni la lista de bancos; lo olvidado de ayer sí
entra; lo movido al anotar no se edita; un día pasado se compara entero. **Control:** sin la migración los siete fallan. La migración se aplicó dos
veces y la vuelta dos veces dentro de una transacción: las cuatro funciones quedan con la misma huella md5 que antes.
