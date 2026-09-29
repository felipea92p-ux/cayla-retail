## 2026-09-29 (El PDF de la boleta se llama como su número, la serie de Trujillo queda en B001 con próximo 4, y el panel de Actividad deja de mostrar ventas de prueba)
Qué hice: (1) Al guardar como PDF, el archivo se llamaba «Retail - CAYLA» porque el navegador usa el título de la página. Un hook
(`useTituloDeImpresion`, con la regla pura `nombreDeImpresion` y su prueba) pone el número del comprobante como título mientras está a la
vista: «B001-000004.pdf». Lo usan Venta registrada, Detalle de venta (ticket y A4), Proformas, Apartados y el ticket de Cambio.
(2) Serie de boleta de Tienda TRU: Felipe leyó dos veces el panel de Lucode y se aplicaron dos scripts en producción. Estado final, verificado:
`B001` activa con próximo 4, `B004` archivada, ningún comprobante tocado (Lucode ya tiene B001-000002 y -000003, emitidas por fuera del ERP).
Ninguna venta salió entre los dos cambios. ADR-0278, «Actualización 2026-09-29 (tarde)».
(3) Panel de Actividad: `fn_actividad` y `fn_actividad_personas` dejan fuera las filas de una venta con `es_prueba` (migración
`20260930030000_actividad_oculta_ventas_de_prueba.sql`, 8 pruebas contra Postgres local con rollback, aplicada en producción y verificada). Las filas
NO se borran: `actividad` es de solo agregar. Con esto ya no salen la venta de las 10:57 (B004-000033) ni la NV01-000007.
(4) Venta de las 12:55 (`B001-000001`, una vendedora de TRU, S/ 59.90 en efectivo): Felipe pidió la baja de la boleta en Comprobantes (16:02, motivo «ERROR»; sigue «aceptada», anulación en
trámite hasta que SUNAT confirme) y me pidió pegar los scripts. Pegué `pegar-en-produccion-archivar-venta-de-prueba-b001-000001-2026-09-29.sql` (marca `es_prueba`) y
`pegar-en-produccion-anular-venta-b001-000001-2026-09-29.sql` (anula la venta con el SQL equivalente a `anular_venta`, que no admite comprobante aceptado). Verificado: venta `anulada`
y `es_prueba`, firmada por Felipe; entrada `anulacion_venta` de 1 prenda; «Piso de venta» de esa prenda de 0 a 1; el panel ya no muestra ninguna de las tres ventas de hoy. El primer
`update` de `es_prueba` lo bloqueó el sistema de permisos hasta que Felipe lo pidió de forma explícita.
Por qué así: darle nombre al archivo desde el título cubre el botón, Ctrl+P y el modo kiosco a la vez. Ocultar en el lector y no borrar la fila conserva la
auditoría de una boleta que SUNAT ya tiene. Y la venta se anuló por SQL solo DESPUÉS de que Felipe pidiera la baja de su boleta (el script se detiene si nadie la pidió): sin
baja, el inventario diría una cosa y la SUNAT otra (ADR-0016).
Felipe se lleva: PDF y ticket salen con el número. La próxima boleta de Trujillo sale como `B001-000004`. La venta de las 12:55 quedó anulada y su prenda de vuelta en el inventario.
Ojo: la baja de la boleta ante SUNAT sigue EN TRÁMITE; hay que mirar en Ventas ▸ Comprobantes ▸ «Consultar anulación» que pase a «anulado». Si SUNAT la rechazara, la boleta queda
viva con la venta anulada y se corrige con una nota de crédito. Pendiente aparte: averiguar qué son B001-000002 y -000003.
Sin probar en el navegador: el nombre del PDF (hace falta una venta real) y el panel de Actividad con una sesión de líder (se probó la función, no la pantalla).
