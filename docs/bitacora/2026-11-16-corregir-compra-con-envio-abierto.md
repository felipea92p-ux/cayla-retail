# 2026-11-16 · Corregir una compra con el envío sin recibir

- **Producción (con el pedido del dueño):** se quitaron a mano del ENV-24 (Tienda TRU) y de las notas 000386 y 000387 tres prendas «por definir» que nunca se compraron (Lentes 3, «Sin leer» 2, «Surtido» 8). Primero hubo un ensayo que se deshizo solo. Queda una copia de las filas en `retail.actividad` (`envio_lineas_quitadas`). Los montos de las notas no se tocaron.
- **Para que no vuelva a pasar por la base:** migración `20261116215000` + hoja «Corregir esta compra». Bajar lo que viajó mientras el envío no llega y quitar lo que se anotó por error (ADR-0561, actualización 2026-11-16). Felipe la pegó en producción el mismo día; verificada con la consulta de su encabezado.
- **Pendiente:** los aretes del ENV-24 siguen en 93 (la línea de 23 de la nota 000197): con la migración en producción, Catherine los corrige desde Mis compras.
