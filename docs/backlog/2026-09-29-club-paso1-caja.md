## 🌸 Club, paso 1 · Caja (ADR-0288) — diseño aprobado, sin construir; rama `claude/club-paso1-caja`

- [ ] **1a:** venta ligada (`p_cliente_id` desde Cobrar y la cola sin conexión); `clientas.documento_tipo` +
      `documento_numero` (renombra `dni`; 7 funciones reescritas desde producción); las ventas anteriores se ligan
      al registrarse.
- [ ] **1b:** `unirse_al_club`, `club_permisos` (append-only, con `origen`), `club_textos` v1 sembrado,
      `club_desde`; la tarjeta de socia con `resumen_clienta_caja`; los permisos marcados en caja pasan a legado.
- [ ] **1c:** cumpleaños con `p_canjear_cumpleanos`, `club_canjes` (único por año), cascada sobre toda la
      compra, `configuracion_empresa.club_cumple_pct`, apagado sin conexión, anular libera el canje.
- [ ] **1d:** `venta_items.es_regalo` (y `deducirTallas` lo salta); `pedidos_no_atendidos.motivo/razon`, con
      «se probó y no llevó» al quitar una prenda del ticket.
- [ ] **1e:** comprobantes con `carne_extranjeria`/`pasaporte` («4»/«7» en Lucode). OK de Felipe dado;
      falta la boleta real de prueba.
- [ ] **Bot de WhatsApp (pedido de Felipe, 2026-09-29):** ADR propio con el paso 3; reemplaza D-106.
- Cómo verificas: la tabla «Pasos verificables» del ADR-0288; todo a 375 px (PL-105).
