# 2026-11-06 — Por qué el Resumen de noviembre daba negativo

- El −S/ 9,430 de «¿Cuánto te deja noviembre?» era la base (+S/ 3,580 del 1 al 6) menos S/ 12,273 de sueldos provisionados de Dynamic (29-oct a hoy, 9 días). Felipe decidió dejar el período 29 al 28.
- Hallazgo grave: el piso de 3 personas sacaba del total los sueldos de Tienda AQP (2 personas en noviembre). Migración `20261106235000_planilla_cuenta_toda_sede.sql` lo quita en lo estimado y en lo pagado (ADR-0453, act. 2026-11-06). **Pegada en producción el 2026-11-06 por Felipe;** verificado en lectura que AQP ya aparece en la provisión de noviembre.
- Las «mermas» de noviembre (S/ 893) son faltantes de conteo (`ajuste` / `conteo_fisico`), que según Felipe son prendas vendidas sin registrar, no mermas. Pendiente aparte.
