
## 🎨 El texto en tres tonos (2026-11-23, ADR-0694) — solo web, sin migración; rama `claude/texto-en-tres-tonos`

- [x] Tokens `secundario` (tinta 80 %) y `tenue` (64 %) en `globals.css` y `.papel-fijo`; `taupe-profundo` = `secundario`; la traducción de
  `text-tinta/35`…`/85` y `text-taupe` en `tema.css`. Prueba: `lib/tema-tokens.test.ts` (los tres tonos, sus clases y su contraste).
- [x] Verificado en el navegador con el medidor de `/color`: Compras, Movimientos y Ventas, claro y oscuro, iguales a la foto B de la lámina
  (`docs/milimetro/auditorias/2026-11-23-texto-en-tres-tonos.md`).
- [ ] **El texto a mano en los CSS** (`color: var(--color-taupe)`, 319 líneas; `color-mix(…tinta N%…)`): pasarlo a `var(--color-secundario)`
  o `var(--color-tenue)` al tocar cada archivo. Si se quiere de una vez, un barrido con su lámina antes (es café que hoy se ve).
- [ ] **Las líneas por opacidad** (`border-tinta/NN`, 16 escalones) y `tinta-60` (otro secundario cálido del puente shadcn): ordenarlos con el
  mismo criterio.
- [x] **Las cifras en Inter** (Felipe eligió la B de la lámina y dio el OK para bajar el archivo): `app/fuentes/inter-cifras.woff2` (Inter
  recortada a 0–9, 7 KB, licencia OFL al lado) delante de DM Sans en `--font-sans`. Medido en 38 pantallas a 1440 px y 5 a 375 px: ningún
  texto con dígitos se corta, desborda ni baja de línea, salvo el N.° de documento de Compras, que ya no cabía con un número lleno de ceros
  y pasó de 7,5 a 8 rem. Prueba: `lib/cifras-en-inter.test.ts`.
- [ ] **Las cifras en una columna que no pide `tabular-nums`**: alinean solo donde la celda lo pide (clase `tabular-nums` o su CSS). Una
  columna de montos que no alinee se arregla poniéndoselo, no cambiando la letra.
- [ ] **Sin probar:** Safari (los tonos y las cifras; Chrome sí, en claro, oscuro y a 375 px las cifras).
