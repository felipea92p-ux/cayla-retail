## 🧾 Cobro en hoja lateral (2026-10-02, ADR-0306) — web + migración del QR APLICADA en producción; rama `claude/redesign-post-payment-ticket-6d3690`

- [x] Hoja de cobro sobre el catálogo (`HojaDeCobro.tsx`): seis medios en cuadrados (F1–F6), billetes sugeridos y vuelto, comprobante sin valor por defecto, documento en una fila, «Confirmar cobro» que dice qué falta. Probado en local a 1440 × 900 (menú abierto y cerrado): sin scroll ni texto cortado; venta real de prueba B001-000002 (Yape + efectivo con vuelto) registrada desde el botón de la hoja.
- [x] Celular (PL-105): la hoja va dentro de la hoja del ticket; probado a 375 px sin desborde horizontal.
- [x] Lógica pura con pruebas: `montosSugeridos`, «el resto» con 3+ medios (`pagosTrasEditarMonto`), F1–F6 (`metodoDeAtajo`), «Elige el comprobante.» (`motivoBloqueoCobro`).
- [x] QR en la web solo si la base lo acepta (`fn_acepta_pago_qr`); en Caja va en el grupo digital; color `--color-metodo-qr`.
- [x] **Migración en producción** (2026-10-02, a pedido de Felipe, `apply_migration` en dos partes): verificada (ADR-0306 §7). Se corrigió antes de aplicar: conserva el medio `'anticipo'` de los apartados.
- [ ] Refrescar el volcado de producción y correr `pnpm datos:generar:produccion` y `pnpm datos:comparar` (`docs/datos/generado/COMO-REFRESCAR.md`).
- [x] **Dónde cae el dinero del QR:** es el QR de Izipay y su abono llega aparte de las tarjetas (Felipe, 2026-10-02) → se sella en la cuenta de cobro de transferencia de la sede, en su propia línea del libro («Cobros con QR · sede»).
- [ ] **Configurar** en cada sede la cuenta de cobro de transferencia si no existe: el QR se sella en ella.
- [x] **Búsqueda por Nº de operación retirada** del buscador de Historial, Cambios y Devoluciones (Felipe, 2026-10-02); el detalle de una venta vieja sigue mostrando su número.
- [ ] **Sin probar:** un cobro real con QR en una tienda (la web publicada recién lo tendrá al fusionar esta rama); el lector de código de barras con la hoja abierta en tienda.
- [ ] Guía de foco: la hoja tiene la suya (pasos con ✓, «Sigue aquí», motivo en el botón) pero no usa las piezas `useGuiaCampos`/`CampoGuiado`; `/vender` sigue `pendiente` en `lib/guia-de-foco-pantallas.ts`.
