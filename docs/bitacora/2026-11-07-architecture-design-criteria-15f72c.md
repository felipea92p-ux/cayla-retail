## 2026-11-07 (La skill `/ultra-criterio` llega a retail)
Qué hice: instalé `.claude/skills/ultra-criterio/SKILL.md`, las doce reglas del curso «Ultra criterio» v2 de Felipe, partiendo de la
versión de CAYLA Dynamic y cambiando sus casos de planilla por los de retail (`movimientos` append-only, guardianes `is not true`,
desempates en `order by`, SUNAT/Lucode, `/chaos`, `/formidable`); la sumé a la lista de skills de `CLAUDE.md`.
Por qué así: la tabla de la regla 9 («qué es de élite y cómo está retail») se midió en los `package.json` y el código del 2026-11-07
(zod ya está; no hay fast-check ni Stryker), y la skill termina subordinada a las reglas de la casa de `CLAUDE.md`.
Qué se rompería sin esto: el criterio dependería de pegar el prompt en cada sesión, y la regla 9 de Dynamic diría cosas falsas de retail.
Cómo se verificó: solo es texto; las rutas y comandos que nombra se comprobaron con `grep`/`ls` en el repo. No se probó invocarla en una sesión nueva.
