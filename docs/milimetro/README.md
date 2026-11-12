# Al milímetro — tablero

**Obligatorio desde el 2026-11-12** (Felipe: «cada que se haga un cambio visual o se cree una nueva pantalla o se quiera auditar las
pantallas ya existentes se usen esas skills obligatoriamente»). Regla completa: `CLAUDE.md`, sección «Al milímetro».

| Cuándo | Qué se corre |
|---|---|
| Pantalla, modal o pieza nueva | `/milimetro diseñar <pieza>` antes del código |
| Cambio visual a algo que existe | `/milimetro auditar <ruta>` al terminar, en local |
| Auditar lo que ya existe | `/milimetro auditar <ruta|módulo>` |
| Una regla del repo que convendría mejorar | va a `propuestas.md`; se decide con `/milimetro proponer` |

El PR marca su casilla «pasó por `/milimetro`» (o «Al milímetro no aplica») y el check **«Al milímetro»** la pide cuando cambia un `.tsx`
de `apps/web/components/` o `apps/web/app/`, o un `.css` de `apps/web/app/`.

## Auditorías

Una fila por auditoría (la más nueva arriba). Graves = hallazgos de severidad «grave» que quedaron abiertos.

| Fecha | Ruta o pieza | Rama / PR | Graves abiertos | Notas |
|---|---|---|---|---|
| | | | | |
