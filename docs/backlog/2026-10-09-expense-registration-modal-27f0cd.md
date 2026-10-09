## ⚡ Gasto rápido de Caja (2026-10-09) — solo web, sin migración; rama `claude/expense-registration-modal-27f0cd` (ADR-0368)

- [x] `GastoRapidoModal` + `lib/gasto-rapido-reglas.ts` (con prueba: orden, ★, montos habituales, coma decimal, guía = `validarGasto`), cableado en `CajaAbiertaPanel` y `caja/page.tsx`; animaciones en `app/estilos/gasto-rapido.css`. Verificado en local: guardar «Baño S/ 0.80» descuenta el cajón, orden y ★ tras 9 gastos, el sello de «listo» después del loader, Otro, factura, el enlace al formulario completo y el modo oscuro.
- [ ] **Decidir (Felipe):** Baño va a «Servicios básicos». Si prefieres otra cuenta, es una línea de `CONCEPTOS`.
- [ ] **Decidir (Felipe):** «Refrigerio» (comida, café) no está: no hay categoría contable para eso. Si se paga desde el cajón, hay que decidir a qué cuenta va.
- [ ] Pasar de la hoja rápida al formulario completo NO lleva lo ya tipeado (concepto, monto). Pedirlo si molesta.
- [ ] `/formidable` y `/chaos` de la hoja nueva sin correr todavía (doble clic: el token de `registrar_gasto` ya lo cubre).
