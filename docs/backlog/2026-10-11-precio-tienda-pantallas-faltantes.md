## Precio de tienda en las pantallas que faltaban (2026-10-11, rama `claude/precio-tienda-pantallas-faltantes`)

- [x] **Producción ▸ margen:** decidido por Felipe el 2026-10-11 (el precio más bajo de cualquier tienda) y hecho en `claude/precio-tienda-produccion` (ver `2026-10-11-precio-tienda-produccion.md`).
- [ ] La tarjeta «Nuevo en el catálogo» muestra «Sin precio» para una bolsa de obsequio de S/ 0.00 (ADR-0377 permite el 0): `inicio-almacen-reglas.ts` filtra `p > 0`. No es de este cambio; decide Felipe si un 0 debe verse «S/ 0.00».
- [ ] `getPreciosPorSede` no pagina: `fn_precios_en_sede` devuelve una fila por variante con precio distinto, y PostgREST corta en 1.000. Hoy son ~25 filas; pasado el tope, la pantalla vuelve en silencio al precio de la prenda (le pasa igual a Existencias, Vender y Buscar).
- [ ] **No se probó en el navegador ni con SQL local:** Docker estaba apagado en esta Mac al hacer este PR. Cubre el CI («Pruebas de RPC contra Postgres») y las 157.208 pruebas de vitest; la verificación visual (TRU con precio propio en Almacén, Análisis, Dañadas y el aviso de una campaña) queda para quien abra el PR.
