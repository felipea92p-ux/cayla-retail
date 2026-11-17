# 2026-11-17 · Mis compras: los botones de «Tu última ronda»

Rama `claude/compras-envios-mejora-169ffc`. Bitácora: `docs/bitacora/2026-11-17-compras-envios-mejora-169ffc.md`.

## Esperan a Felipe

- [ ] **Verla en la pantalla real.** La tarjeta se comprobó en un banco con datos inventados: la base local no tiene rondas de compra
  (`retail.compra_rondas`: 0 filas). Falta mirarla en Compras ▸ Mis compras con una ronda cerrada de verdad, en un celular.

## Sin decisión

- [ ] **«Mis envíos» sale dos veces con la ronda cerrada:** arriba, en la cabecera de la pantalla (`<BotonVer>`, con flecha;
  `app/(app)/compras/mi-plata/page.tsx`), y en la tarjeta «Tu última ronda» (ahora sin flecha). Propuesta: el de la cabecera solo cuando
  no hay tarjeta de última ronda. Cambia un control de la pantalla: pasa por `/guia` (su paso es `mi-plata.mis-envios`).
- [ ] **«Reabrir» en el celular ocupa todo el renglón** y reabre la ronda de un toque, sin preguntar (ADR-0569: se puede volver a cerrar).
  Si llegan reaperturas sin querer, se revisa su tamaño o su lugar.
