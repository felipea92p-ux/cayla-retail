## Reportes de ventas: «CAYLA y CLAURE» (ADR-0667, 2026-11-15)

- [ ] **Pegar en producción** `supabase/migrations/20261115042000_reportes_ventas_por_empresa.sql` (una parte, solo crea una función; se puede pegar dos veces) y mirar la pestaña con Tienda LIM: «Desde que llegó CLAURE» debe dar CLAURE S/ 1,953.86 y CAYLA S/ 3,006.14. Hasta entonces la pestaña dice «No se pudieron leer las ventas» y lo demás de Reportes sigue igual. No está en `docs/datos/generado/` hasta refrescar el volcado.
- [ ] El tope de 186 días: el 2027-04-27 «Desde que llegó CLAURE» lo pasa y la base lo rechaza con su motivo. Antes de esa fecha, medir cuánto tarda con un año y decidir si se sube el tope o se cambia la opción por «Este año».
- [ ] Descargar el detalle (venta por venta y prenda por prenda) en Excel: no se pidió en las cinco actividades aprobadas.
- [ ] `/milimetro auditar /vender/reportes/empresas` y `/formidable` no se corrieron en esta rama.
