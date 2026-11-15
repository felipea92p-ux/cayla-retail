## Reportes de ventas: «CAYLA y CLAURE» (ADR-0667, 2026-11-15)

- [x] **Pegado en producción el 2026-11-15:** `supabase/migrations/20261115042000_reportes_ventas_por_empresa.sql`. Verificado por el conector: md5 igual al del repo y, leída con la sesión de una líder, las cifras de Tienda LIM al céntimo (CLAURE S/ 1,953.86, CAYLA S/ 3,006.14, 71 ventas). Falta refrescar `docs/datos/generado/` con el próximo volcado.
- [ ] El tope de 186 días: el 2027-04-27 «Desde que llegó CLAURE» lo pasa y la base lo rechaza con su motivo. Antes de esa fecha, medir cuánto tarda con un año y decidir si se sube el tope o se cambia la opción por «Este año».
- [ ] Descargar el detalle (venta por venta y prenda por prenda) en Excel: no se pidió en las cinco actividades aprobadas.
- [ ] `/milimetro auditar /vender/reportes/empresas` y `/formidable` no se corrieron en esta rama.
