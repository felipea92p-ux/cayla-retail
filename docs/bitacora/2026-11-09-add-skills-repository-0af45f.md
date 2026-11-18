## 2026-11-09 (Grill me, Caveman y Better UI quedan en el repositorio para todo el equipo)
Qué hice: copié `grill-me` y `grilling` (Matt Pocock), `caveman` (Julius Brussee) y `better-ui` (Jakub Krehel) a `.claude/skills/`, cada una con su licencia y con su origen y commit en `.claude/skills/PROCEDENCIA.md`.
Por qué así: lo que está en `.claude/skills/` lo recibe cualquiera al clonar, sin instalar nada; copiar un commit leído evita que una actualización de afuera cambie sola lo que Claude obedece. `better-ui` entra bajo «se consultan, no mandan», porque sus valores chocan con los tokens, los íconos y el movimiento ya decididos.
Felipe se lleva: `/grill-me`, `/caveman` y `/better-ui` aparecen en una sesión nueva cuando esto llega a `main` y la carpeta principal del repo está al día.
