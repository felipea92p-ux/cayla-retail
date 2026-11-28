## 2026-11-26 (El líder ya puede anotar lo que se lleva de la caja fuerte sin depositar — SQL pegado, falta fusionar)
Qué hice: en Finanzas ▸ Cuentas y dinero, la caja fuerte de cada sede tiene «Se lo llevó el líder»: la plata sale de la caja fuerte y queda en «Efectivo entregado al líder» hasta que se deposite (ADR-0710).
Por qué así: es la misma plata en otro lugar, así que es un «entre cuentas» más y no un tipo nuevo; un tipo nuevo habría que enseñárselo al libro, al Flujo y al Diario para decir lo mismo.
Felipe se lleva: aprobó la regla y pegó la migración `20261127010000` el mismo día (huella verificada); el botón llega al fusionar el PR #2044. Quedan tres decisiones suyas escritas en el ADR (devolver a la caja fuerte, candado de lo que tiene el líder, nombre en las listas).
