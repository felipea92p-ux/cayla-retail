## Compras ▸ Plan de campaña: fuera `esLider` tras el PR #977 (2026-10-12) — rama `claude/plan-puede-gestionar`

- **Qué:** `PlanCampana` deja de recibir `esLider`. Con ADR-0387 la página exige el módulo `plan_compra`, y con él se crea, edita, quita y
  restaura una campaña y se fija el tope: la prop siempre era verdadera. Salen las ramas que ya no se veían («Cuando un líder cree una
  campaña…», «Cuando un líder restaure o cree una…») y los «un líder» de `PlanCampana` y `SelectorCampana`. Ningún botón cambia.
- **Por qué:** era el pendiente de ADR-0387 «cuando se fusione el PR #977». Va sobre la rama de la fase 2 (`0ed992f11`) con `main` fusionado,
  porque sin ADR-0387 esos textos siguen vivos.
- **Cómo:** tsc sin errores, `vitest run lib/plan-compra` 164/164, eslint limpio, y en el navegador una página temporal con datos inventados
  (no se sube) dibujó los cuatro casos: con plan, sin campañas, solo archivadas y campaña archivada. **Queda para la fase 2:**
  `guardar_plan_compra_recupero` (PR #977) todavía pide líder, y `pruebas:compras-llave` no está en `scripts/ci/pruebas-postgres.mjs`
  (`lib/ci-paridad.test.ts` falla por eso).
