## Tickets compartidos: del piso a la caja (ADR-0701, 2026-11-24)

- [x] Base: `retail.tickets_compartidos` + `enviar_ticket_a_caja`, `fn_tickets_compartidos`, `tomar_ticket_compartido`, `descartar_ticket_compartido`, `marcar_ticket_compartido_cobrado` (27 casos en `pnpm pruebas:tickets-compartidos`).
- [x] Vender: «Mandar a la caja», «Del piso» (lista, chip y hoja), descartar, hoja de cierre y la venta anotada. Es el camino (b) que `docs/backlog/2026-11-24-mobile-sales-flow-31a365.md` dejaba para decidir.
- [ ] **POR PEGAR** en producción: `supabase/migrations/20261124172000_tickets_compartidos.sql` (una sola parte, a cualquier hora). Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar` para que la tabla entre al diccionario.
- [x] `/chaos` de Vender (mandar, abrir, descartar), `/milimetro auditar /vender`, `/focus`, `/formidable`. Los dos hallazgos de `/chaos` (g2 respuesta perdida al abrir, g4 triple clic) cerrados en el mismo PR.
- [ ] Sin correr: `pnpm --filter web tema:auditar` (modo oscuro de «Del piso» y del chip) y `guias:recorrer`.
- [ ] Una caja que recarga justo tras una apertura perdida deja el ticket tomado sin venta (la apertura vivía en la pestaña): medir con «tomado y sin `venta_id` a la hora» antes de guardarla en el navegador.
- [ ] Una venta cobrada desde la cola sin conexión no anota su ticket del piso (queda sin `venta_id`): medir cuántas pasan antes de arreglarlo.
- [ ] En TRU: dejar la encargada fija en la caja de 11:00 a 19:00 y la estación de entrega aparte (decisión de piso, no de sistema).
