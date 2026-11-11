# ADR-0636 · Mercadería pagada, y de dónde vino cada entrada de stock

- **Fecha:** 2026-11-09
- **Decide:** Felipe
- **Estado:** en construcción (hechas: la línea del Balance y el aviso del cierre; faltan las dos preguntas de origen)
- **Toca:** ADR-0621 (el fondo sale al gastarse), ADR-0485 decisión 6 (sin cuenta puente), ADR-0574 (el papel pasa solo a los libros), ADR-0618 (arranque)

## El problema

Felipe, 2026-11-09: «todo lo de compras en algún momento se convierte en stock al llegar, pero el dinero que sale no vaya a estar restando
doble. Mientras no registran, ¿dónde ponemos eso?».

Medido en producción ese día (solo lectura):

- **No hay doble resta en el resultado.** Una compra no es gasto: el resultado baja solo al vender, por el costo sellado. El Flujo resta cada
  sol una vez, con la fecha del papel (ADR-0621).
- **El hueco es de tiempo y de casillero.** El stock y el libro de una compra con papel nacen juntos al **cerrar el conteo** del envío
  (`fn_recepcion_cerrar` → `completar_papel_compra`). Entre el pago y ese cierre, el Balance (que lee el diario) seguía mostrando la plata en la
  1413: 35 papeles por S/ 24,452, y S/ 0 de plata real en los fondos.
- **Las otras puertas de entrada de stock no saben que fue una compra.** Carga inicial (también «Nuevo producto» con stock inicial,
  `crear_producto_con_stock_inicial`) sube la 201 contra capital; un ajuste hacia arriba la sube contra sobrante (6959, ganancia); un envío «sin
  aviso» no asienta nada. En noviembre entraron así 492, 411 y 78 prendas; por la puerta con papel, 0.

## Decisiones

1. **Línea calculada «Mercadería pagada» en el Balance** (no un asiento). La 1413 baja por lo pagado de los papeles por completar y aparece una
   línea de activo por la base, más otra por el IGV de las facturas. Mismo conjunto que ADR-0621 (`fn_fondo_por_completar`), así que Flujo,
   Cuentas y dinero y Balance dicen lo mismo. El total del activo no cambia. Migración `20261109231000`.
2. *(Reemplazada, ver «Lo que cambió al medir».)* **Toda entrada de stock dice de dónde vino.** Al cargar stock por «Nuevo producto» o al ajustar hacia arriba, la pregunta «¿Ya lo teníamos o
   lo compraste?». Si es compra, se elige el papel.
3. **Camino A (Felipe):** esa carga cuenta como la llegada de la compra: el papel pasa al libro ahí, sin esperar un envío. Un mismo papel no
   puede recibirse por los dos caminos.
4. **El cierre de mes avisa con el monto y no bloquea** (Felipe, 2026-11-09, entre bloquear, avisar o mandar la compra al mes siguiente).
   El papel de un mes cerrado no puede entrar al libro (`compras_mes_abierto` rechaza a `completar_papel_compra`) hasta reabrirlo: el aviso
   lo dice. Migración `20261109235000`.
5. **No se guarda la fecha en que el papel pasa al libro** (se propuso y se retiró). El diario es en vivo y el papel entra con SU fecha: un
   Balance a un corte pasado ya lo muestra en la 201. Una línea «como estaba ese día» lo contaría dos veces.

## Lo que cambió al medir (2026-11-09, tarde)

La decisión 2 apuntaba a la puerta equivocada. Cruzando producción: las compras con papel **no** entran por «Nuevo producto» (la carga
inicial de AQP no calza con ninguna compra pendiente: era stock viejo). Entran por **«Recibir sin aviso»**: 112 prendas (S/ 3,157) de
proveedores con una compra pagada pendiente; tres parejas calzan al centavo. La mercadería llega antes de que quien compró mande el envío (o
antes de que registre el papel), la tienda la recibe sin aviso y el envío propio de la compra queda esperando: si lo cierran contando, entra
dos veces; si no, el papel nunca pasa al libro. Stock doble hasta hoy: ninguno.

Felipe aprobó reemplazar las preguntas de Nuevo producto y Ajustar stock por tres pasos:

1. **Aviso en la puerta** (hecho, migración `20261110004000`): la hoja «sin aviso» nombra las compras pagadas que vienen a la sede
   (`fn_compras_pagadas_hacia`, sin montos), por envío o por compra si se eligió proveedor, con el enlace a su envío.
2. **Unir una recepción sin aviso con su compra** (por construir): tabla `compra_papel_llegadas` y una función que saca la compra de su
   envío propio, impide reenviarla o recibirla otra vez y deja que el papel pase al libro. Reglas: la plata la manda el papel y el costo del
   stock queda como entró; nunca une sola por coincidencia de cifras; no une con proveedor distinto; rechaza si el envío propio ya tiene
   prendas contadas; una unión no se deshace; lo que faltó queda por recibir.
3. **La lista para unir lo ya recibido**, que usa el paso 2 y cubre el orden al revés (recibido antes de registrar el papel).

## Descarté

- **Asiento por cada hecho con cuenta 28** («mercadería por recibir»): dos asientos que deben cancelarse, residuos que nadie salda cuando el
  monto se corrige al completar, y la comprobación del dinero descuadraría por el total. No gana verdad: stock y libro ya nacen juntos al cierre.
- **Partir por lo escaneado:** escanear no mete stock (22 conteos, 0 recibidos en los envíos con papel); la partición saldría siempre en cero.
- **Pasar el papel al libro el día de la compra:** la 201 incluiría prendas que no están en ninguna tienda y un conteo distinto obligaría a
  corregir un papel ya asentado.

## Se rompe si

- Se cierra un mes con papeles pendientes: quedan fuera del libro hasta reabrirlo (el cierre lo avisa con el monto).
- Un papel de antes del arranque (hay 6, S/ 4,293, del 28-oct) se completa: su asiento cae fuera del Balance y la plata vuelve a verse en la
  1413. Se corrige fijando de nuevo el arranque; **pendiente de decisión de Felipe**, y en dos pasos para no restar dos veces.
- Se archiva un fondo con papeles pendientes: `fn_fondo_por_completar` deja de verlos.
- Compras baja el monto al completar: la salida real es menor que la simulada y la diferencia vuelve al fondo (es una corrección real).

## Pendiente de decisión

- **Envíos «sin aviso»** (492 prendas en TRU en noviembre): stock sin compra en el libro. Subir la 201 contra «por regularizar» reabre la
  decisión 6 del ADR-0485; conviene que lo vea el contador.
- **Corregir noviembre y el arranque** (1413 de 5,700 a 4,300; los 6 papeles de octubre).
- **5 facturas o boletas sin serie o número** (S/ 3,592): no pasan solas; las completa Compras.

## Cómo se verifica

`pnpm pruebas:mercaderia-pagada-balance` (18 casos: la plata cambia de casillero, el activo no cambia, al completar no se cuenta doble ni cero)
y `pnpm pruebas:cierre-papeles-con-monto` (4 casos).

## Actualización 2026-11-10 — la unión de una recepción con su compra, tras la revisión adversarial
`20261110011000` (sin pegar) une una recepción «sin aviso» con su compra pagada. Decidido al revisarla (cuatro lentes y un escéptico por hallazgo, dos
fallas altas reproducidas): **no se une hasta que llegó todo lo comprado** (una compra unida deja de poder mandarse, recibirse o cerrarse por otro
camino, así que el resto no tendría salida; abierto a decisión de Felipe permitir varias uniones por papel); lo que reclaman otras compras unidas se
mide por lo comprado, no por una foto; una compra unida no se anula ni cambia de tienda, proveedor o cantidad, y el proveedor de su recepción no se
corrige (disparadores en el esquema, un solo lugar); quien hizo la compra no la une. La PARTE 2 lleva una guarda de md5 contra parches posteriores.
Pendiente menor registrado en el backlog de la rama.

## Actualización 2026-11-11 — lo contado en el envío de Compras ya no frena la unión
Felipe, 2026-11-11: «ya se recibió mercadería sin aviso, ¿cómo regularizamos esos envíos que Compras registró a destiempo?». En Trujillo, ENV-009
(Jirish, 15) y ENV-011 (Lady Girl, 17) entraron al stock por la recepción sin aviso ENV-007; después alguien apretó «Recibir» en el envío de
Compras y quedaron en «Seguir recibiendo». La unión se negaba con ENV-009 porque tenía 2 prendas contadas (`union_envio_con_conteo`).
**Decidido:** contar no mete stock. Si el envío de Compras tiene prendas contadas pero nada recibido, unir lo anula igual y lo contado queda como
historia del envío anulado (como `cancelar_recepcion_envio`, ADR-0605); la respuesta dice cuántas se descartaron (`conteos_descartados`). Lo ya
recibido por el envío de Compras se sigue rechazando (`union_envio_ya_recibido`). Migración `20261111152000` (reemplazos anclados; EN PRODUCCIÓN el 2026-11-11, con el script aplicado el mismo día) y el script `scripts/regularizar/2026-11-11-envios-recibidos-sin-aviso.sql`, que une ENV-009 y ENV-011 a nombre de Felipe
y deshace todo si el stock o los movimientos se movieran. Pruebas: `pnpm pruebas:unir-recepcion-con-compra` (26 casos; U6 y L5 cambian).
**Quedan fuera, por decidir:** ENV-010 (Valeria Mia: 27 llegaron por ENV-005 a nombre de «CAYLA SAC» y la 28 por un ajuste del 6-nov: hace
falta corregir el proveedor de UNA marca en una recepción ya cerrada y contar el ajuste) y ENV-002 (entró por «Nuevo producto» el 29-oct, una
puerta que la unión no cubre). Sin pantalla todavía: la unión solo se hace por el script.
