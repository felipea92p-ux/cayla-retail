## 🔤 La hoja de la oferta se lee a 14 px (2026-11-13) — solo CSS, sin migración; rama `claude/ofertas-letra-14`

- [x] `.of-baj`, `.of-pequeno`, `.of-hint`, `.of-v`, `.of-falta` a 14 px y `.of-n` a 11 px (más las demás frases de `ofertas.css`).
- [ ] `EtiquetaDeCampana` (compartida con la hoja de la campaña): «En caja · 1 de 2» en 10,5 px y «Elige qué le das al cliente» (`.eqp-pct-info`) en 12–13 px. Tocarla cambia también la hoja de la campaña (ADR-0488): pasar por `/milimetro auditar` las dos.
- [ ] `.of-oracion` (paso 4): serif de 20,8 px con interlineado 1,28 en dos o tres líneas; la rampa pide 21 px.
- [ ] A 375 px, «¿En qué prendas?» desborda 23 px: la fila «Categorías · Elegir todas · Quitar todas» de `CategoriasDeCampana` no se parte. Igual con el CSS de antes.
- [ ] A 375 px, el pie: el globo de lo que falta («Elegir qué le das al cliente») tapa «Siguiente». Igual con el CSS de antes.
