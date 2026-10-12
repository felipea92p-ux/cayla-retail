---
name: abrir-pr
description: Abre un PR de cayla-retail sin choques escondidos (ADR-0381). Antes de `gh pr create` trae origin/main y resuelve, confirma que cada ADR y migración nueva tiene su reserva, compara la rama contra main Y contra todos los PR abiertos (mismo número de ADR o de migración, la misma función de la base parchada —registrar_venta, las de ADR-0377—, los archivos de registro compartidos), corre las pruebas rápidas y las de base que toca el cambio, y recién ahí abre el PR con los choques probables escritos en su descripción. Úsala SIEMPRE que una sesión vaya a abrir un PR en este repo, y cuando Felipe diga «abre el PR», «sube esto» o «/abrir-pr». No fusiona ni activa la fusión automática.
---

Abre el PR de la rama actual: $ARGUMENTS

**Por qué existe.** Git solo marca como conflicto dos cambios a las mismas líneas. Los choques que más cuestan aquí son
otros y salen recién en el CI, cuando la rama ya está atrasada otra vez: dos migraciones con la misma versión
(`schema_migrations_pkey`), dos ADR con el mismo número, dos parches distintos a la misma función de la base
(`retail.registrar_venta` en Liquidación, PR #940) y dos entradas en el mismo archivo de registro. Esta skill los busca
**antes** de abrir el PR, contra `main` y contra los demás PR abiertos. Avisa, no bloquea: el otro PR puede no fusionarse nunca.

## 1. La rama, limpia y al día con main

1. `git status --short` vacío: todo lo de esta obra commiteado (un commit por actividad si vino de `/construir`).
2. Trae main y resuelve: en un worktree de la app, con la herramienta `sync_with_base_branch`; si no, `git fetch origin && git merge origin/main`.
   Resuelve los conflictos de verdad (no «me quedo con lo mío»), commitea el merge.

## 2. Los números: reservados y únicos

1. `pnpm reservar --mias` lista las reservas de esta rama. Cada ADR (`docs/adr/NNNN-…`) y cada migración nueva
   (`supabase/migrations/AAAAMMDDHHMMSS_…`) tiene que tener la suya. Si falta: `pnpm reservar adr` o `pnpm reservar migracion`
   y renombra el archivo al número que te dio, con `git mv`, más sus referencias (`git grep 'ADR-<viejo>'`, `git grep '<versión vieja>'`).
   Una migración que YA se pegó en producción no se renombra nunca: su versión está en el historial de allá.
2. `pnpm adr:numeros` y `pnpm migraciones:versiones` en verde. Un número reservado por OTRA rama sale en rojo: renumera el tuyo.

## 3. Los choques con main y con los PR abiertos

`pnpm abrir-pr:choques` (`scripts/abrir-pr/choques.mjs`). Léelo entero y actúa según la gravedad:

- **🔴 SEGURO** (el mismo número de ADR o de migración que main o que otro PR, o uno reservado por otra rama): **no abras
  el PR así.** Renumera el tuyo (paso 2). Si el otro PR es el que no tiene reserva, igual renumera el tuyo y dilo en la
  descripción: es más barato que esperar a que el otro cambie.
- **🟠 PROBABLE — la misma función de la base** (`retail.<función>` cambiada por migración en los dos PR): mira la migración
  del otro (`git show origin/<su rama>:<archivo>`). Si es un reemplazo anclado (`pg_temp.reemplazar_anclado`, ADR-0377), el
  segundo en fusionar se aplica sobre la función que dejó el primero: su ancla (`p_viejo`) puede no estar ya. Comprueba que
  tu ancla siga en la función que queda después del otro y que las pruebas que deshacen parches (`DESHACER_POSTERIORES` /
  `REHACER_POSTERIORES` en `scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs`, `DESHACER_*` de las suites de Frescura)
  conozcan los dos. No reescribas el parche del otro.
- **🟠 PROBABLE — archivo de registro** (`lib/menu.ts`, `lib/modulos.ts`, `lib/guia-de-foco-pantallas.ts`,
  `menu-hoy.golden.json`, la lista `PRUEBAS` de `scripts/ci/pruebas-postgres.mjs`, `package.json`, `.github/workflows/`):
  mira que tu entrada no pida el mismo lugar, `orden` o clave que la del otro. Si choca, cámbiala tú.
- **ℹ archivos en común:** solo para saber con quién hablar. No hay nada que hacer, salvo nombrarlos si son muchos.

Todo 🟠 que quede va a la descripción del PR (paso 5), con el número del otro PR.

## 4. Las pruebas que toca el cambio

1. **Las rápidas** (el gancho de `git commit` ya corre tipos, lint y vitest de los archivos del commit). Además, toda
   prueba `node --test` de `scripts/` que esté junto a un archivo que cambiaste (`scripts/x/y.mjs` → `scripts/x/y.test.mjs`).
2. **Las de base**, si el cambio toca `supabase/migrations/` o `scripts/pruebas/`: las `pnpm pruebas:*` cuyo script cambiaste,
   y las que nombran una función que tu migración toca: `git grep -l -e <función> -- scripts/pruebas` (nombres de
   `pnpm abrir-pr:choques --json` → `mio.funciones`). Corren contra el Postgres local, que es COMPARTIDO con otras sesiones:
   si le faltan migraciones, actualízalo como dice la memoria «Actualizar la base local» (respaldo, migraciones pendientes,
   `notify pgrst, 'reload schema'`), sin `db reset`. Si una prueba falla por algo que no es tuyo, dilo; no lo arregles aquí.
3. Una prueba nueva de base va en `PRUEBAS` de `scripts/ci/pruebas-postgres.mjs` (no hay que medirla).

## 5. Abrir el PR

`gh pr create --base main` con título en Conventional Commits (scope = dominio) y esta descripción:

```
## Qué cambia
(2–5 líneas de negocio, no de código)

## Cómo se verificó
(los comandos y lo que dieron; captura a 375 px si toca Vender, Cambios o Devoluciones)

## Choques probables
(lo 🟠 del paso 3: «retail.registrar_venta — también la cambia #NNN; mi ancla sigue después de la suya, DESHACER_POSTERIORES conoce las dos»;
o «Ninguno: `pnpm abrir-pr:choques` sin choques seguros ni probables»)

## Números
(ADR-NNNN y migraciones AAAAMMDDHHMMSS, todos reservados por esta rama)
```

Termina con la línea de atribución que pida el sistema. Después: `get_status` de las herramientas `ccd_pr` y, si no reporta
el PR, `bind_pr`.

## 6. Mientras espera

- **No pidas «Update branch» mientras su CI corre:** lo cancela y vuelve a empezar (`cancel-in-progress`). Espera a que el
  CI termine; si está verde y la rama quedó atrás, actualízala UNA vez y deja correr esa vuelta (~4–5 min con las tandas).
- No actives la fusión automática ni fusiones: eso lo decide Felipe.
- Si después de abrir aparece un PR nuevo, `pnpm abrir-pr:choques` otra vez antes de pedirle a Felipe que fusione.
- `pnpm abrir-pr:choques --entre-prs` cruza todos los PR abiertos entre sí: el tablero de la fila.
