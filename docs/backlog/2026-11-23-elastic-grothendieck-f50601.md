## 🔇 Lo que falla sin avisar: el relleno a propósito y el botón que no hace lo que dice (2026-11-23, ADR-0693) — sin migración ni cambios de conducta en la web; rama `claude/elastic-grothendieck-f50601`

- [x] `relleno-silencioso` en `scripts/rendimiento/observabilidad.mjs` (AST), con 7 pruebas nuevas en `scripts/rendimiento/rendimiento.test.mjs`
  (que desde hoy corren en el CI: antes no corrían en ningún lado). Afinado contra la web real: lo que lleva el aviso dentro
  (`{ error: "No se pudo…" }`, un texto escrito) no cuenta.
- [x] Candado `apps/web/lib/relleno-silencioso.test.ts` con la deuda por archivo en `relleno-silencioso-archivos.ts`. Verificado que falla
  con un relleno nuevo y pasa con la marca.
- [x] 55 rellenos marcados a mano (solo comentarios: el que ya decía qué pasa si falla). Tipos, lint y las 963 pruebas de la web en verde.
- [x] `/chaos`: familia `boton` (BOT-01 a BOT-08) en `catalogo.mjs`, lector `scripts/chaos/boton.mjs` con 9 pruebas, paso nuevo del CI y la
  skill, el tablero y CLAUDE.md al día.
- [ ] **La deuda del relleno: 129 en 94 archivos.** Cada uno es una decisión de qué debe pasar si esa lectura falla; la skill
  `skill-evaluacion-observabilidad` los toma al auditar cada módulo. Los que tocan dinero, stock o comprobante van primero y son de Felipe.
- [ ] **La familia `boton` no se corrió todavía contra una pantalla.** Las 9 combinadas que marca el lector (un refresco junto a un efecto
  que copia una prop; Vender entre ellas) son el primer lugar donde correrla.
- [ ] Una semilla de `/chaos` de antes de hoy sortea distinto (el catálogo pasó de 77 a 85): para repetir una corrida vieja, `--familias` con
  las ocho de entonces.
