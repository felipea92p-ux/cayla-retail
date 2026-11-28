# 2026-11-27 · Un retiro dice quién se lleva la plata y para qué

Qué hice: un retiro o una devolución de préstamo ya no se guarda sin decir quién se llevó la plata, y un retiro, sin decir para qué; «Plata del dueño ▸ Por quién» cuenta lo que salió para quien se lo llevó, no para quien lo anotó (ADR-0713, migración 20261127150000).
Por qué así: la tarjeta mostraba que una encargada de AQP «sacó S/ 2,812.10» cuando solo anotó dos retiros de la caja fuerte de AQP (uno se lo llevó Felipe, el otro era un ajuste del cuadre); la base solo guardaba quién registró.
Qué se rompería sin esto: cada retiro anotado por una encargada seguiría saliendo como plata que ella se llevó, y un retiro sin motivo no se podría explicar meses después.
Probado: `pruebas:retiro-quien-y-para-que` (15, con mutación), las cuatro pruebas de dinero que siembran retiros, vitest de las reglas y la hoja en el navegador contra una pila local con la migración.
