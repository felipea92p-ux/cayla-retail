## 🧩 Unificar: una función, una pieza (2026-10-06, ADR-0354) — solo herramientas y docs, sin migración; rama `claude/unificar-componentes-skill-7e9d26`

- [x] Skill `/unificar` (`.claude/skills/unificar/`: método, criterio, propuesta, decisión, informe).
- [x] Motor `apps/web/unificar/` (`pnpm --filter web unificar:censo`, `--lamina`, `unificar:deuda`): censo de 40 familias, huella con tokens, capturas ×2, lámina con propuesta en claro y oscuro, comparativas por familia. Probado contra el ERP local (77 pantallas + 37 modales de Inventario).
- [x] Regla «Una función, una pieza» en `CLAUDE.md` con su tabla «Piezas únicas» (vacía) y `lib/unificar.test.ts` (22 casos de función + candado de deuda, probado con una decisión simulada).
- [x] Perfiles nuevos en `.claude/launch.json`: `cayla-retail-dev-libre` (puerto libre, para tener varias worktrees levantadas) y `unificar-laminas`.
- [ ] **Felipe elige** las primeras familias. Propuesta de ejemplo esperando: `accion.volver`.
- [ ] Correr `/unificar` módulo por módulo (empezar por el mostrador: Vender, Caja, Cambios, Devoluciones) y con más cuentas (`terminal-ventas`, `integrante`): hoy el censo es solo de la cuenta Admin.
- [ ] Escenarios: el censo ve los modales que el auditor de tema sabe abrir (unos 190). Los que no tienen escenario quedan en «No cubierto» del informe.
- [ ] **Sin probar:** que la prueba del CI atrape una variante a mano con una decisión real (solo se probó con una simulada).
