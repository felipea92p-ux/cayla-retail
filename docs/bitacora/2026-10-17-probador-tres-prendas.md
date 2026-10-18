# 2026-10-17 · El armador acepta máximo 3 prendas (ADR-0444)

- **Qué:** una sola regla compartida (`zonaDelProbador`): arriba —con casacas, blazers, chalecos y abrigos—, abajo y bolso; ya no entran vestidos, enterizos, conjuntos ni capas. El ERP cambia solo y sus textos y su guía se ajustaron.
- **Por qué:** Felipe pidió «máximo 3 prendas» (una de arriba, el pantalón y la cartera) y que el probador no acepte vestidos ni prendas por encima; con prendas apiladas la figura se amontonaba.
- **Verificado:** `tsc` de web y tienda, `pnpm knip`, 556 pruebas de la web y 530 de la tienda. **No verificado:** el probador en pantalla ni cuántas prendas salen y entran (la consulta a producción se cortó).
