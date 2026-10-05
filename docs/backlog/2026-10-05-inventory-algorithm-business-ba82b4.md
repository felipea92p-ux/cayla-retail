## 🧠 Motor de demanda (2026-10-05) — investigación y diseño, sin código; rama `claude/inventory-algorithm-business-ba82b4`

Diseño: `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`. Cada etapa se abre por una condición de los datos, no por fecha.

- [x] Investigación (empresas con fuentes, mapa del código, datos de producción) y decisiones de Felipe (umbral 90 %, sin historia, deciden los tres).
- [ ] **Etapa 0 — La verdad:** indicador por sede «¿el motor puede hablar aquí?» (% venta identificada en 14 días, piso cuadrado, censo). Cargar el stock de AQP y LIM.
- [ ] **Etapa 1 — Una sola cifra:** `fn_demanda_*` (ventas + venta perdida ÷ días con la talla expuesta) y agrupación categoría × talla × familia de color × sede (peso n/(n+k)); piso, Análisis y Frescura leen de ahí. Se abre con ≥ 90 % de venta identificada durante 14 días en la sede.
- [ ] **Etapa 2 — Lo huérfano a la vista:** talla rota en Existencias; traslados sugeridos con cantidad (`planDeReposicion`, `cedibleDe`); «Se vendió rápido y falta» (`piso-plan.ts:459`) en Producción.
- [ ] **Etapa 3 — Probar y repetir con el Taller:** lectura a 14 días de cada lote contra su categoría.
- [ ] **Etapa 4 — Compras por campaña:** presupuesto por categoría y cantidad por cuantil crítico. Espera una temporada completa (no hay historia fuera del ERP).
- [ ] **Diciembre 2026:** hoja de supuestos por categoría para la compra, y comparación con lo real en enero.
- [ ] **Etapa 5 — Rebajas por grupo:** una elasticidad por categoría, después de una liquidación registrada.
