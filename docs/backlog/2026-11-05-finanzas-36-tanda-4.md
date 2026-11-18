## Las 36 de Finanzas, tanda 4: lo que queda (2026-11-05)

- [x] Las 5 migraciones (`20261106010000`, `20261106011000`, `20261106012000`, `20261106013000`, `20261106021000`) ya están en producción. El check «SQL pegado» las vio el 2026-11-06 antes de fusionar el PR #1663, y se comprobó en solo lectura ese mismo día.
- [ ] Felipe: confirmar el régimen laboral. Hasta entonces CTS y gratificación se pueden pagar, pero no se proyectan.
- [ ] Felipe: elegir el banco de cada máquina en Configuración ▸ Dinero; sin él, «Cuadrar depósitos» no la deja cuadrar.
- [ ] Felipe: mirar quiénes son el grupo «prueba» de Dynamic: no entra al costo, pero sí a la salida de banco.
- [ ] Contador: supuestos escritos en cada migración: 4017 como pago adelantado; 41 única y provisión que baja al pagar (la 41 de arranque tiene que traer lo provisionado antes); cuentas 6392 y 4691; comisión sin sede ni crédito fiscal; categorías sin papel; IGV a mano de cualquier monto.
- [ ] Cronograma de SUNAT por último dígito del RUC (tarea 10): sigue el día 15 como punto medio; necesita el RUC y la tabla de cada año.
- [ ] ADR-0552, actividad 5: cargar el reporte de la máquina para confirmar lo estimado. Y repartir la comisión por sede, si el contador lo pide.
- [ ] `/chaos` sobre las hojas nuevas (Pagar a SUNAT, Qué parte pagas, Cuadrar depósitos, Cambiar por lo real, IGV y fecha de pago): va en la tanda 9.
- [ ] Refrescar el volcado al pegar, para que el diccionario traiga `impuestos_pagos`, `planilla_pagos_concepto` y `pos_abonos_estimados`.
