# Backlog — una sección por archivo

Desde el 2026-09-29 (ADR-0259) cada trabajo abre su propia sección en un archivo:

```
docs/backlog/AAAA-MM-DD-<tema>.md
```

`<tema>` es el nombre de la rama sin `claude/`. El formato es el mismo que tenían las secciones de `BACKLOG.md`: un
título con fecha, estado y rama, y la lista de lo hecho `[x]` y lo pendiente `[ ]`. Cuando cambia el estado (se pegó
la migración, se probó en la tablet), se edita ese mismo archivo.

```markdown
## 🧾 Qué se hizo (2026-09-29, ADR-0000) — solo web, sin migración; rama `claude/<tema>`

- [x] Lo hecho y cómo se verificó.
- [ ] **Sin probar:** lo que falta, dicho sin adornos.
```

**Por qué.** `docs/BACKLOG.md` era el archivo más tocado del repo (328 commits en una semana): cada PR metía su sección
en la línea 31, la misma para todos, y el segundo que se fusionaba chocaba siempre. Dos archivos distintos no chocan.

**Leer.** Lo más reciente: `ls docs/backlog | tail`. Un tema o un módulo en toda la historia:
`grep -rn "<término>" docs/backlog docs/BACKLOG.md`. Todo lo anterior al 2026-09-29 sigue en `docs/BACKLOG.md`: ahí
se puede tachar un pendiente o corregir una sección vieja, pero no se abren secciones nuevas (el CI las rechaza:
`scripts/docs/entradas-por-archivo.mjs`).
