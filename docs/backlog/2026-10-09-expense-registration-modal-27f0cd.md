## ⚡ Gasto rápido de Caja (2026-10-09) — web + 1 migración de catálogo; rama `claude/expense-registration-modal-27f0cd` (ADR-0368)

- [x] `GastoRapidoModal` + `lib/gasto-rapido-reglas.ts` (con prueba: orden, ★, montos habituales, coma decimal, guía = `validarGasto`), cableado en `CajaAbiertaPanel` y `caja/page.tsx`; animaciones en `app/estilos/gasto-rapido.css`. Verificado en local: guardar «Baño S/ 0.80» descuenta el cajón, orden y ★ tras 9 gastos, el sello de «listo» después del loader, Otro, factura, el enlace al formulario completo y el modo oscuro.
- [ ] **Decidir (Felipe):** Baño va a «Servicios básicos». Si prefieres otra cuenta, es una línea de `CONCEPTOS`.
- [x] «Refrigerio» (solo del equipo, Felipe 2026-10-09): categoría nueva «Atención al personal» → cuenta 62. Aplicada en local.
- [ ] **POR PEGAR en producción ANTES de fusionar (2026-10-09):** `supabase/migrations/20261009235900_categoria_gasto_atencion_al_personal.sql`, una sola parte; su consulta de verificación está en el encabezado. Sin ella, «Refrigerio» falla al guardar («Elige una categoría de la lista»). Después: `pnpm datos:generar:produccion` para que entre al diccionario.
- [ ] Pasar de la hoja rápida al formulario completo NO lleva lo ya tipeado (concepto, monto). Pedirlo si molesta.
- [ ] `/formidable` y `/chaos` de la hoja nueva sin correr todavía (doble clic: el token de `registrar_gasto` ya lo cubre).
