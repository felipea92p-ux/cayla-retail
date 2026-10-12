## 2026-10-06 (Ventas sin registrar: botón «Recientes / Antiguas» a la vista)
Qué hice: un botón chico junto a los filtros de `/inventario/por-regularizar` que alterna el orden por fecha de venta (ícono de calendario con
flecha abajo = recientes primero, flecha arriba = antiguas primero). En pantalla angosta queda solo el ícono; con la lista ordenada por otra
columna dice «Por fecha» y al tocarlo vuelve a ordenar por fecha, de la más reciente a la más antigua.
Por qué así: el orden por columna ya existía (encabezado «Vendió»), pero su flecha pálida no se notaba y la colaboradora no encontraba cómo ver
primero las ventas viejas. Es el mismo estado `orden` de la tabla: no cambia qué se muestra ni qué se guarda. Una primera versión con dos
botones se veía grande y desordenada; un solo botón que alterna ocupa menos.
Felipe se lleva: mirar la pantalla con ventas pendientes reales (la base local no tenía filas) y decir si quiere el mismo botón en otras listas.
