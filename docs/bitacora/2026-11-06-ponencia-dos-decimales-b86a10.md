# 2026-11-06 · Cuentas y dinero con dos decimales

- **Qué:** todos los montos de Finanzas ▸ Cuentas y dinero (lista, detalle, círculo, movimientos, plata del dueño, Claure, Por pagar y los avisos) salen con sus céntimos, con el formato nuevo `solesDos` (`lib/gastos-reglas.ts`).
- **Por qué:** Felipe lo pidió mirando la pantalla: «S/ 1» en una cuenta bancaria no dice cuánto hay de verdad. Un saldo cuenta como negativo desde un céntimo.
- **Cómo verificas:** abre Cuentas y dinero: «S/ 2,587.00», «−S/ 896.00». El resto del ERP sigue con `solesRedondo` (sin cambio).
