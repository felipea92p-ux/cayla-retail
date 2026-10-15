## Marca y proveedor en el Resumen de Producción (2026-10-15)
- [x] Hoja «Ver el modelo»: la ficha (marca, proveedor, material, patrón) sube bajo las cifras; la fila de «¿Qué producir?» dice «Marca X · Proveedor Y».
- [ ] **Mirar en producción** un modelo que en Catálogo ▸ Productos tenga marca y proveedor: debe decirlos igual en la fila y en la hoja. Si dice «Sin marca»/«Sin proveedor», es un defecto de lectura de `getFichasDeModelos` (`lib/produccion-ficha-modelo.ts`).
- [ ] Correr `pnpm --filter web guias:recorrer -- --guia produccion` con datos que tengan modelos (la base local no los tiene): el paso «Marca, proveedor y material» cambió de lugar.
