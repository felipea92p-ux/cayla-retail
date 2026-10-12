## 🧹 La hoja de cobro se ajusta a cualquier pantalla (2026-10-05, ADR-0307 §8) — solo web, sin migración; rama `claude/responsive-checkout-button-b0d5bf`

- [x] **«Confirmar cobro» siempre a la vista:** cabecera y botón fuera del scroll; solo el cuerpo de los pasos scrollea (`hoja-cobro-cuerpo`).
- [x] **Adaptación por el alto de la hoja** (`container: cobro / size`): la FORMA no cambia (dos filas de tres), solo el tamaño; diseño de siempre desde
  52 rem, espacios justos y fichas que se achican bajo 52 rem; la hoja angosta usa billetes en una línea hasta 80 rem; sin cabecera bajo 40 rem.
  Medido a 13 tamaños (ADR-0307 §8).
- [ ] **Ver con los ojos de Felipe la hoja a ~817 px de alto** (su monitor): debe verse como antes, con las fichas grandes. Verificado con una maqueta
  calibrada contra la hoja real, no con la hoja abierta a esa altura.
- [x] **Candado:** `lib/hoja-de-cobro-ajuste.test.ts` (sin `overflow-y-auto` en la hoja, botón fuera del cuerpo, contenedor `cobro`, sin utilidades que
  le ganen a la compactación).
- [x] **Lo recibido en efectivo en color** (exacto en verde con ✓ y monto, falta en rojo): `lecturaDelRecibido` + prueba; ADR-0307 §9.
- [ ] **Decisión de Felipe — plegar el menú lateral mientras el cobro está abierto:** daría ~190 px más a la hoja (a 1280 px llegaría a su tope y se vería
  como el diseño grande). Hoy plegar es una preferencia de la persona (`lateralPlegado`, cookie) y esto toca el `AppShell` de todos los módulos. No se hizo.
- [ ] **Decisión de Felipe — laptop angosto y bajo (1280 × 650, menú abierto) con efectivo + boleta + documento completo:** scrollea ~120 px solo
  para llegar al documento (el botón no se mueve y el documento sube solo al elegir el comprobante). Evitarlo pide esconder el nombre y el celular
  (opcionales) tras un «+ Datos del cliente»: cambia qué se ve al cobrar. No se tocó.
- [ ] **Probar con una cajera en el laptop real** (Felipe): las medidas salen del navegador de desarrollo, no de la caja. Si el rótulo de las fichas
  (9 % del ancho de la ficha) se lee chico en la fila de seis, subirlo es un cambio de una línea en `.hoja-cobro-nombre`.
