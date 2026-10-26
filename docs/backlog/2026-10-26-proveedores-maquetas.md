## 🏆 Proveedores: la lista de Mercadería es un ranking (2026-10-26, ADR-0521) — web + 1 migración de solo lectura; rama `claude/proveedores-maquetas-016647`

- [x] Maquetas en cinco rondas (`docs/maquetas/proveedores-2026-10` a `proveedores-v5-2026-10`); Felipe eligió la C de la v5 con el ajuste de las dos medidas.
- [x] Ranking en la pestaña Mercadería, con prendas compradas / dinero gastado, el ritmo y su filtro, y la vista rápida al tocar la fila.
- [x] Columna derecha «Lo que no se ve a simple vista» y «Comparar» hasta 3.
- [x] Ventas por día en cada fila: `fn_proveedores_ventas_diarias` (`20261026172000`) con `pnpm pruebas:proveedores-ventas-diarias`.
- [x] `20261026172000_proveedores_ventas_diarias.sql` en producción (2026-10-26, aplicada como `20261026202433`).
- [x] **Actividad 6:** mezclada la rama de tallas y sedes; la vista rápida dice «Tallas y sedes» y la comparación, «Talla que pide más» y «La tienda que más vende».
- [ ] **Sin probar con datos reales:** en local solo 2 proveedores tienen compras; el «↑ 2» al cambiar de medida, el «Ver los que faltan» (más de 20) y la comparación de 3 están cubiertos por pruebas, no vistos en pantalla.
- [x] `/formidable` corrido (`docs/formidable/compras-proveedores.md`): leyes 6,1 · oficio 7; **los 3 cambios hechos con el OK de Felipe** (leyes ≈ 6,9 provisional · oficio 8). Contraste claro/oscuro: 0 hallazgos en 5 estados.
- [ ] Repetir la prueba ciega sobre la pantalla nueva; la lista aparte del informe (la línea de ventas sin marcar «esta semana», los conteos que incluyen al Taller, el scroll de la columna que arrastra la página, el enlace «Le debes» de 20 px) espera que Felipe la mande.
- [x] **Ventas contadas dos veces:** `fn_proveedor_reparto` (`20261026194000`) reparte ventas, plata y stock entre los proveedores de una variante; las tres funciones leen de ella. `pnpm pruebas:proveedor-reparto` en el CI.
- [x] **La regla del reparto:** Felipe eligió la B (por lo que había llegado de cada proveedor a la fecha de cada venta), entre A y C.
- [x] **En producción (2026-10-26, «Pégalas tú»):** las tres, en orden, por el MCP (`apply_migration`: versiones `20261026202433`, `…202502` y `…202626`). Comprobado solo leyendo: «Lo que le compré» igual que antes (335 filas, 981 vendidas, 2.495 en stock), la suma cuadra, permisos bien, 182 ms.
- [ ] Refrescar el volcado del diccionario (`docs/datos/generado/COMO-REFRESCAR.md`) para que `datos:comparar` conozca las tres funciones.
- [ ] `/abrir-pr` al cerrar la obra.
