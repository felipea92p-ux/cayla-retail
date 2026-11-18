## 2026-11-07 (Depósitos de las máquinas: Izipay y Vendemás contra el ERP — ADR-0630)
Qué hice: crucé, con los paneles de Izipay y Vendemás abiertos en Chrome, cada abono y cada venta contra `fn_dinero_libro` desde el 28-oct.
Vendemás calza; Izipay calza pago por pago con sus CUATRO códigos (una tienda cobra con dos), y lo que no calza son cobros mal anotados
(Yape que fue QR de Izipay, tarjeta de una máquina anotada en la otra). Construí la parte 1: `corregir_pagos_venta` deja a un líder corregir
lo que no es efectivo con la caja cerrada y elegir la máquina (`20261107223000`, sin pegar), con su suite y su control.
Por qué así: el arqueo solo guarda efectivo, así que el candado se reduce a eso; la fuente para cuadrar Izipay es su propio reporte (trae
tienda, hora y comisión), no las líneas del banco. Lo pendiente está en `docs/backlog/2026-11-07-depositos-chrome-extension-98b6cf.md`.
