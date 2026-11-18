# 2026-11-05 — La regla de la página ya no deja a nadie mirando aire

**Qué se hizo:** si un clic cambia de vista y volver adonde estaba dejaría menos de un cuarto de la pantalla con contenido, `<PaginaEstable />` ya no reserva aire: la vista queda en lo último que hay (`esCambioDeVista`).
**Por qué:** quince componentes soltaban la reserva a mano, casi siempre después de que alguien viera una pantalla vacía, y la siguiente pantalla podía olvidarlo. Felipe pidió cerrarlo en la regla.
**Felipe se lleva:** una pantalla nueva ya no puede quedar vacía por esto. Puede quedar con el título fuera si no declara su cambio de vista: la red evita lo peor, no lo reemplaza. Dije «sexto arreglo» por un conteo cortado; son quince.
