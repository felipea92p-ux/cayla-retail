# ADR-0492 · El mismo árbol no se prueba dos veces

- **Fecha:** 2026-10-23 · **Estado:** aceptado. Sin migración ni cambio en producción: solo CI
  (`.github/workflows/ci.yml`, `scripts/ci/alcance.mjs`).
- **Pedido:** Felipe, 2026-10-23: «cuando se termina de pasar todas las pruebas y aparece el update branch vuelve a hacer todas
  las pruebas, ¿hay manera de evitar que otra vez se vuelvan a hacer?».
- **Complementa:** ADR-0259 (el CI según lo que toca el PR), ADR-0345 (el push a `main` no repite el PR), ADR-0381 (tandas).

## Qué pasaba

El ruleset `main-protegida` exige la rama al día (`strict_required_status_checks_policy: true`). Si la rama quedó atrás de
`main`, GitHub muestra «Update branch»: al apretarlo crea un commit nuevo (el merge de `main` en la rama) y los checks
obligatorios vuelven a correr enteros, ~5–8 min. Pero el CI de un PR **ya prueba el merge del PR sobre el `main` de ese
momento** (`refs/pull/N/merge`). Si `main` no se movió entre esa corrida y el clic, el commit nuevo deja exactamente el mismo
árbol (los mismos archivos, byte a byte) que ya pasó. Esos minutos no traían ninguna señal nueva.

## Decisión

Una corrida verde de un PR deja una marca en la caché de Actions, con llave `ci-verde-<hash del árbol>` (job «Anotar el árbol
en verde»). La corrida siguiente del mismo PR busca la marca de SU árbol en «Qué toca el PR» (`lookup-only`, no baja nada); si
está, `alcance.mjs` escribe `alcance=nada`, `verificar=no`, `compilar=no`, `compilar_tienda=no` y todo se salta por las mismas
condiciones que ya existían. Los dos checks obligatorios terminan en verde en segundos: «Tipos, lint y pruebas» como saltado
(GitHub lo cuenta como aprobado) y «Pruebas de RPC contra Postgres» con su «Nada que correr».

La marca solo se deja si la corrida corrió de verdad (no si se saltó por otra marca) y los cuatro jobs salieron bien o no
tenían que correr.

## Cuándo ayuda y cuándo no

- **Ayuda:** «Update branch» con `main` quieto desde la última corrida (la rama nació atrás, o nadie fusionó mientras corría);
  un push que no cambia archivos (commit vacío, rebase que deja lo mismo, cambio de mensaje).
- **No ayuda, a propósito:** si `main` se movió, el árbol es otro (lo de `main` más lo del PR, juntos por primera vez) y corre
  todo. Eso es justo lo que `strict` está para probar: dos PR que pasan por separado y juntos rompen. Con 4–6 fusiones por hora
  esto pasa seguido; no hay forma segura de saltarlo dentro de este repo.

## Qué se descartó

- **Apagar «rama al día» (`strict`).** Se acaba el botón, pero dos PR verdes por separado pueden romper `main` juntos, y ya pasó
  con versiones de migración repetidas. Además ADR-0345 depende de `strict` para no repetir el CI en el push a `main`.
- **Cola de fusión (merge queue) de GitHub.** Es la solución de GitHub para esto (prueba una vez la combinación y fusiona sola),
  pero solo existe en repositorios de una **organización**; `felipea92p-ux/cayla-retail` es de una cuenta personal.
- **Saltar si lo que trajo `main` es «solo documentos».** Los documentos también tienen candados (números de ADR, bitácora):
  un ADR nuevo en `main` puede chocar con el del PR.

## Cómo falla, y hacia dónde

- **Si la caché no responde** o la marca se borró (Actions guarda 7 días y hasta 10 GB): no hay marca y corre todo.
- **Si `alcance` falla**, sus salidas llegan vacías y todo corre (la regla de siempre: nunca se salta por no saber).
- **Lo único que no es el árbol:** los candados de reservas (ADR-0381) miran etiquetas del remoto. Una reserva ajena creada
  entre las dos corridas no se vería en la segunda; la rama dueña de esa reserva la ve en su propio CI.
- La caché de un PR solo la leen las corridas de ese PR: otro PR o un fork no pueden dejar una marca que este use.

Pruebas: `scripts/ci/alcance.test.mjs` (la marca exacta, el script con y sin marca, y que `ci.yml` busque y guarde con la misma
ruta y llave, solo tras una corrida verde).
