## 2026-11-06 (Ventas sin registrar de TRU y AQP cerradas a mano)
Qué hice: cerré en producción las 586 ventas sin registrar pendientes (AQP 324, TRU 262) como «cerradas sin prenda», con motivo «no se sabe», a nombre de Felipe; el costo promedio de cada una ya estaba sellado y no cambió.
Por qué así: Felipe no quiso escanear el almacén antes de cerrar y el plazo ya había vencido; se replicó la lógica de `cerrar_cola_arranque` saltando solo el plazo y el cuadre (ADR-0334, actualización 2026-11-06).
Felipe se lleva: la regla no cambió; el almacén de las dos tiendas sigue sin verificar, y la proporción de ventas sin registrar no bajó tras etiquetar (AQP ~34 %, TRU ~15 %).
