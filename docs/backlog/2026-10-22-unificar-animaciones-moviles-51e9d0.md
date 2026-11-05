## 📱 La hoja del celular (2026-10-22, ADR-0479) — solo web, sin migración; rama `claude/unificar-animaciones-moviles-51e9d0`

- [x] Auditoría del teléfono y maqueta con tres formas (`docs/maquetas/hojas-movil-2026-10/`); Felipe eligió B.
- [x] 1 · La hoja viva en `<Modal>`: 51 de 51 hojas con asa; 49 se cierran con el dedo (las otras 2 estaban desplazadas: el dedo desplaza).
- [x] 2 · El ticket de Vender con el dedo; no se cierra mientras la venta se envía. Vender, Cambios, Devoluciones y Apartados a 375 px.
- [x] 3 · Lo de atrás se aleja y vuelve con el dedo, también con la página bajada.
- [x] 4 · Filtros de Productos y Existencias a media altura.
- [x] 5 · El cajón como hoja alta; desliza entre registros (Por pagar, Notas de crédito, Proveedores).
- [x] 6 · Familia `hoja-movil` en `/unificar` (firmas y deuda de 3), ADR-0136, ADR-0358, `CLAUDE.md`.
- [x] Probado por Felipe en su iPhone (2026-10-23).
- [x] 7 · Que un toque no deje nada pegado: 210 reglas bajo `@media (hover: hover)`, candado `lib/hover-con-mouse.test.ts`.
- [x] 8 · El aviso en el celular: ✕ a la vista, se aparta con el dedo, el reloj se detiene al tocarlo, bajo la isla.
- [x] 9 · Los márgenes del iPhone: `viewport-fit=cover` y cabecera, lateral, contenido, barras, hojas y cajón apartados.
- [x] 10 · Las tres capas a mano pasan a `<Modal>` (`CapaDeFiltro` para las píldoras de fechas); deuda de `hoja-movil` en 0.
- [x] 11 · El menú lateral se cierra deslizando.
- [x] 12 · Una sola barra de abajo: Felipe eligió la Isla (2026-10-23); pieza `barra-abajo`, familia `barra-movil`, deuda 14 → 0.
- [ ] Las prendas marcadas de Existencias no se fotografiaron con la isla oscura (el estado no se armó desde afuera); conviene mirarlas en el celular.
- [ ] Los `sticky` con alto de cabecera escrito a mano (`top-[61px]`, `top-[3.625rem]`) no suman `env(safe-area-inset-top)`: hoy vale 0 en Safari; importaría como app de pantalla completa.
- [ ] Caja a 375 px se desborda: una tarjeta con `barras-tiempo` mide 459 px y la pantalla queda más ancha que el teléfono (medido el 2026-10-23; no es de esta rama).
- [ ] 13 · (Fuera por ahora, decisión de Felipe) Listas largas como hoja en el celular.
