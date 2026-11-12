## Recibir: corregir la categoría y la marca mientras se cuenta (2026-11-12)

- [ ] **Pegar en producción** `20261112162000_corregir_linea_al_contar.sql` (una parte, sin políticas; ANTES de publicar la web). Verificación: `select to_regprocedure('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)') is not null;`
- [ ] Decidir si el proveedor de una compra de «Mis compras» se puede corregir desde Recibir: cambia a quién se le debe la compra (dinero), así que espera el OK de Felipe.
