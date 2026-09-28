## 🛒 Punto de venta más amigable — spike de calidez y distribución (2026-09-28) — solo docs, sin código ni migración; rama `claude/pos-visual-redesign-c14ace`

- [x] `docs/maquetas/punto-venta-amigable-2026-09/` (`punto-venta-amigable.html` + `README.md`): 7 cambios de calidez/distribución sobre la pantalla real (verificada contra `origin/main` `59dad776`), no sobre el spike viejo `punto-venta-ticket-alto-2026-09` que ya estaba desfasado.
- [ ] **Esperar el OK de Felipe** sobre los 7 cambios (se pueden aprobar por separado — ninguno depende de otro).
- [ ] Si se aprueba: llevar a `PuntoDeVentaTicket.tsx` (miniatura por línea, superficie `papel`, costura, ticket vacío con ícono), `PuntoDeVenta.tsx` (cabecera agrupada, pulso al agregar) y `PuntoDeVentaCatalogo.tsx` (desvanecido en categorías) — sin migración, ninguno de los 7 pide dato nuevo.
