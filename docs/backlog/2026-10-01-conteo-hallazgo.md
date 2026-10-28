## 🔎 La prenda que faltó y apareció, enlazada a su conteo (2026-10-01, ADR-0291) — migración `20261001120000` sin aplicar en producción; rama `claude/conteo-hallazgo`

- [x] Migración: `fn_faltantes_de_conteo`, `registrar_hallazgo_de_conteo`, `ajustar_inventario` con `conteo_item_id` opcional y `fn_conteo_lineas_json` con `hallazgos`. Probada en local con ROLLBACK (flujo feliz + 5 rechazos).
- [x] Web: pregunta en «Ajustar inventario», reglas puras con pruebas, etiqueta en Movimientos y «✓ La encontraron después» en el resultado del conteo. Suite web, `tsc` y eslint en verde.
- [ ] **POR PEGAR (2026-10-01):** `supabase/migrations/20261001120000_conteo_hallazgo_por_ajuste.sql`, una sola parte, después de `20260930050100` (esa también debe estar pegada). Sin ella la web no se cae: no pregunta.
- [ ] **Sin ver en el navegador:** con la migración aplicada, repetir: conteo con «falta 1» → cerrar → Existencias ▸ Ajustar ▸ sumar 1 → debe preguntar → «Sí» → el resultado del conteo dice «✓ La encontraron después».
- [ ] **Sin decidir:** una prenda con faltas en varios conteos pregunta solo por el más reciente.
