## 📱 La hoja del celular (2026-10-22, ADR-0479) — solo web, sin migración; rama `claude/unificar-animaciones-moviles-51e9d0`

- [x] Auditoría del teléfono y maqueta con tres formas (`docs/maquetas/hojas-movil-2026-10/`); Felipe eligió B.
- [x] 1 · La hoja viva en `<Modal>`: 51 de 51 hojas con asa; 49 se cierran con el dedo (las otras 2 estaban desplazadas: el dedo desplaza).
- [x] 2 · El ticket de Vender con el dedo; no se cierra mientras la venta se envía. Vender, Cambios, Devoluciones y Apartados a 375 px.
- [x] 3 · Lo de atrás se aleja y vuelve con el dedo, también con la página bajada.
- [x] 4 · Filtros de Productos y Existencias a media altura.
- [x] 5 · El cajón como hoja alta; desliza entre registros (Por pagar, Notas de crédito, Proveedores).
- [x] 6 · Familia `hoja-movil` en `/unificar` (firmas y deuda de 3), ADR-0136, ADR-0358, `CLAUDE.md`.
- [ ] **Sin probar en un iPhone real:** el arrastre, la profundidad y su fluidez solo se probaron con toque emulado en Chrome.
- [ ] 7 · Que un toque no deje nada pegado: 225 reglas `:hover` del CSS propio, solo 7 bloques con `@media (hover: hover)`.
- [ ] 8 · El aviso en el celular: su ✕ solo aparece con el mouse (`avisos.css:85`); apartarlo con el dedo; bajo la isla.
- [ ] 9 · Los márgenes del iPhone: `viewport-fit=cover` no está declarado y los 25 `env(safe-area-inset-*)` valen 0.
- [ ] 10 · Las tres capas a mano pasan a `<Modal>`: `ProveedorModal`, `FiltrosCompras`, `FiltrosRecibidas` (la deuda de `hoja-movil`).
- [ ] 11 · El menú lateral se cierra deslizando.
- [ ] 12 · Una sola barra de abajo: 8 formas; pasa por `/unificar` y Felipe elige mirando.
- [ ] 13 · (Fuera por ahora, decisión de Felipe) Listas largas como hoja en el celular.
