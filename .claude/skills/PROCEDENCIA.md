# Skills de afuera: de dónde vienen

Estas skills se copiaron de su repositorio original (desde el 2026-11-09; cada fila dice cuándo) para que todo el equipo las tenga al clonar. Son una foto fija: no se
actualizan solas. Cada carpeta lleva la licencia de su autor, que debe quedarse ahí.

| Skill | Autor y origen | Commit copiado | Licencia |
|---|---|---|---|
| `grill-me` | Matt Pocock, [`mattpocock/skills`](https://github.com/mattpocock/skills), `skills/productivity/grill-me` | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` | MIT |
| `grilling` | Matt Pocock, mismo repositorio, `skills/productivity/grilling` | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` | MIT |
| `caveman` | Julius Brussee, [`JuliusBrussee/caveman`](https://github.com/JuliusBrussee/caveman), `plugins/caveman/skills/caveman` | `3dc497a7f858c774d6e15b25e8c6120ef3a0eda8` | Apache-2.0 |
| `better-ui` | Jakub Krehel, [`jakubkrehel/skills`](https://github.com/jakubkrehel/skills), `skills/better-ui` | `659cc4e5b6df90cfe1f306f5ae1c83fa549e075c` | MIT |
| `modern-web-guidance` | Google Chrome, [`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance), `skills/modern-web-guidance` (copiada el 2026-11-18) | `64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` | Apache-2.0 |
| `web-design-guidelines` | Vercel, [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills), `skills/web-design-guidelines` (copiada el 2026-11-23) | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | MIT (README del repositorio) |
| `vercel-react-best-practices` | Vercel, mismo repositorio, `skills/react-best-practices` (2026-11-23) | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | MIT (README y `SKILL.md`) |
| `vercel-composition-patterns` | Vercel, mismo repositorio, `skills/composition-patterns` (2026-11-23) | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | MIT (README y `SKILL.md`) |
| `supabase` | Supabase, [`supabase/agent-skills`](https://github.com/supabase/agent-skills), `skills/supabase` (2026-11-23) | `c9be0e931b7930f7d02126d04774d904c381e7d7` | MIT |
| `supabase-postgres-best-practices` | Supabase, mismo repositorio, `skills/supabase-postgres-best-practices` (2026-11-23) | `c9be0e931b7930f7d02126d04774d904c381e7d7` | MIT |

**Lo que se dejó fuera o se cambió**

- `grill-me` solo llama a `grilling`, que es la que trae las instrucciones: una no funciona sin la otra.
- `caveman` llega sola, con su modo normal. `/caveman ultra` y `/caveman wenyan` piden las skills `ultracave` y `megacave`, que no se copiaron.
- `better-ui` lleva arriba una nota de CAYLA: es el único cambio a los textos originales. Las skills `better-*` que nombra no se copiaron.
- `modern-web-guidance` lleva arriba una nota de CAYLA, igual que `better-ui`, y su `LICENSE` se bajó de la raíz del repositorio original
  (la carpeta de la skill no trae una). **No es del todo una foto fija:** las guías de `guides/` sí quedan copiadas, pero su flujo corre
  `npx -y modern-web-guidance@latest`, que baja de npm la última versión del buscador en cada uso. El permiso para ese comando (solo ese)
  está en `.claude/settings.json`. Sin red, las guías se leen directo de `guides/`.
- Las cinco del 2026-11-23 estaban instaladas solo en la Mac de Felipe (`~/.claude/skills/`, con `npx skills`); se copiaron del original,
  no de esa instalación, y se leyeron enteras antes (126 archivos de referencias, más sus `SKILL.md`). Cada una lleva arriba una nota de
  CAYLA con lo que choca con el repo:
  - `supabase`: producción es el schema `retail` y no se toca sin el OK de Felipe; las migraciones se escriben a mano con número
    reservado (no `supabase db pull`); `security definer` con sus permisos es el patrón de las RPC; nada de `.mcp.json` ni del issue de
    «Skill Feedback» sin el OK de Felipe.
  - `supabase-postgres-best-practices`: nunca `force row level security`, índices `concurrently`, restricciones `not valid`, nada de
    borrar datos ni de cambios globales (`alter system`, `revoke`/`grant` amplios).
  - `vercel-react-best-practices`: nada de caché entre peticiones con datos de una persona o sede, ni dependencias nuevas por la skill.
  - `vercel-composition-patterns` y `web-design-guidelines`: las piezas decididas y las reglas de texto del repo ganan.
- Vercel no trae archivo de licencia: su `README.md` dice MIT para todo el repositorio y dos de las skills lo repiten en su `SKILL.md`.
  Las de Supabase llevan el `LICENSE` de la raíz de su repositorio.
- `web-design-guidelines` ya no baja sus reglas de internet: la versión copiada las trae en `references/command.md`, fijadas a un commit.
- No se copiaron los `agents/openai.yaml` (son para otra herramienta) ni los dibujos de `caveman`.

**Para actualizar una:** lee el original completo, compáralo con la carpeta, cópialo, conserva la nota de `better-ui` y cambia el commit en
esta tabla. Una skill de afuera es texto que Claude obedece: nunca se copia ni se actualiza sin leerla.

## Plugins que el proyecto activa para todo equipo

No se copian: `.claude/settings.json` los activa (`enabledPlugins`) y dice de dónde se instalan (`extraKnownMarketplaces`), así que cada
equipo los recibe al confiar en la carpeta del repo. Se actualizan con su marketplace, no con este archivo.

| Plugin | Marketplace | Desde |
|---|---|---|
| `agent-skills` | `addy-agent-skills` → [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) | 2026-09-05 (el marketplace, desde el 2026-11-23: antes solo lo tenía declarado la Mac de Felipe) |
| `frontend-design` | `claude-plugins-official` (el oficial de Anthropic, que todo equipo ya conoce) | 2026-11-23 |
| `ui-ux-pro-max` | `ui-ux-pro-max-skill` → [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 2026-11-23 |

`frontend-design` y `ui-ux-pro-max` se consultan, no mandan, y `ui-ux-pro-max` nunca con `--persist` (`.claude/rules/diseno.md`).
