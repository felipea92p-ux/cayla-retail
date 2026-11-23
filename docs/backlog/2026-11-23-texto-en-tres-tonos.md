
## 🎨 El texto en tres tonos (2026-11-23, ADR-0694) — solo web, sin migración; rama `claude/texto-en-tres-tonos`

- [x] Tokens `secundario` (tinta 80 %) y `tenue` (64 %) en `globals.css` y `.papel-fijo`; `taupe-profundo` = `secundario`; la traducción de
  `text-tinta/35`…`/85` y `text-taupe` en `tema.css`. Prueba: `lib/tema-tokens.test.ts` (los tres tonos, sus clases y su contraste).
- [x] Verificado en el navegador con el medidor de `/color`: Compras, Movimientos y Ventas, claro y oscuro, iguales a la foto B de la lámina
  (`docs/milimetro/auditorias/2026-11-23-texto-en-tres-tonos.md`).
- [ ] **El texto a mano en los CSS** (`color: var(--color-taupe)`, 319 líneas; `color-mix(…tinta N%…)`): pasarlo a `var(--color-secundario)`
  o `var(--color-tenue)` al tocar cada archivo. Si se quiere de una vez, un barrido con su lámina antes (es café que hoy se ve).
- [ ] **Las líneas por opacidad** (`border-tinta/NN`, 16 escalones) y `tinta-60` (otro secundario cálido del puente shadcn): ordenarlos con el
  mismo criterio.
- [x] **Las cifras en Inter** (Felipe eligió la B de la lámina): las trajo ADR-0691 a `main` el mismo día; el commit de esta rama que las hacía
  se revirtió. Sobre su letra, el N.° de documento de Historial de compras se partía en dos líneas: la columna pasó de 7,5 a 8,5 rem.
- [ ] **Sin probar:** 375 px (el cambio es de color, igual en todos los anchos) y Safari.
- [ ] **`ayuda-cabecera.css` tiene un texto de 10,5 px** (la etiqueta del globo), bajo el piso de 13 px de ADR-0691: no es de esta rama, queda anotado.
