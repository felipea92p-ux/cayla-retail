## 2026-10-12 (Un gasto pagado del cajón se llama «Gasto» y se puede abrir)

Qué hice: en Caja ▸ Movimientos del turno, una salida que es un gasto ya no sale como «Otro»: dice qué se pagó
(«Gasto · Baño»), su categoría junto a quién lo registró, y lleva su boleta como ícono. Además TODA fila de la lista
—venta, entrada o salida del cajón— abre su detalle al tocarla; antes solo abrían las ventas. El mismo nombre se usa
en el detalle de un cierre, que decía «Otro · Gasto · Servicios básicos — Baño».

Por qué así: el dato nunca se perdió. `registrar_gasto` le escribe al egreso la nota «Gasto · <categoría> —
<descripción>» porque el vocabulario de motivos de `registrar_movimiento_caja` es cerrado y no tiene «Gasto»; la
pantalla leía el motivo y tiraba la nota. Las 26 salidas «Otro» que hay hoy en producción son, todas, gastos. Se
arregló leyendo esa nota (`lib/caja-movimiento-reglas.ts`, puro y con su prueba, que además comprueba contra la
migración que el texto sigue siendo ese) y no con una migración nueva: así quedan bien también las 26 que ya
existen, y lo ve igual una colaboradora sin el módulo Gastos, porque la nota viaja en el propio movimiento.

Felipe se lleva: una fila que no abre nada al tocarla no se lee como «no hay más que ver», se lee como una pantalla
rota — por eso ahora abren todas. Y quien cierra la caja ve en la hoja lo que le importa de verdad: qué se pagó y
que esa plata ya está descontada del efectivo que el cajón espera al cerrar.

Lo que NO hace: si un gasto se anula después (`anular_gasto` no toca el egreso, porque la plata igual salió), la
fila sigue diciendo «Gasto · …». Hoy no hay ninguno anulado en producción; si llega a pasar seguido, el arreglo es
leer `gastos` por RPC en vez de la nota.
