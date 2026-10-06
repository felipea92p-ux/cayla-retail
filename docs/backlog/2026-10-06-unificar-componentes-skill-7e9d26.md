## 🧩 Unificar: una función, una pieza (2026-10-06, ADR-0358) — solo herramientas y docs, sin migración; rama `claude/unificar-componentes-skill-7e9d26`

- [x] Skill `/unificar` (`.claude/skills/unificar/`: método, criterio, propuesta, decisión, informe).
- [x] Motor `apps/web/unificar/` (`pnpm --filter web unificar:censo`, `--lamina`, `unificar:deuda`): censo de 40 familias, huella con tokens, capturas ×2, lámina con propuesta en claro y oscuro, comparativas por familia. Probado contra el ERP local (77 pantallas + 37 modales de Inventario).
- [x] Regla «Una función, una pieza» en `CLAUDE.md` con su tabla «Piezas únicas» (vacía) y `lib/unificar.test.ts` (22 casos de función + candado de deuda, probado con una decisión simulada).
- [x] Perfiles nuevos en `.claude/launch.json`: `cayla-retail-dev-libre` (puerto libre, para tener varias worktrees levantadas) y `unificar-laminas`.
- [x] Ronda 1 decidida por Felipe (2026-10-06): Volver, Pestañas y Tarjetas de cifra; migradas en todos los módulos y registradas con deuda 0 (`docs/unificar/accion.volver.md`, `pestanas.md`, `cifra.md`).
- [x] 2026-10-06, por la tarde: Felipe no aprobó lo de la ronda 1 al verlo; eligió mirando (flecha redonda; vidrio en mayúsculas, píldora y caja arena; la tarjeta de Compras tal cual), aplicado y registrado.
- [x] Aprobación de Felipe mirando `apps/web/unificar/.salida/fotos-despues-eleccion/comparar.html` (2026-10-06, «Apruebo»); PR #851.
- [x] Finanzas pasa a `<Pestanas>` (Felipe 2026-10-06) y las pestañas de Análisis v4, que llegaron de `main` dibujadas a mano, también (Felipe 2026-10-06: «incluye lo de Análisis»).
- [ ] Las preguntas abiertas de cada registro (`docs/unificar/*.md`): «—» o «S/ 0.00» en Producción, la vuelta para la cuenta sin Existencias, la cabecera de Compras/Caja/Recibir, Apartados en escritorio, segmentos de 4 opciones, la Caja del Inicio, avisar a Dany.
- [x] El detector del censo ve los segmentos `forma="modo"` (lee `aria-checked`).
- [ ] **Las 37 familias que faltan**, en el orden de «Por analizar» de `docs/unificar/README.md` (empieza por `estado` y `accion.nuevo`), con un censo nuevo antes y con más cuentas (`terminal-ventas`, `integrante`): el del 2026-10-06 es solo de la cuenta Admin.
- [ ] Escenarios: el censo ve los modales que el auditor de tema sabe abrir (unos 190). Los que no tienen escenario quedan en «No cubierto» del informe.
- [x] La prueba del CI vigila tres decisiones reales; sus firmas atrapan la forma a mano y dejan pasar el uso correcto (probado con muestras).
