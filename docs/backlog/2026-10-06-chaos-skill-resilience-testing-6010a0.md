## 🐒 `/chaos` (2026-10-06, ADR-0356) — solo skill y scripts, sin migración y sin cambios en la web; rama `claude/chaos-skill-resilience-testing-6010a0`

- [x] `scripts/chaos/invariantes.mjs`: 12 invariantes (stock↔movimientos, venta↔pagos, venta↔salidas, caja, comprobantes, traslados, asientos, 2 sospechas
      de doble clic), `--guardar/--contra`, `--autoprueba` (9 de 12 comprobadas y vivas; 3 no se pueden corromper y lo dicen).
- [x] `scripts/chaos/catalogo.mjs`: 69 ataques, 8 familias, valores hostiles por tipo, plan por semilla. 30 pruebas en verde, en el CI.
- [x] Skill `.claude/skills/chaos/SKILL.md`, regla `CLAUDE.md` «Caos», casilla del PR, tablero `docs/chaos/README.md`.
- [ ] **Primera corrida real de `/chaos` sobre una pantalla** (propuesta: Vender, o Ajustar inventario, que es de gravedad 1). La skill nunca se ha
      ejecutado de punta a punta con el navegador; los pasos de la Fase 3 (parchear `fetch`, doble clic por `javascript_tool`) están escritos pero sin probar.
- [ ] **Prueba de CI que haga «obligatoria» la regla** (como `lib/guia-de-foco.test.ts`: un registro de pantallas que guardan y su estado). Hoy es
      regla de `CLAUDE.md` + tablero + casilla del PR, es decir, costumbre.
- [ ] **Concurrencia de dos cuentas en el navegador:** dos pestañas comparten cookies; hoy se hace por la base o queda «no cubierto». Estudiar un segundo contexto de navegador.
- [ ] **Investigar `INV-10`:** 3 movimientos de traslado del 2026-10-03 en la base local sin `usuario_id` (ids `8f2c1ecd…`, `7de8726e…`, `76d40b2c…`).
      Mirar qué función de traslado los escribió sin firma; si es el código de hoy, es un hueco del principio de «todo movimiento lo firma una persona».
- [ ] Probar `--autoprueba` de INV-09, INV-10 e INV-12 por otro camino (hoy dicen «sin autoprueba»; la inmutabilidad de `movimientos` lo impide).
- [ ] Sumar a `scripts/chaos/` un escáner que mapee los archivos cambiados a pantallas que **guardan** (como `scripts/focus/escanear.mjs`) para que la skill
      sin argumentos sepa qué atacar.
