## 🧵 Reponer / Subir prenda con todos los colores (2026-10-03) — rama `claude/inventory-bulk-color-removal-a0a942`, sin migración

- [x] «Reponer prenda» y «Subir prenda» abren el modelo entero (tabla color × talla, todo en 0, una llamada, todo o nada). ADR-0320.
- [x] Sin botón «solo este color»; sin «Poner 1 en cada talla».
- [ ] Probarlo con una cuenta real en tienda (no se probó contra producción): un modelo de 3 colores, Reponer y Subir, y un error de tope.
- [ ] Extraer la pieza común (franja de color, caja − N +, fila Total) de `MatrizCantidades`, `MatrizStockFicha` y `MatrizMover` en un solo componente.
- [ ] Más lento que la escritura: tras guardar, `router.refresh()` relee la pantalla (`fn_resumen_variantes`, ~640 ms de media en producción). Medir una bajada real antes de tocarlo.
- [ ] Propuesta C (hoja de bajada de varios modelos en un fardo) si Felipe la necesita.
- [ ] Las vistas «Bajar al piso» por pistola y el cajón de la vista «Por talla» no cambian; «Reponer prenda» en el cajón ofrece el botón según la prenda abierta (no según todo el modelo).
