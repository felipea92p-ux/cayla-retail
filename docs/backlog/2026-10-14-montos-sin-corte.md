## Un monto no se parte en todo el ERP (2026-10-14) — rama `claude/montos-sin-corte`

ADR-0413. Sin migración.

- [x] Todo monto que escribe la web, con el espacio que no se parte (`soles`, copias locales, plantillas, JSX); `montosSinCorte` para lo
  que llega de la base; prueba guardiana `lib/montos-sin-corte.test.ts`.
- [ ] Felipe: el texto que se guarda en la cola de Lucode (`lib/ya-emitido-reglas.ts`, `enCola`) sigue con espacio normal a propósito
  (lo de SUNAT no se toca sin ti). Si se muestra partido en «Por reintentar», se arregla al mostrarlo, no al guardarlo.
- [ ] Si aparece otro lugar que muestra un texto de la base con montos sin pasar por `traducirError` (el panel de Actividad, por ejemplo),
  pasarlo por `montosSinCorte` al dibujarlo.
