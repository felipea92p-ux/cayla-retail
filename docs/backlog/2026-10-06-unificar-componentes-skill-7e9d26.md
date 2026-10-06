## 🧩 Unificar: una función, una pieza (2026-10-06, ADR-0358) — solo herramientas y docs, sin migración; rama `claude/unificar-componentes-skill-7e9d26`

- [x] Skill `/unificar` (`.claude/skills/unificar/`: método, criterio, propuesta, decisión, informe).
- [x] Motor `apps/web/unificar/` (`pnpm --filter web unificar:censo`, `--lamina`, `unificar:deuda`): censo de 40 familias, huella con tokens, capturas ×2, lámina con propuesta en claro y oscuro, comparativas por familia. Probado contra el ERP local (77 pantallas + 37 modales de Inventario).
- [x] Regla «Una función, una pieza» en `CLAUDE.md` con su tabla «Piezas únicas» (vacía) y `lib/unificar.test.ts` (22 casos de función + candado de deuda, probado con una decisión simulada).
- [x] Perfiles nuevos en `.claude/launch.json`: `cayla-retail-dev-libre` (puerto libre, para tener varias worktrees levantadas) y `unificar-laminas`.
- [x] Ronda 1 decidida por Felipe (2026-10-06): Volver, Pestañas y Tarjetas de cifra; migradas en todos los módulos y registradas con deuda 0 (`docs/unificar/accion.volver.md`, `pestanas.md`, `cifra.md`).
- [x] 2026-10-07: Felipe no aprobó lo de la ronda 1 al verlo; eligió mirando (flecha redonda; vidrio en mayúsculas, píldora y caja arena; la tarjeta de Compras tal cual), aplicado y registrado.
- [ ] **Aprobación de Felipe** mirando `apps/web/unificar/.salida/fotos-despues-eleccion/comparar.html` (recuadros numerados); después, el PR.
- [ ] Las preguntas abiertas de cada registro (Finanzas pasa a `<Pestanas>`, maquetas aprobadas que se apartan, «—» o «S/ 0.00» en Producción, «← Inicio» para la cuenta sin Existencias, avisar a Dany).
- [ ] El detector del censo no ve los segmentos `forma="modo"` (no lee `aria-checked`).
- [ ] Correr `/unificar` módulo por módulo (empezar por el mostrador: Vender, Caja, Cambios, Devoluciones) y con más cuentas (`terminal-ventas`, `integrante`): hoy el censo es solo de la cuenta Admin.
- [ ] Escenarios: el censo ve los modales que el auditor de tema sabe abrir (unos 190). Los que no tienen escenario quedan en «No cubierto» del informe.
- [x] La prueba del CI vigila tres decisiones reales; sus firmas atrapan la forma a mano y dejan pasar el uso correcto (probado con muestras).
