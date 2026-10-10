# Corregir el pago de una venta (ADR-0365) — pendientes

- [x] ~~Pegar en producción `20261009120000_corregir_pagos_venta.sql`~~ — hecho el 2026-10-09 (versión `20261009173704`).
- [ ] Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`), luego `pnpm datos:generar:produccion` y `pnpm datos:comparar`, para que `venta_pagos_correcciones` entre al diccionario.
- [ ] Imprimir un ticket real en la térmica de cada tienda: confirmar que el QR ya no sale cortado con 18 mm al pie y que «Atendió» con nombre y apellido cabe bien.
- [ ] `/chaos` y `/formidable` sobre «Corregir el pago» (hoja que guarda dinero): no se corrieron en esta sesión.
- [ ] El recorrido de la venta en Historial todavía no muestra «Pago corregido»: hoy solo se ve en Actividad.
