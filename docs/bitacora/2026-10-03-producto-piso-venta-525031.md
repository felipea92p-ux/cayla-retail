## 2026-10-03 (Nuevo producto: «En piso de venta» sin pedir Existencias)
Qué hice: quien ve Productos ya puede crear el producto con sus prendas colgadas en el piso, sin tener Existencias. Migración `20261004000000` (una marca de transacción que `bajar_al_piso` acepta solo desde la carga inicial), la web sin el chequeo de Existencias y la prueba `alta_con_stock_inicial` (30/30). La migración NO está pegada en producción.
Por qué así: regla de Felipe, un módulo no obliga a tener otro (ADR-0306, actualización 2026-10-03). Reponer o subir por su cuenta sigue pidiendo Existencias, y una prueba lo exige.
Felipe se lleva: con una cuenta que ve Productos pero no Existencias, «En piso de venta» ya se puede elegir; falta tu OK para pegar la migración (después de `20261002120000`).
