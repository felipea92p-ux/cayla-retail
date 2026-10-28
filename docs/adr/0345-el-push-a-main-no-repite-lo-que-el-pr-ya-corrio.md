# ADR-0345 · El push a `main` no repite lo que el PR ya corrió

- **Fecha:** 2026-10-05 · **Estado:** aceptado. Sin migración ni cambio en producción: solo CI
  (`.github/workflows/ci.yml`, `scripts/ci/alcance.mjs`).
- **Pedido:** Felipe, 2026-10-05, al ver en GitHub ▸ Billing ▸ Usage «Current metered usage $45.13» (1–31 oct, con $36.50 de
  uso incluido): «analiza de qué son esos cobros y por qué», y después «arma el PR que recorta el CI».
- **Complementa:** ADR-0259 (el CI según lo que toca el PR), ADR-0286 (cancelar de verdad, Postgres sin servicios).

## Qué había

- **Los cobros eran minutos de GitHub Actions.** El repo es privado: se pagan por minuto (Linux de 2 núcleos, $0,008), con
  3.000 minutos incluidos en el plan Pro. No pudimos leer la API de facturación (el token no tiene el permiso `user`), así
  que se midió desde las ejecuciones: **~6.770 minutos del 1 al 5 de octubre** (~$54 a tarifa de lista), unos 1.350 al día.
  De seguir así, ~42.000 minutos en el mes (~$330 de uso medido).
- **De dónde salen:** 134 ramas con CI de PR, 151 PR creados y 134 pushes a `main` en esos 5 días. Por job: «Pruebas de RPC
  contra Postgres» 3.496 min (52 %), «Tipos, lint y pruebas» 2.276 (34 %), «SQL pegado» 473 y «Qué toca el PR» 513 (1 minuto
  redondeado cada vez). Lo cancelado también se cobra: ~550 min (8 %).
- **El push a `main` corría todo, siempre:** 134 corridas, ~1.860 minutos (27 %). «Pruebas de RPC contra Postgres» 1.259
  (9,4 min de media: en un push es siempre el alcance `completo`) y «Tipos, lint y pruebas» 598.

## La premisa que cambió

ADR-0259 (2026-09-28) anotó `strict: false` en la protección de `main`, y por eso dejó el CI del push como red: «dos PR que
por separado pasan y juntos rompen `main`». **Hoy el ruleset `main-protegida` tiene
`strict_required_status_checks_policy: true`** (consultado el 2026-10-05): un PR solo se fusiona si su rama contiene el `main`
de ese momento. Entonces el CI del PR corrió sobre el mismo árbol que queda en `main` tras fusionarlo (la fusión de un PR
al día no cambia el árbol). El choque entre dos PR ya no puede pasar sin que el segundo se ponga al día y vuelva a correr.
Repetir en el push lo que el PR ya corrió sobre ese árbol no agrega señal; solo cuesta minutos.

## Decisión

En un push a `main`, `scripts/ci/alcance.mjs` decide por el commit (asunto + diff contra su padre, `clasificarPush`):

| El commit… | `verificar` («Tipos, lint y pruebas») | Postgres |
|---|---|---|
| llegó de un PR que era `completo` o solo documentos | no corre | no corre |
| llegó de un PR que era `web` | no corre | **corre entero** |
| llegó directo, sin PR (asunto sin `(#123)` ni `Merge pull request #123`) | corre | corre entero |

Por qué `web` corre Postgres entero: el PR solo corrió las 3 pruebas que leen la web (`pruebas-web.mjs`). El «SE ROMPE SI» de
ADR-0259 —una prueba que lee la web por un camino que el detector no ve— solo se vería en `main`; esa red se conserva. Por
qué un commit directo corre todo: nadie lo verificó antes (el ruleset exige PR, pero un administrador o una sesión con
permiso puede empujar directo).

Cableado: «Qué toca el PR» escribe además `verificar=si|no`; «Tipos, lint y pruebas» pasa a `needs: alcance` con
`if: !cancelled() && needs.alcance.outputs.verificar != 'no'`. En un PR `verificar` es siempre `si`, y como `alcance`
termina en ~15 s y «Pruebas de RPC» tarda más que este job, la espera total del PR no cambia.

## Cuánto ahorra

Sobre los 111 commits reales de `main` del 1 al 5 de octubre (todos venían de PR): 55 no repiten nada y 56 repiten solo la
base entera. **~1.020 minutos en 5 días (~$8), ~$50 al mes de ~$330.** Es el 15 % del gasto: el 64 % está en los PR, y eso
no se toca aquí (ver «Qué se descartó» y el backlog).

## Cómo falla, y hacia dónde

- **Si «Qué toca el PR» falla o no puede leer git** (clon corto, sin padre): sus salidas llegan vacías o cae a
  `completo` + `si`, y los dos jobs corren. Nunca se salta por no saber.
- **Un commit directo, un `Merge branch 'main' into …` empujado a `main` o un asunto raro** → corre todo.
- **Las pruebas fijan la regla** (`scripts/ci/alcance.test.mjs`): commit directo, PR `completo`/`nada`/`web`, y que `ci.yml`
  tenga el `needs` y el `if` con `!= 'no'`. Corren en «Tipos, lint y pruebas».

## SE ROMPE SI

Alguien **apaga «Require branches to be up to date»** en el ruleset `main-protegida` (Settings ▸ Rules). Entonces un PR puede
fusionarse sin haber corrido sobre el `main` actual, el árbol de `main` deja de ser el que se probó, y este ADR se queda
sin su premisa: hay que revertir `verificar != 'no'` y el `alcance=nada` del push (volver a `completo` + `si` siempre). El CI
no puede vigilarlo solo (leer el ruleset pide permisos de administración que el token del workflow no tiene), así que queda
escrito aquí y en CONTRIBUTING.

## Qué se descartó

- **Saltarse tipos, lint y pruebas en un PR de solo documentos.** Parecía el mejor candidato (~11 % de los PR). Se miró:
  seis pruebas leen documentos (`diccionario-datos.test.ts`, `ci-paridad.test.ts`, `club-registro-reglas.test.ts`…), así que
  un cambio en un `.md` o en `docs/datos/generado/` sí puede ponerlas en rojo. Saltarlas daría un verde falso.
- **Quitar el CI del push a `main` por completo.** Pierde la red del PR `web` y de los commits directos por ahorrar ~$12
  más al mes.
- **Hacer público el repo** (Actions es gratis en repos públicos). Publicaría el código de las funciones de producción, las
  políticas RLS, el volcado de `docs/datos/generado/` y el diseño de la integración SUNAT; es irreversible. Queda solo como
  decisión de Felipe, con auditoría previa del historial (gitleaks) y rotación de llaves.
- **Fusionar «Qué toca el PR» y «SQL pegado» en otro job** (cada uno redondea a 1 minuto, ~$25/mes en total): cambia la
  estructura de los checks obligatorios del ruleset y se prueba mal fuera de GitHub; no vale el riesgo ahora.
