# Bitácora — una entrada por archivo

Desde el 2026-09-29 (ADR-0259) cada cierre de sesión o de paso es un archivo propio:

```
docs/bitacora/AAAA-MM-DD-<tema>.md
```

`<tema>` es el nombre de la rama sin `claude/` (ej. `2026-09-29-bitacora-por-archivo-y-ci-corto.md`). Si la misma
rama cierra otro paso el mismo día, se agrega al mismo archivo. El formato no cambió: un título con fecha y tres
líneas.

```markdown
## 2026-09-29 (Qué se cerró, en palabras del negocio)
Qué hice: …
Por qué así: …
Felipe se lleva: …
```

**Por qué.** `docs/BITACORA.md` era el archivo más tocado del repo junto con `BACKLOG.md` (321 commits en una
semana): cada PR metía su entrada arriba del todo, en la misma línea, y el segundo que se fusionaba chocaba
siempre, tenía que ponerse al día y volvía a esperar el CI. Dos archivos distintos no chocan nunca.

**Leer.** Lo más reciente: `ls docs/bitacora | tail`. Buscar un tema en toda la historia:
`grep -rn "<término>" docs/bitacora docs/BITACORA.md`. Todo lo anterior al 2026-09-29 sigue en `docs/BITACORA.md`,
que ya no recibe entradas nuevas (el CI las rechaza: `scripts/docs/entradas-por-archivo.mjs`).
