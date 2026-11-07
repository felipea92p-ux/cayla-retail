# ADR-0627 — La cola de fusión en `main`

**Fecha:** 2026-11-07 · **Estado:** aceptado (el CI ya responde a la cola; activarla en el ruleset lo hace Felipe) ·
**Relacionados:** ADR-0259 (el CI según lo que toca el PR), ADR-0345 (el push a `main` no repite lo que el PR ya corrió),
ADR-0381 (números reservados), ADR-0383 (qué construye Vercel)

## El problema

El ruleset `main-protegida` exige la rama al día con `main` (`strict_required_status_checks_policy`) para fusionar. Con
varias sesiones fusionando a la vez, `main` recibe un PR cada pocos minutos, y el CI de un PR tarda ~5 minutos. El
2026-11-07 el PR #1696 (la avalancha del probador de la tienda) quedó en verde cuatro veces seguidas y nunca entró: cada vez
que terminaba su CI, `main` ya había avanzado (8, 29… commits), GitHub lo marcaba «out-of-date» y la fusión automática se
quedaba esperando. Ponerlo al día otra vez solo reiniciaba la carrera. Nadie puede saltarse la regla (`gh pr merge --admin`
lo rechaza: el ruleset no tiene «bypass actors»), y está bien que así sea.

## La decisión

**`main` usa la cola de fusión de GitHub (merge queue).** Un PR en verde entra a la fila; GitHub arma un commit con el
`main` de ese momento más el PR (y los que van antes en la fila), corre ahí los checks obligatorios y, si pasan, deja
**ese mismo commit** en `main`. Nadie persigue a `main` a mano y lo que llega a `main` es exactamente lo que se probó.

Lo que cambió en el repo para que la cola funcione (este ADR):

- **`ci.yml` escucha `merge_group`.** Sin el evento, los checks obligatorios («Tipos, lint y pruebas», «Pruebas de RPC
  contra Postgres») nunca se reportarían en el commit de la cola y todo PR esperaría para siempre.
- **`scripts/ci/alcance.mjs` mide la cola como un PR** (`seMideComoPr`): `HEAD^1` es la base de la cola y `HEAD` lo que
  quedará en `main`, así que el alcance (`nada` / `web` / `completo`) y si se compila salen de lo que cambia el PR. Corre lo
  mismo que en el PR, pero sobre la combinación de verdad.
- **`sql-pegado.yml` escucha `merge_group` y responde en verde sin revisar.** El check es obligatorio por la protección
  clásica de `main`; la cola no trae migraciones ni casilla propias, y el PR ya lo pasó para entrar. Su grupo de
  `concurrency` cae en `github.ref` cuando no hay número de PR: con un grupo vacío, todas las filas se cancelarían entre sí.
- **El candado de reservas no juzga en la cola** (`ramaQueSeRevisa` devuelve vacío en `merge_group`): la rama de la cola,
  `gh-readonly-queue/main/pr-…`, no es dueña de ninguna reserva, y el PR ya las revisó con su rama de verdad.
- **Vercel no construye vista previa de la rama de la cola** (`scripts/ci/vercel-ignorar.mjs`): la prueba el CI y, si pasa,
  producción construye `main`. La tienda ya no construía vistas previas.
- **El push a `main` sigue sin repetir lo probado (ADR-0345).** Su premisa era «el árbol de `main` es el que se probó»; con la
  cola obligatoria eso se cumple por construcción, también con «Require branches to be up to date» apagado.

## Cómo se activa (lo hace Felipe, en este orden)

1. Fusionar el PR de este ADR (todavía con la regla de hoy).
2. Settings ▸ Rules ▸ `main-protegida` ▸ **«Require merge queue»**: método **Merge** (el CI del push reconoce
   «Merge pull request #N …», `vieneDeUnPr`), agrupación «todos en verde», hasta 5 en construcción, sin espera mínima, 60 min
   de tope por check.
3. En la misma regla, **apagar «Require branches to be up to date»**: con la cola ya no hace falta (la cola prueba contra el
   `main` de verdad) y mantenerlo vuelve a pedir «Update branch» antes de entrar a la fila.
4. Un PR entra a la fila con «Merge when ready» o con la fusión automática activada. Los PR que hoy esperan «out-of-date»
   (como #1696) entran sin ponerse al día.

## Cómo falla, y hacia dónde

- **Si la cola se apaga y se deja `strict` apagado:** ADR-0345 pierde su premisa (un PR podría fusionarse sin haberse probado
  con el `main` actual). Hay que volver a encender «Require branches to be up to date» o revertir el recorte del push.
- **Si un workflow obligatorio nuevo nace sin `merge_group`:** la cola espera para siempre. `scripts/ci/alcance.test.mjs` exige
  el evento en `ci.yml` y `sql-pegado.yml`; uno nuevo se suma a esa prueba.
- **Si la cola elige otro método (squash):** el asunto del commit en `main` sería «título (#N)», que `vieneDeUnPr` también
  reconoce; no rompe nada.

## Qué se descartó

- **Seguir con `strict` y reintentar «Update branch»:** perdió la carrera cuatro veces seguidas el 2026-11-07, y cada vuelta
  gasta ~5 minutos de Actions.
- **Agregar «bypass actors» para fusionar a mano:** destraba un PR, pero vuelve opcional la regla que protege `main`, y la carrera
  sigue para todos los demás.
- **Apagar `strict` sin cola:** más rápido, pero un PR entraría sin probarse junto con lo último de `main`, y ADR-0345 quedaría
  sin premisa.
