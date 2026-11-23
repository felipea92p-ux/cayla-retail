# ADR-0697: un tablero de sesiones que se arma solo (`pnpm sesiones`)

**Fecha:** 2026-11-23 · **Estado:** aceptado · **Reemplaza:** el uso de `docs/SESIONES-ACTIVAS.md` como tablero (queda como historia).

## Contexto

Felipe trabaja con muchas sesiones de Claude Code en paralelo, cada una en su worktree. Para que no se pisaran, desde el 2026-09-17
existía `docs/SESIONES-ACTIVAS.md`: «agrégate con una fila antes de empezar y sácate al terminar». No funcionó. El 2026-11-19 tenía
143 filas «activas», la más vieja del 2026-09-18, y ninguna sesión lo usaba como fuente de verdad: una fila escrita a mano envejece
apenas se escribe, y nadie se saca de una lista al terminar. Mientras tanto, lo que es verdad ya existía repartido en cuatro lugares:
las worktrees de cada equipo con sus archivos cambiados, las ramas empujadas, los PR abiertos y las reservas de números (ADR-0381).
La idea salió de `docs/investigacion/2026-11-19-diseno-color-y-flujo-sin-miedo-a-las-reglas.md` (fila F1) y del backlog
`docs/backlog/2026-11-19-ecc-skills-agents-analysis-3dd8fe.md`. Felipe eligió construirla el 2026-11-23.

## Decisión

**El estado se deriva, no se escribe.** `pnpm sesiones` (`scripts/sesiones/tablero.mjs`) arma cada vez el tablero de quién trabaja
en qué y no guarda nada en el repo:

1. **Qué lee.** Las worktrees de este equipo (`git worktree list`), con sus commits propios contra `origin/main` y lo que no tiene
   commit; las ramas `claude/*` del remoto con un commit en las últimas 48 h; los PR abiertos, con el mismo lector de
   `pnpm abrir-pr:choques` (`leerOtros`); y las reservas (`leerReservas`). Lo junta todo por rama: una worktree, su rama empujada y su
   PR son una sola sesión.
2. **Qué dice.** Las sesiones **activas** (algo en las últimas 48 h), las **quietas** (más viejas, con trabajo sin cerrar o un PR
   abierto) y cuántas worktrees están **vacías**. De cada una: cuándo se movió, dónde vive, en qué carpetas trabaja, los ADR y las
   migraciones nuevas que trae y lo que reservó sin usar todavía.
3. **Choques, con el MISMO detector.** `detectarChoques` de `scripts/abrir-pr/choques.mjs`; no se escribió otro. Se cruza lo que
   puede llegar a `main`: las activas y las quietas con PR (una worktree quieta sin PR es trabajo dejado, y cruzarla sería ruido de
   hace semanas). Cada sesión se compara una vez con `main` y con las reservas, y cada par de sesiones una vez entre sí: SEGURO (el
   mismo ADR o la misma migración, un número reservado por otra rama), PROBABLE (la misma función de `retail`, el mismo archivo de
   registro) y los demás archivos en común, solo para saber con quién hablar.
4. **Al abrir sesión, solo.** El hook `SessionStart` de `.claude/settings.json` corre `scripts/sesiones/al-abrir.mjs`, junto al aviso
   de la carpeta principal y en paralelo. Le deja a Claude un resumen corto (las otras sesiones activas en una línea cada una, los
   choques seguros de todos y los probables que tocan a esta sesión). A la persona solo le muestra una línea si hay un choque seguro
   o uno con esta sesión: con seis sesiones abiertas a la vez, una línea que no pide nada es ruido.
5. **Nunca traba la sesión (principio 9).** El hook corre el tablero como proceso aparte con un tope de 8 s (el tablero lee `gh` de
   forma síncrona; un proceso aparte se puede cortar a tiempo). Sin `gh` el tablero sale sin los PR y lo dice («los PR sin leer», nunca
   «0 PR»); sin red usa las ramas que ya tenía; fuera de un repo calla y sale con 0. Con `--al-abrir` trae solo `main` y las ramas
   `claude/*`. `main` se trae siempre antes de leer las ramas del remoto: una rama de otra máquina que ya trae un `main` más nuevo que el
   de aquí arrastraría en su diff lo que `main` cambió en ese tramo (en la primera prueba salieron así dos choques falsos). Si el aviso
   de la carpeta principal, que también trae `main` al mismo tiempo, choca con este por el candado de la ref, el que pierde usa la que
   dejó el otro.
6. **No le toma el índice a nadie.** Cada `git status` y `git diff` en la worktree de otra sesión va con `--no-optional-locks`: leer no
   escribe el índice, así que nunca deja un `index.lock` en medio de un commit ajeno.
7. **El ritual cambia.** CLAUDE.md y las ocho skills que leían `docs/SESIONES-ACTIVAS.md` (`formidable`, `innovar`, `focus`,
   `pantalla`, `milimetro`, `unificar`, `revision`, `sugerir`) ahora miran `pnpm sesiones`. El archivo no se borra: lleva un aviso
   arriba y no recibe filas nuevas. Borrarlo lo decide Felipe.

La lógica es pura y está probada con `node --test` (`scripts/sesiones/reglas.test.mjs`: cómo se leen las salidas de git, cómo se
juntan las fuentes, qué es activo, qué choca y qué dice al abrir; `al-abrir.test.mjs`: que el hook calle fuera de un repo). Corre en el
CI, en el paso «Tablero de sesiones», sin `node_modules`.

## Lo que no puede saber

- **«Empujada en las últimas 48 h» se mide por la fecha del último commit de la rama**, porque git no guarda cuándo se empujó. Una
  rama vieja que alguien empuja hoy sin commits nuevos no aparece como activa.
- **Las worktrees son de cada máquina.** Lo que pasa en otra Mac o en una sesión en la nube solo se ve por sus ramas empujadas y sus
  PR, no por lo que todavía no tiene commit. Las ramas que no empiezan con `claude/` (las de OpenCode, las de la nube con `ccr-`) solo
  aparecen si tienen worktree aquí o un PR abierto.
- **Una sesión no es una worktree.** El tablero nombra ramas y carpetas, no conversaciones: no sabe si la sesión sigue abierta, solo
  que su carpeta se movió.
- **Es tan certero como `detectarChoques`.** No dice si dos parches a la misma función se pisan de verdad (eso lo dicen las pruebas
  de la base).

## Medido (2026-11-23, Mac de Felipe, 42 worktrees, 5 PR abiertos)

- `pnpm sesiones`: 2,9 a 4,7 s. El hook: ~3 s con red y 1,5 s sin red ni `gh`, siempre con salida 0.
- Lo que cuesta es `git status` en cada worktree (~0,5 s cada uno, por disco: en paralelo baja poco). `git diff` de las 42 juntas,
  ~0,15 s; `gh pr list`, ~1,1 s; traer las ramas `claude/*`, ~0,9 s.
- Primera corrida: 8 activas, 24 quietas (la más vieja de hace 70 días) y 12 vacías; 5 choques probables, todos de archivos de
  registro (`package.json`, `ci.yml`, `scripts/ci/pruebas-postgres.mjs`).

## Lo que encontró de paso

`gh pr list --json files` devuelve como mucho 100 archivos por PR. El PR #1969 tiene 141, y `pnpm abrir-pr:choques` no ve dos de sus
archivos de registro (`package.json` y `scripts/ci/pruebas-postgres.mjs`): `--entre-prs` decía «ningún choque» donde había dos
probables. El tablero sí los ve, porque además lee el diff completo de cada rama empujada. El arreglo de `choques.mjs` queda aparte.

## Descartado

- **Seguir con el archivo a mano, con un recordatorio.** Ya se intentó dos meses: el problema no era acordarse, era que una fila
  escrita a mano miente apenas la sesión cambia de plan.
- **Guardar el estado en un archivo generado (o en una rama de estado).** Cada sesión lo reescribiría a la vez y chocarían, que es
  justo el problema de `BITACORA.md` (ADR-0259). Derivarlo cada vez cuesta ~3 s y no choca nunca.
- **Otro detector de choques para el tablero.** Dos detectores dirían cosas distintas; el de `/abrir-pr` ya tenía las reglas y sus
  pruebas. Solo se exportaron sus lectores y sus patrones, y sus mensajes dicen «las dos ramas» en vez de «los dos PR».
- **Saltarse el `git status` de las worktrees que parecen quietas** (por la fecha de su índice) para que el hook vaya más rápido. La
  fecha del índice la mueve cualquier `git status` de cualquier herramienta: no dice quién trabaja.
