## 💸 Gasto rápido de Caja con Yape o Plin (2026-10-12, ADR-0368 act. 2026-10-12) — solo web, sin migración; rama `claude/caja-yape-plin-gastos-b987a6`

- [x] «¿Cómo lo pagaste?» en la hoja (Efectivo · Yape · Plin, Efectivo de fábrica); con Yape o Plin, sin caja ni cuenta: la base sella la del medio en la tienda. Verificado: `lib/gasto-rapido-reglas.test.ts` (37 casos) y `scripts/pruebas/gastos.mjs` caso 9 contra el Postgres local (lo esperado del cajón no cambia, no hay movimiento de caja, cae en la cuenta del medio).
- [x] Guía de foco: el medio es «sugerido» (ADR-0284 act. h); textos que siguen al medio (ADR-0290); guía interactiva de Caja al día y huella aceptada.
- [x] «Gastos del turno» muestra los gastos por Yape o Plin de hoy, con su total aparte.
- [x] «Cancelar» con algo escrito preguntaba dos veces «¿Salir sin guardar?»: corregido en esta hoja.
- [x] Navegador (página de prueba sin sesión, con datos inventados): escritorio 1280, 375 px y modo oscuro; Efectivo → Yape → Plin → Efectivo cambia la bajada, el punto y la ayuda.
- [ ] **Sin probar con una cuenta real:** registrar un gasto por Yape desde `/caja` con sesión de colaboradora y ver que aparece en «Gastos del turno» y en Finanzas ▸ Gastos, y que el cierre no lo descuenta.
- [ ] **«Registrar ingreso» (`IngresoRapidoModal.tsx`) pregunta dos veces «¿Salir sin guardar?» al cancelar:** mismo patrón (`pedirAccion(cerrar)` + `onClose` que vuelve a preguntar); el arreglo es el de esta hoja (`soltar()` antes de `cerrar()`).
- [ ] Sin `/formidable` ni `/chaos` en esta pasada (el cambio no toca la regla de guardado: el mismo `validarGasto` → `registrar_gasto`).
- [ ] La base local compartida no tiene la categoría «Atención al personal» (`20261009235900`): por eso falla el caso 8 de `gastos.mjs` en local (en el CI pasa). Ajeno a este cambio.
