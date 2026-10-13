## 2026-10-12 (El cobro por QR se llama «QR», no «Otro»)
Qué hice: en «Qué se cobró» del detalle de un cierre y en «Cobrado en el turno» del tablero de Caja, lo cobrado por QR salía como «Otro» (en un cierre real, 14 ventas y 37 % del día). Ahora sale como «QR», con su color de siempre.
Por qué así: la base acepta ocho medios (`venta_pagos_metodo_check`: efectivo, tarjeta, yape, plin, transferencia, anticipo, qr, redondeo) y `claveDeMetodo` solo conocía cinco; el tablero ya tenía color para `qr` pero nunca le llegaba. «Otro» queda solo para un método que no se conozca. Ningún total cambia, solo cómo se nombra.
Felipe se lleva: un desglose por medio de pago que dice lo que de verdad pasó, sin un «Otro» misterioso.
