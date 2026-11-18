## Recibir: corregir la categoría y la marca mientras se cuenta (2026-11-12)

- [x] **Pegada en producción el 2026-11-12** `20261112162000_corregir_linea_al_contar.sql` (huella SHA-256 del editor igual a la del archivo; verificada: existe, `authenticated` sí, `anon` no, `security definer`). Verificación: `select to_regprocedure('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)') is not null;`
- [ ] Decidir si el proveedor de una compra de «Mis compras» se puede corregir desde Recibir: cambia a quién se le debe la compra (dinero), así que espera el OK de Felipe.
