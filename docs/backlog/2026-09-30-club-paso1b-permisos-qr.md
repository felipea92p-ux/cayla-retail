## 🌸 Club, tanda 1b · permisos, código, QR y camino B (ADR-0288) — rama `claude/club-paso1b-permisos-qr`; migración `20260930200000` + `200100` **SIN pegar**

- [ ] **Felipe:** pegar `20260930200000_club_paso1b_parte1_whatsapp_tienda.sql` SOLA, después
      `20260930200100_club_paso1b_parte2_permisos_y_qr.sql` SOLA, y fusionar el PR. La verificación va en el PR.
- [ ] Cargar el WhatsApp de cada tienda en Configuración ▸ Tiendas y caja (sin número no hay QR) e imprimir el cartel
      en `/clientas/cartel`.
- [ ] Después de pegar: refrescar el diccionario (`pnpm datos:generar:produccion` con el volcado fresco).
- [ ] Historia del permiso, «su sede», frecuentes y preferencias en `/clientas`: van en la tanda 1f (rama `claude/club-paso1f-lista-y-ficha`).
- [x] Una sola regla del cumpleaños (`lib/club-cumple-reglas.ts`), la estricta, para Cobrar y `/clientas`.
- [ ] **Felipe:** ¿el descuento por prenda sigue tocando el precio (hoy) o se quita como en el spike y queda solo «Aplicar descuento»?
- [ ] El QR del ticket impreso sigue con el camino A (WhatsApp): decidir si pasa a B.
- Siguiente: tanda 1c (cumpleaños con candado), 1d (regalo, «se probó y no llevó»), 1e (boleta con carné y pasaporte).
- Cómo verificas: el recorrido a 375 px del PR; `pnpm pruebas:club-permisos`.
