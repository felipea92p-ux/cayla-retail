## 🏆 Proveedores: la lista de Mercadería es un ranking (2026-10-26, ADR-0521) — web + 1 migración de solo lectura; rama `claude/proveedores-maquetas-016647`

- [x] Maquetas en cinco rondas (`docs/maquetas/proveedores-2026-10` a `proveedores-v5-2026-10`); Felipe eligió la C de la v5 con el ajuste de las dos medidas.
- [x] Ranking en la pestaña Mercadería, con prendas compradas / dinero gastado, el ritmo y su filtro, y la vista rápida al tocar la fila.
- [x] Columna derecha «Lo que no se ve a simple vista» y «Comparar» hasta 3.
- [x] Ventas por día en cada fila: `fn_proveedores_ventas_diarias` (`20261026172000`) con `pnpm pruebas:proveedores-ventas-diarias`.
- [ ] **No está en producción:** pegar `supabase/migrations/20261026172000_proveedores_ventas_diarias.sql` (una parte, solo lectura, re-pegable) con el OK de Felipe, y refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`). Sin ella la web funciona, pero sin la línea de ventas.
- [ ] **Actividad 6:** la talla que se acaba y la sede que rinde, en la vista rápida y en la fila «Talla que se acaba» de la comparación. Depende de `fn_proveedor_tallas_sedes` (rama `claude/proveedores-module-analysis-c73c2c`, sin PR).
- [ ] **Sin probar con datos reales:** en local solo 2 proveedores tienen compras; el «↑ 2» al cambiar de medida, el «Ver los que faltan» (más de 20) y la comparación de 3 están cubiertos por pruebas, no vistos en pantalla.
- [ ] `/formidable` y `/abrir-pr` al cerrar la obra.
