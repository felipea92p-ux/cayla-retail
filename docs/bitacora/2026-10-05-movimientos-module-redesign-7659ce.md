## 2026-10-05 (Movimientos: los tipos que se ven — ADR-0346)
Qué hice: Felipe pidió rediseñar Movimientos para que se note de un vistazo si fue una venta, una colgada en piso o una guardada en almacén. Armé tres
maquetas (`docs/maquetas/movimientos-rediseno-2026-10/`), eligió la A · Ruta con los siete botones en una columna a la derecha, y la construí en siete
actividades, un commit cada una: las palabras y los tipos (`lib/movimientos-tipos.ts`), el sello y el trayecto en cada fila, la base (migración
`20261005160000`: `fn_movimientos` y el resumen aceptan `venta | colgada | guardada | llegada | traslado | cliente`), la columna de tipos a la derecha (reemplaza
las píldoras de tipo y las tres tarjetas), el día con su franja y el mazo de colgadas, y el cajón con sello, ruta y «Qué pasó».
Por qué así: una venta, una bajada y un retiro se leían casi igual; el tipo sale de lo que la base ya devuelve (par de lugares, proceso, signo) y se
distingue por color + ícono + texto + camino, no solo por color. Los pasos del cajón salen solo de lo que el registro respalda.
Lo que NO se hizo a propósito: pegar la migración en producción (falta el ok de Felipe; va ANTES o junto con la web), cambiar «Bajada al piso» en el resto
del sistema (~170 menciones: decisión de varios módulos), la fila que se despliega dentro de la lista, ni tocar la pestaña Pérdidas. Cómo verificas tú:
`pnpm pruebas:movimientos-colgada-y-guardada` y abre `/inventario/movimientos?rango=90`: tocar un botón filtra; `?cat=colgada` trae solo colgadas; abrir una
colgada muestra el sello, la ruta Almacén → Piso y tres pasos; a 375 px la fila de botones se desliza.
