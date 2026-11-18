# Skills de afuera: de dónde vienen

Estas skills se copiaron de su repositorio original el 2026-11-09 para que todo el equipo las tenga al clonar. Son una foto fija: no se
actualizan solas. Cada carpeta lleva la licencia de su autor, que debe quedarse ahí.

| Skill | Autor y origen | Commit copiado | Licencia |
|---|---|---|---|
| `grill-me` | Matt Pocock, [`mattpocock/skills`](https://github.com/mattpocock/skills), `skills/productivity/grill-me` | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` | MIT |
| `grilling` | Matt Pocock, mismo repositorio, `skills/productivity/grilling` | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` | MIT |
| `caveman` | Julius Brussee, [`JuliusBrussee/caveman`](https://github.com/JuliusBrussee/caveman), `plugins/caveman/skills/caveman` | `3dc497a7f858c774d6e15b25e8c6120ef3a0eda8` | Apache-2.0 |
| `better-ui` | Jakub Krehel, [`jakubkrehel/skills`](https://github.com/jakubkrehel/skills), `skills/better-ui` | `659cc4e5b6df90cfe1f306f5ae1c83fa549e075c` | MIT |
| `modern-web-guidance` | Google Chrome, [`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance), `skills/modern-web-guidance` (copiada el 2026-11-18) | `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` | Apache-2.0 |

**Lo que se dejó fuera o se cambió**

- `grill-me` solo llama a `grilling`, que es la que trae las instrucciones: una no funciona sin la otra.
- `caveman` llega sola, con su modo normal. `/caveman ultra` y `/caveman wenyan` piden las skills `ultracave` y `megacave`, que no se copiaron.
- `better-ui` lleva arriba una nota de CAYLA: es el único cambio a los textos originales. Las skills `better-*` que nombra no se copiaron.
- `modern-web-guidance` lleva arriba una nota de CAYLA, igual que `better-ui`, y su `LICENSE` se bajó de la raíz del repositorio original
  (la carpeta de la skill no trae una). **No es del todo una foto fija:** las guías de `guides/` sí quedan copiadas, pero su flujo corre
  `npx -y modern-web-guidance@latest`, que baja de npm la última versión del buscador en cada uso. El permiso para ese comando (solo ese)
  está en `.claude/settings.json`. Sin red, las guías se leen directo de `guides/`.
- No se copiaron los `agents/openai.yaml` (son para otra herramienta) ni los dibujos de `caveman`.

**Para actualizar una:** lee el original completo, compáralo con la carpeta, cópialo, conserva la nota de `better-ui` y cambia el commit en
esta tabla. Una skill de afuera es texto que Claude obedece: nunca se copia ni se actualiza sin leerla.
