## 🧾 Cobro en hoja lateral (2026-10-02, ADR-0306) — web + migración del QR SIN pegar; rama `claude/redesign-post-payment-ticket-6d3690`

- [x] Hoja de cobro sobre el catálogo (`HojaDeCobro.tsx`): seis medios en cuadrados (F1–F6), billetes sugeridos y vuelto, comprobante sin valor por defecto, documento en una fila, «Confirmar cobro» que dice qué falta. Probado en local a 1440 × 900 (menú abierto y cerrado): sin scroll ni texto cortado; venta real de prueba B001-000002 (Yape + efectivo con vuelto) registrada desde el botón de la hoja.
- [x] Celular (PL-105): la hoja va dentro de la hoja del ticket; probado a 375 px sin desborde horizontal.
- [x] Lógica pura con pruebas: `montosSugeridos`, «el resto» con 3+ medios (`pagosTrasEditarMonto`), F1–F6 (`metodoDeAtajo`), «Elige el comprobante.» (`motivoBloqueoCobro`).
- [x] QR en la web solo si la base lo acepta (`fn_acepta_pago_qr`); en Caja va en el grupo digital; color `--color-metodo-qr`.
- [ ] **Pegar en producción** `supabase/migrations/20261002120000_venta_pagos_qr.sql`, en sus dos partes por separado. Hasta entonces la hoja muestra cinco medios. Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Configurar** en cada sede la cuenta de cobro de transferencia si no existe: el QR se sella en ella.
- [ ] **Decidir** si la búsqueda por Nº de operación de Ventas ▸ Historial (ADR-0230) se retira, ahora que la caja ya no lo pide.
- [ ] **Sin probar:** un cobro real con QR (requiere la migración aplicada); el lector de código de barras con la hoja abierta en tienda.
- [ ] Guía de foco: la hoja tiene la suya (pasos con ✓, «Sigue aquí», motivo en el botón) pero no usa las piezas `useGuiaCampos`/`CampoGuiado`; `/vender` sigue `pendiente` en `lib/guia-de-foco-pantallas.ts`.
