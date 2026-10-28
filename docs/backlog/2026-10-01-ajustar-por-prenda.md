## ✅ «Ajustar» con el mismo lenguaje que «Reponer» y «Subir a almacén» (2026-10-01, ADR-0300 act. b) — solo web, sin migración; rama `claude/ajustar-por-prenda`

- [x] `AjustarInventarioModal` + `SelectorDeAjuste` (nuevo) + `lib/ajuste-reglas.ts` (textos sin códigos, pasos de los botones, topes; pruebas al día). Guía de foco `aplicada` (una deuda menos).
- [ ] **Sin ver en producción** hasta fusionar: con una prenda con apartadas, el «−» debe detenerse en lo libre y el modo «Conteo físico» pedir contarlas.
- [ ] **No se revisó el celular** (a pedido de Felipe): las filas reutilizan las clases de «Reponer», pero no se midió a 375 px.
- [ ] La ficha de Producto (hoy `ProductoForm`; `AjusteDeStock` se borró sin uso el 2026-10-06) abre esta misma ventana sin el puntito de color (solo conoce el nombre del color): se ve igual, sin el puntito.
