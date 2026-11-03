## Recibir: cancelar la recepción (2026-11-03)
Hecho: `cancelar_recepcion_envio` + hoja `CancelarRecepcion` en el menú «Más» de Contar (solo envío sin aviso, abierto y nunca cerrado). ADR-0605. La ✕ y el total de la categoría los entregó #1617.
**Falta:**
- Probar la hoja de cancelar en el navegador sobre el código fusionado con #1617 (escritorio y 375 px); las capturas de /formidable y /chaos son de la versión anterior.
- Exigir 3 caracteres visibles en el motivo (hoy 3 invisibles pasan; el candado de la base en `cancelar_recepcion_envio` y `reabrir_envio` es decisión de Felipe).
- Cancelar desde la fila de la lista de envíos («⋯»): `EnvioPorAbrir` no trae la versión del envío.
- Decidir qué pasa con un envío CON aviso abierto por error (anularlo o volverlo a «en camino»); hoy la base lo niega (`envio_con_aviso_no_se_cancela`).
