# ADR-0636 · Mercadería pagada, y de dónde vino cada entrada de stock

- **Fecha:** 2026-11-09
- **Decide:** Felipe
- **Estado:** en construcción (actividad 1 de 5 hecha)
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
2. **Toda entrada de stock dice de dónde vino.** Al cargar stock por «Nuevo producto» o al ajustar hacia arriba, la pregunta «¿Ya lo teníamos o
   lo compraste?». Si es compra, se elige el papel.
3. **Camino A (Felipe):** esa carga cuenta como la llegada de la compra: el papel pasa al libro ahí, sin esperar un envío. Un mismo papel no
   puede recibirse por los dos caminos.
4. Se guarda la fecha en que cada papel pasa al libro (para cortes pasados) y el cierre de mes avisa de papeles sin pasar.

## Descarté

- **Asiento por cada hecho con cuenta 28** («mercadería por recibir»): dos asientos que deben cancelarse, residuos que nadie salda cuando el
  monto se corrige al completar, y la comprobación del dinero descuadraría por el total. No gana verdad: stock y libro ya nacen juntos al cierre.
- **Partir por lo escaneado:** escanear no mete stock (22 conteos, 0 recibidos en los envíos con papel); la partición saldría siempre en cero.
- **Pasar el papel al libro el día de la compra:** la 201 incluiría prendas que no están en ninguna tienda y un conteo distinto obligaría a
  corregir un papel ya asentado.

## Se rompe si

- Se mira un corte pasado antes de la actividad 2: la línea usa el estado de hoy del papel.
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

`pnpm pruebas:mercaderia-pagada-balance` (18 casos: la plata cambia de casillero, el activo no cambia, al completar no se cuenta doble ni cero).
