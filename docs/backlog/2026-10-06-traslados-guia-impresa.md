## 🧾 Traslados: guía impresa con QR (2026-10-06) — solo web, sin migración; rama `claude/traslados-guia-impresa` (va después del PR #841)

- [x] Lógica pura `lib/traslados-guia-reglas.ts` (+16 pruebas): sin cantidades (prueba de invariancia), sin la nota, fechas fijas, anulada
      no se imprime, el QR con la dirección completa del pase. `llevaGuia` en `lib/traslados-pases-reglas.ts` (+ pruebas).
- [x] Pantalla `/inventario/traslados/guia/[id]` (térmica 80 mm o A4, recordado por computadora), papel `.papel-fijo`, impresión aislada.
- [x] QR «va en la caja» en el frente del pase que sale y «Guía» en su reverso.
- [x] Verificado: suite de `apps/web`, PDF de las dos hojas con Chromium y su QR leído con `jsqr` (abre el pase 294), navegador a 375, 570
      y 1440 px en claro y oscuro, auditor del tema en 0 (tres escenarios nuevos), `pnpm focus` y `pnpm sugerir` limpios.
- [ ] **Probar en la tienda** la térmica real de la caja (driver «80 mm rollo») y leer el QR con un celular desde el papel.
- [ ] **Decide Felipe:** ¿la guía lleva la nota de quien envía? Hoy no, porque puede decir cuántas van (ADR-0242, act. 2026-10-06).
- [ ] `/formidable` sobre la pantalla de la guía (obligatoria por regla; espera el OK de Felipe para sus 3 cambios).
