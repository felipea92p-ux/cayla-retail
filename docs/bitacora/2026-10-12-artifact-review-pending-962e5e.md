## 2026-10-12 (Cinco arreglos chicos de la revisión del 11-oct: pago del Taller, baja ante SUNAT, familias de subcategorías, bolsas en «¿ya puede recomendar?» y una lectura vieja)
Qué hice: cuatro migraciones y un cambio de ruta, cada uno con su prueba. (1) Un doble clic en «Pagar» un comprobante del Taller ya
no paga dos veces: el token se mira con el comprobante bloqueado (`20261012214000`; con dos conexiones reales, antes quedaban S/ 600
por un pago de S/ 300, ahora S/ 300). (2) Pedir la baja de un comprobante revisa ANTES de llamar a Lucode lo mismo que la base exige
al guardar: líder, sin nota vigente y sin una baja ya en trámite (`lib/anular-comprobante-reglas.ts`). (3) Cambiar la familia de una
categoría padre se la pasa a sus subcategorías, todo o nada (`20261012215000`). (4) La cifra de venta identificada que decide si el
motor de demanda puede recomendar ya no cuenta las bolsas (`20261012220000`). (5) Se borra `fn_historial_producto_cambios`, que nadie
usaba desde ADR-0354 (`20261012213000`).
Por qué así: lo que llega a SUNAT no se deshace, así que se revisa antes de mandarlo y no después; la familia se propaga en la tabla y
no en la función de la pantalla, como los demás candados de categorías; y borrar una lectura sin uso es más simple que ponerla al día.
Felipe se lleva: nada de esto está en producción. Las cuatro migraciones esperan su OK para pegarse (una parte cada una, sin
políticas). La ruta de anulación sale con el próximo despliegue.
