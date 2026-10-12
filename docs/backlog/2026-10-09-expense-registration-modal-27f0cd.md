## ⚡ Gasto rápido de Caja (2026-10-09) — web + 1 migración de catálogo; rama `claude/expense-registration-modal-27f0cd` (ADR-0368)

- [x] `GastoRapidoModal` + `lib/gasto-rapido-reglas.ts` (con prueba: orden, ★, montos habituales, coma decimal, guía = `validarGasto`), cableado en `CajaAbiertaPanel` y `caja/page.tsx`; animaciones en `app/estilos/gasto-rapido.css`. Verificado en local: guardar «Baño S/ 0.80» descuenta el cajón, orden y ★ tras 9 gastos, el sello de «listo» después del loader, Otro, factura, el enlace al formulario completo y el modo oscuro.
- [x] Baño va a «Servicios básicos»: confirmado por Felipe (2026-10-09).
- [x] «Refrigerio» (solo del equipo, Felipe 2026-10-09): categoría nueva «Atención al personal» → cuenta 625 (primero fue a la 62, que es la planilla: corregido por `20261010000000`).
- [x] **En producción (2026-10-09, por el MCP de Supabase, a pedido de Felipe):** `20261009235900_categoria_gasto_atencion_al_personal.sql`. Verificado: `atencion_personal | 62 | true`, `fn_categorias_gasto()` la devuelve y la versión quedó en `schema_migrations` con el número del archivo.
- [x] **`20261010000000` en producción (2026-10-09, por el MCP, OK de Felipe):** cuenta 625 creada y categoría movida; verificado `atencion_personal | 625 | Atención al personal | gastos_operacion`, versión registrada.
- [ ] Que la categoría y la cuenta 625 entren al diccionario de `docs/datos/generado/`: hace falta refrescar el volcado (`pnpm datos:refrescar`, `generado/COMO-REFRESCAR.md`) y luego `pnpm datos:generar:produccion`.
- [ ] Pasar de la hoja rápida al formulario completo NO lleva lo ya tipeado (concepto, monto). Pedirlo si molesta.
- [ ] `/formidable` y `/chaos` de la hoja nueva sin correr todavía (doble clic: el token de `registrar_gasto` ya lo cubre).
