
## 🎨 El texto en tres tonos (2026-11-23, ADR-0694) — solo web, sin migración; rama `claude/texto-en-tres-tonos`

- [x] Tokens `secundario` (tinta 80 %) y `tenue` (64 %) en `globals.css` y `.papel-fijo`; `taupe-profundo` = `secundario`; la traducción de
  `text-tinta/35`…`/85` y `text-taupe` en `tema.css`. Prueba: `lib/tema-tokens.test.ts` (los tres tonos, sus clases y su contraste).
- [x] Verificado en el navegador con el medidor de `/color`: Compras, Movimientos y Ventas, claro y oscuro, iguales a la foto B de la lámina
  (`docs/milimetro/auditorias/2026-11-23-texto-en-tres-tonos.md`).
- [ ] **El texto a mano en los CSS** (`color: var(--color-taupe)`, 319 líneas; `color-mix(…tinta N%…)`): pasarlo a `var(--color-secundario)`
  o `var(--color-tenue)` al tocar cada archivo. Si se quiere de una vez, un barrido con su lámina antes (es café que hoy se ve).
- [ ] **Las líneas por opacidad** (`border-tinta/NN`, 16 escalones) y `tinta-60` (otro secundario cálido del puente shadcn): ordenarlos con el
  mismo criterio.
- [ ] **Las cifras en Inter** (Felipe eligió la B de la lámina): DM Sans no trae cifras tabulares, y hacerlo como en la lámina (solo los dígitos,
  sin tocar letras ni la Garamond) pide un archivo de Inter con solo los dígitos. Espera el OK de Felipe para bajarlo.
- [ ] **Sin probar:** 375 px (el cambio es de color, igual en todos los anchos) y Safari.
