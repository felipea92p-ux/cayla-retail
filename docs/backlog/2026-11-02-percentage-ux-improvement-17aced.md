## El descuento de Vender como hoja lateral (2026-11-02) — hecho, falta verlo con una cuenta real
Rama `claude/percentage-ux-improvement-17aced`. Maqueta: `docs/maquetas/descuento-hoja-2026-11/`. Felipe eligió «A · Hoja lateral».
- [x] Maqueta de tres caras y elección de Felipe.
- [x] `lib/descuento-cuenta-reglas.ts` (+ prueba): la cuenta del descuento sale del ticket y la usan la hoja y el ticket del celular.
- [x] `HojaDeDescuento` + `PanelDescuento` (tres pasos, mismas reglas) y estilos de vidrio en `vidrio/vender.css`; el ticket queda quieto (`inert`) con la hoja abierta.
- [x] Guía de Vender: texto del paso del pie al día; huella de controles aceptada (196).
- [x] Escenarios del auditor de tema: `vender.descuento` y `vender.m-descuento` (sin correr: piden sesión y base local).
- [ ] **Verlo en `/vender` con una cuenta real** (escritorio y 375 px): abrir «Aplicar descuento», aplicar un % y un monto, «Cambiar», «Quitar descuento», Esc, el velo y que el ticket de atrás no responda. Cómo verificas: aplicar 10 % a dos prendas deja el mismo «Total» que antes de este cambio.
- [ ] `pnpm --filter web tema:auditar -- --cuenta <vendedora> --ruta /vender --escenarios` (claro y oscuro) y mirar las capturas.
- [ ] `/formidable` de la hoja y `/chaos` (doble clic en «Aplicar», recargar a mitad, dos pestañas).
- [ ] Decidir si la guía interactiva de Vender gana un paso propio para el descuento (hoy no lo tenía; abrir la hoja desde la demo no guarda nada).
- [ ] Decisión de Felipe, aún abierta: el motivo conserva sus palabras largas («Cumpleaños cliente top») como en esta hoja, o se acortan.
