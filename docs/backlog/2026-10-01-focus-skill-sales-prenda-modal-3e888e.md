## 🧭 Focus en Ventas: «Prenda sin registrar» (2026-10-01, ADR-0179 y ADR-0284 act. i) — solo web, sin migración; rama `claude/focus-skill-sales-prenda-modal-3e888e`

- [x] Modal rediseñado (maqueta C «Etiqueta en vivo»): etiqueta provisional, íconos por prefijo, tallas solo de la categoría (habituales, otras, «Estándar», «Única» sola), guía de foco y animaciones de respuesta. Verificado en local, escritorio y 375 px.
- [ ] **Sin ver en producción** hasta fusionar: abrir el modal en una sede, probar Vestidos → Pantalones → Aretes y agregar una prenda al ticket.
- [ ] **Dato de producción:** «Pantalones» tiene la talla 44 en `categoria_tallas` junto a 26–34. ¿Error de carga? Lo decide Felipe.
- [ ] **Sigue `/focus /vender`:** la pantalla, `PuntoDeVentaTicket` (12 controles), `CerrarCajaModalV2` (10), `Esperas` (2); `PuntoDeVenta` (1 control) candidato a `no-aplica`. Después, el resto de Ventas (Apartados, Caja, Historial, Posventa, Comprobantes).
