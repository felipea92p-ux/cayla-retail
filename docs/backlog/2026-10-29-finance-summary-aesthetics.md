# Finanzas ▸ Resumen pulido — lo que falta

- [ ] Verificar la pantalla real (no la de prueba) con una cuenta de líder y datos de producción: reparto CAYLA/CLAURE, lista de deudas, anillo y caja con el mínimo.
- [ ] Correr `pnpm --filter web tema:auditar` sobre `/finanzas/resumen` (claro y oscuro) y mirar las capturas.
- [ ] «¿Ya pagaste el mes?» y «Contra el mes pasado» (lo que más se movió): la maqueta los resumía en dos filas; en código siguen como estaban. Decidir si se simplifican.
- [ ] Reservar y escribir el ADR de esta decisión (`pnpm reservar adr`) y actualizar `docs/ARQUITECTURA.md` (se fue `RecorridoPlata` y `DeCadaCien`; entraron `AdondeVaLaPlata` y `VendidoPorSede`).
- [ ] `pnpm knip` en el CI: no se pudo correr en este worktree (sin dependencias); revisar que no marque piezas sin uso.
