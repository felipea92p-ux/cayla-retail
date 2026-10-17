## 🛍️ Tienda web ▸ Pedidos: una sola navegación y «Lo que te toca» (2026-10-17, ADR-0430 act.) — solo web, sin migración; rama `claude/mockup-feedback-improvements-a3155e`

- [x] Maqueta con crítica y antes/después (`docs/maquetas/pedidos-web-2026-10/index.html`).
- [x] Las 7 mejoras construidas, con su lógica pura probada en `lib/pedidos-web-reglas.test.ts`.
- [x] El Resumen usa el mismo camino (`components/tienda-web/CaminoDePedidos.tsx`).
- [x] Guía interactiva de Pedidos al día y su huella aceptada.
- [x] Mirada en el navegador con datos de ejemplo: 1366 px claro y oscuro, 375 px.
- [ ] **Decisión de Felipe:** dar «Pedidos web» al rol «Terminal de ventas» (la Caja: ahí se cobra en efectivo y se entrega con el código). Hoy solo lo ve «Terminal Almacén».
- [ ] Mirarla con datos reales y correr `pnpm --filter web guias:recorrer` cuando la base local compartida tenga las migraciones de pedidos web (va 218 atrás).
- [ ] `/chaos` no se corrió: no cambió nada de lo que guarda (las hojas son las mismas).
