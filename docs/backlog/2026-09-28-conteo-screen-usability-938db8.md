## 🔍 Conteo: subtítulo de modo + pastillas con affordance (2026-09-28) — solo web, sin migración; rama `claude/conteo-screen-usability-938db8`

- [x] `apps/web/components/ConteoPanel.tsx:76-81`: `TEXTOS_MODO` — una línea fija bajo el segmento «Cómo se anota la cantidad» que dice qué hace el modo elegido, antes de escanear la primera prenda.
- [x] `apps/web/components/ConteoPanel.tsx:1137-1146`: las pastillas de talla en «Faltan por contar» pasan a borde firme + ícono «+» en reposo (antes solo cambiaban al pasar el mouse).
- [x] Dos spikes antes de tocar el componente: `docs/maquetas/conteo-affordances-spike-2026-09/` (antes/después puntual) y `docs/maquetas/conteo-completo-spike-2026-09/` (la pantalla entera, clicable, con las dos correcciones ya integradas).
- [x] `tsc --noEmit` y `eslint` en verde sobre `ConteoPanel.tsx`.
- [ ] **Sin verificar en el navegador con datos reales:** este worktree no tiene `.env.local` (solo `.env.example`), así que `next dev` no levanta — falta la pasada real cuando el worktree tenga las credenciales de Supabase.
- Cómo verificas: Inventario ▸ Conteo, con un conteo abierto — bajo el segmento «Suma por escaneo / Escribir cantidad» debe verse una línea gris explicando el modo elegido; en «Faltan por contar», cada pastilla de talla debe verse con borde firme y un «+» chico, no solo al pasar el mouse.
