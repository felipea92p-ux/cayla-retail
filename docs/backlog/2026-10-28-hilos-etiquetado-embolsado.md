## Producción · quitar pasos de una orden abierta (ADR-0551 act. 1b)
- **POR PEGAR en producción:** `20261028071000_produccion_quitar_paso_de_la_orden.sql` (una parte, re-ejecutable, solo una función nueva). Va ANTES de publicar la web de esta rama: sin ella el botón «Quitar este paso» respondería que la función no existe.
- **Limpieza de datos pendiente:** OP-1 a OP-4 siguen con «Limpiar hilos y revisar» y «Etiquetar y embolsar» hasta que se quiten (8 pasos, 0 anotaciones). Hacerlo ANTES de convertir OP-1 y OP-4 en órdenes «de antes» (actividad 2).
- **Sin «agregar paso»:** quitar es de un solo sentido. Si hace falta volver a agregar uno a una orden abierta, es una función hermana (hoy se anula la orden y se abre de nuevo).
