## 2026-10-27 — Colaboradores compacto (ADR-0540)
- **Qué se hizo:** maqueta navegable aprobada y cortes 1–5 construidos: Equipo en una línea con pestañas, ficha con velo y «Ve» por grupos, «Cambiar rol» sin comparación, Dar acceso en tres pasos, Roles con lista lateral y borrador en verde/rojo, Actividad con título corto. Sin migraciones.
- **Por qué así:** Felipe pidió menos texto y más compacto; se decidió mirando la maqueta (`docs/maquetas/colaboradores-compacto-2026-10/`) y se quitó lo que no usaba (comparación de módulos, menú en árbol, íconos por módulo).
- **Qué se rompería sin esto:** la guía interactiva y su huella de controles (`lib/guias/huellas/colaboradores.json`) habrían quedado viejas y el CI las habría rechazado; el código muerto habría roto Knip.
