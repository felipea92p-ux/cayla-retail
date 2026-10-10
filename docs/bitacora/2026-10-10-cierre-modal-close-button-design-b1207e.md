## 2026-10-10 (Historial de cierres: ✕, vuelta clara, detalle más legible y cobros por medio de pago)
Qué hice: el historial de cierres ahora tiene su ✕; al tocar un cierre, el detalle ocupa la misma hoja (que crece suave a ~1000 px) con «← Historial
de cierres» arriba, el resumen reordenado en bloques sin recuadros anidados, «Qué se cobró» por medio de pago (Efectivo, Tarjeta, Yape/Plin,
Transferencia) y los movimientos del turno en su propia columna a la derecha, con quién los registró.
Por qué así: la hoja apilada no dejaba ver que se podía volver, y los montos por medio no estaban en ningún lado; los datos ya se leían
(`venta_pagos`), así que no hubo migración y los medios suman igual que el tablero de Caja (`cobradoDelTurno`). ADR-0374.
Felipe se lleva: un detalle de cierre que se lee de arriba abajo, comparable contra lo cobrado por cada medio, y una vuelta que se entiende sin explicarla.
