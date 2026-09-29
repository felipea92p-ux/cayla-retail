## 🧭 Existencias intuitiva — spike (2026-09-28) — solo maqueta, sin migración; rama `claude/inventory-module-design-d74c61`

- [x] Spike clicable en computadora y celular: `docs/maquetas/existencias-intuitiva-2026-09/spike.html` + README con el diagnóstico (8 puntos «hoy → spike»). Verificado con Chrome sin pantalla: buscar, atajos, abrir prenda, bajar 3 al piso (la celda y el aviso cambian), talla agotada → «Pedir a Arequipa», escáner, rol vendedora sin «Bajada al piso», menú «Más», y nada se sale del marco de 375 px.
- [ ] **Decide Felipe** (README, «Decisiones»): (1) ¿«Falta en el piso» reemplaza a «Por colgar»?, (2) la vista «Por talla» pasa a Análisis, (3) «Disponible total» y la comparación semanal bajan a una línea, (4) «Ver recomendaciones» y «Ver análisis de cobertura» salen de Existencias.
- [ ] Implementar en `InventarioPanel.tsx`, `ExistenciasPorPrenda.tsx`, `DetallePrendaExistencias.tsx` e `inventario/page.tsx`, con captura a 375 px y 1.440 px comparada contra el spike. Revisar las pruebas que buscan botones por texto.
- [ ] Taller (no separa piso y almacén): mini tabla de un renglón, sin «Falta en el piso». No está en el spike.
