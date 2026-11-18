## 2026-11-06 (Ventas sin registrar de TRU y AQP cerradas a mano)
Qué hice: cerré en producción las 586 ventas sin registrar pendientes (AQP 324, TRU 262) como «cerradas sin prenda», con motivo «no se sabe», a nombre de Felipe; el costo promedio de cada una ya estaba sellado y no cambió.
Por qué así: Felipe no quiso escanear el almacén antes de cerrar y el plazo ya había vencido; se replicó la lógica de `cerrar_cola_arranque` saltando solo el plazo y el cuadre (ADR-0334, actualización 2026-11-06).
Felipe se lleva: la regla no cambió; el almacén de las dos tiendas sigue sin verificar, y la proporción de ventas sin registrar no bajó tras etiquetar (AQP ~34 %, TRU ~15 %).

## 2026-11-06 (Vender pregunta por qué se anota a mano una prenda)
Qué hice: la hoja «Prenda sin registrar» pide primero el motivo (la pistola no la lee, no tiene etiqueta, el sistema dice que no hay, había cola, u otro con texto); viaja con la venta y se ve en Ventas sin registrar. Migración `20261106233000` (dos columnas y un reemplazo anclado del insert de `registrar_venta`).
Por qué así: con todo etiquetado la proporción de ventas sin registrar no bajó, y sin el motivo no se sabe si arreglar la pistola, el etiquetado, el stock o el mostrador. Va dentro de la misma venta (también sin conexión) y un motivo raro nunca la tumba.
Felipe se lleva: la migración ya está en producción (la pegó el mismo 6-nov): desde que se publique la web, cada venta sin registrar guarda su motivo. En una semana se cuenta qué motivo pesa más.
