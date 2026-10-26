## 🧵 Ficha de consumo del modelo: una hoja, tres puertas (2026-10-26, ADR-0513) — web + 4 migraciones pegadas en producción (26-oct, Felipe); rama `claude/magical-kalam-2f3b54`

- [x] Maquetas A/B/C y recomendación (`docs/maquetas/consumo-modelo-2026-10/`); Felipe: «ok hazlo» con los valores por defecto.
- [x] Base: `20261026150000` (lo medido no pisa lo declarado), `151000` (tela por talla), `152000` (avíos del modelo), `153000` (ficha, lectura y «volver a lo declarado»). Pruebas en Postgres con mutación.
- [x] Web: `FichaDeConsumoHoja` con sus tres puertas, historial de órdenes y «Volver a Audaces»; guías y huellas al día.
- [x] **Las 4 migraciones se pegaron en producción** el 2026-10-26 (Felipe), en orden. Producción tenía 0 órdenes cerradas con fases: no había datos que migrar.
- [ ] Al pegar: `pnpm datos:generar:produccion` (`producto_avios` y `producto_consumo_medido` no están en el diccionario hasta que estén en producción) y `pnpm datos:comparar`.
- [ ] `/formidable` de la hoja (agente ciego + colaboradoras reales) y `/chaos` completo; aquí solo doble clic y edición simultánea.
- [ ] Decidir el avío por talla (una etiqueta de la S y otra de la M): hoy son dos avíos de Insumos.
- [ ] La guía recorrida (`guias:recorrer`) de `produccion.ordenes` ya fallaba antes en el paso «Lo demás ya viene resuelto»: no es de esta rama.
