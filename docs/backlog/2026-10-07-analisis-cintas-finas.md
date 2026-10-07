## 📊 Análisis: cintas finas y «Liquidar desde» sin tope (2026-10-07, ADR-0357) — rama `claude/analisis-cintas-finas`

- [x] «Qué hacer hoy» con cintas finas (A1): `grosorCamino` (s·√n, s ≤ 8), degradados, tarjeta clara, etiquetas claras, puntos chicos.
- [x] «Liquidar desde» con − y + (B1), de 1 a 999 días; el carril se alarga pasado 4 meses (`finDelEje`, `etiquetasEje`).
- [x] Migración `20261007100000_analisis_liquidar_desde_sin_tope.sql`: **EN PRODUCCIÓN** (Felipe la pegó el 2026-10-07; verificado: check
      1–999 y huella del cuerpo `c72d46a3b787ba661e5ed45feb43b4d6`; el valor guardado sigue en 30).
- [ ] Refrescar el volcado de producción (`docs/datos/generado/COMO-REFRESCAR.md`) para que el diccionario diga «1 a 999» en el comentario de
      `parametros_analisis.liquidar_desde`.
- [ ] `/formidable` y `/chaos` de Análisis (pendientes desde el 2026-10-06).
