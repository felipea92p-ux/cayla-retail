## 2026-11-23 (Quién trabaja en qué, sin anotarlo a mano: `pnpm sesiones`)
Qué hice: `pnpm sesiones` arma el tablero de las sesiones del repo cada vez que se corre, a partir de las worktrees de este equipo, las
ramas `claude/*` de las últimas 48 h, los PR abiertos y las reservas, y cruza los choques con el mismo detector de `/abrir-pr`
(ADR-0697). Un resumen corto llega solo al abrir cada sesión (hook `SessionStart`, tope de 8 s). El ritual de CLAUDE.md y ocho skills
lo miran en vez de `docs/SESIONES-ACTIVAS.md`, que queda como historia.
Por qué así: las 143 filas a mano mentían (la más vieja era del 2026-09-18); lo que es verdad ya estaba en git y GitHub, y derivarlo
cuesta ~3 s y no choca nunca. Sin red o sin `gh` calla y la sesión sigue.
Felipe se lleva: al abrir una sesión, Claude ya sabe qué están tocando las otras y te avisa en una línea solo si hay un choque seguro.
De paso apareció que `abrir-pr:choques` no ve más de 100 archivos por PR (el #1969 tiene 141); queda como tarea aparte.
