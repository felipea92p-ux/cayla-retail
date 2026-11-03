## Recibir: cancelar la recepción y la ✕ de lo agregado (2026-11-03)
Hecho: `cancelar_recepcion_envio` + hoja `CancelarRecepcion` en el menú «Más» de Contar (solo envío sin aviso, abierto y nunca cerrado); la ✕ de modelo y categoría agregados, con «Deshacer»; el total de la categoría es su propia fila. ADR-0605.
**Falta:**
- Pegar `20261103173000_cancelar_recepcion_sin_aviso.sql` en producción (pide el OK de Felipe) y refrescar el volcado del diccionario.
- Probarlo en el navegador con una cuenta real (escritorio y 375 px): la ✕ en la lista y en la placa, el total de la categoría, y el cancelar de punta a punta.
- Cancelar desde la fila de la lista de envíos («⋯»): `EnvioPorAbrir` no trae la versión del envío; hay que sumarla o leerla al abrir la hoja.
- Decidir qué pasa con un envío CON aviso abierto por error (anularlo o volverlo a «en camino»); hoy la base lo niega (`envio_con_aviso_no_se_cancela`).
- `/formidable` y `/chaos` de la pantalla (guarda) antes de darla por terminada.
