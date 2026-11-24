---
paths:
  - "graphify-out/**"
  - ".claude/settings.json"
  - ".claude/settings.local.json"
---

## graphify

Este repo tiene un grafo de conocimiento generado en `graphify-out/` (nodos centrales,
estructura de comunidades, relaciones entre archivos). **El binario `graphify` no está
instalado en todas las máquinas del equipo**: antes de usarlo, corre `which graphify`. Si
no está, busca con grep y lee los archivos directamente; no lo instales por tu cuenta ni
adivines su salida. Su guardia (el hook que lo llama antes de cada búsqueda y lectura) es de
cada máquina: si la usas, va en tu `.claude/settings.local.json`, que no se sube al repo,
en `PreToolUse` con `graphify hook-guard search` para `Bash|Grep` y `graphify hook-guard
read` para `Read|Glob` (o la ruta completa de tu instalación). Hasta el 2026-09-26 estaba en
`.claude/settings.json` con la ruta de Windows de una sola máquina, y en las demás esa ruta
no existía.

Si está instalado, reglas:
- Para preguntas de código, primero `graphify query "<pregunta>"` cuando exista
  `graphify-out/graph.json`. Usa `graphify path "<A>" "<B>"` para relaciones y
  `graphify explain "<concepto>"` para un concepto puntual. Devuelven un subgrafo
  acotado, normalmente mucho más chico que `GRAPH_REPORT.md` o un grep crudo.
- Si existe `graphify-out/wiki/index.md`, úsalo para navegación amplia en vez de
  recorrer el código fuente a mano (al 2026-09-25 no existe).
- Lee `graphify-out/GRAPH_REPORT.md` solo para una revisión de arquitectura amplia o
  cuando query/path/explain no alcancen.
- Después de modificar código, `graphify update .` mantiene el grafo al día (solo AST,
  sin costo de API).
