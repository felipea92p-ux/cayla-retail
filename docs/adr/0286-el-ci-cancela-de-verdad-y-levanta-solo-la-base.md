# ADR-0286 · El CI cancela de verdad, y el job de Postgres levanta solo la base

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Sin migración: cambia solo `.github/workflows/ci.yml`.
- **Pedido:** Felipe, 2026-09-29: «por qué [Pruebas de RPC contra Postgres] demora tanto y es necesario que dure tanto para
  ciertos PR, o sería mejor reestructurarla». Se midió primero (abajo) y se aprobó hacer la Parte 1 y la Parte 2 en un solo
  PR, en commits separados para poder revertir la segunda sin perder la primera.
- **Complementa:** ADR-0259 (el job corre según lo que toca el PR) y ADR-0066 (el job de Postgres nació como piloto).

## Qué se midió

Corridas de `CI` del 2026-09-29 (`gh run view`, tiempos por paso y por job):

| Tramo | Duración | Qué es |
|---|---|---|
| Espera antes de arrancar | 2 s casi siempre; **17 s a 5 min en 12 de 42 corridas** | Parte 1 |
| `npx supabase start` | ~88 s | 58 s bajando imágenes (10 reintentos por `toomanyrequests: Rate exceeded` de `public.ecr.aws`), 10 s arrancando la base, **5 s aplicando TODAS las migraciones y el seed**, 12 s arrancando los demás contenedores |
| 119 pruebas + `caja:verificar`, una tras otra | ~300 s | 91 pasos de ≤2 s suman ~92 s (arrancar `pnpm`+`node` por paso); las 10 más lentas, ~128 s |

## Parte 1 · Cancelar tiene que cancelar

**Lo que pasaba.** Los 135 pasos de `ci.yml` llevaban `if: ${{ always() … }}`. `always()` sigue ejecutando el paso aunque la
corrida se cancele. Un push nuevo a la misma rama pedía cancelar la corrida vieja (`cancel-in-progress: true`) y esta
terminaba igual sus ~7 minutos de pruebas, mientras la corrida nueva esperaba en el grupo `concurrency`.

Evidencia (corrida `36637231094`): la pidió cancelar la corrida siguiente a las 22:06:30; **92 pruebas arrancaron después
de eso y pasaron**, hasta las 22:11:13. En las 12 esperas largas de las 42 corridas medidas, la espera fue igual a lo que le
quedaba de vida a la corrida «cancelada» (±3 s). En las otras 30, la espera fue de 2–3 s. Se descartó primero el tope de 20
jobs simultáneos de una cuenta gratuita: las esperas ocurrieron con 1–5 jobs corriendo.

**Decisión.** Los 135 `always()` pasan a `!cancelled()`: corren aunque otro paso falle (lo que se quería: el diagnóstico
completo en una vuelta) y se detienen cuando se cancela (lo que no pasaba). Es lo que la documentación de GitHub Actions
recomienda para este caso.

**`main` no se cancela.** El grupo de `concurrency` pasa de `ci-<ref>` a `ci-<sha>` en un `push`, y sigue `ci-<ref>` en un
PR. Antes, un merge que llegaba encima de otro «cancelaba» al anterior pero este corría completo gracias a `always()`;
al arreglar el defecto, la cancelación sería real y `main` dejaría de verificarse commit por commit. ADR-0259 da por hecho
que `main` ya pasó el job entero, así que cada commit de `main` tiene su propio grupo. Sus corridas ya no hacen cola una
detrás de otra: corren a la vez.

**Qué se pierde.** El resultado de un commit reemplazado por un push nuevo del mismo PR (antes llegaba, tarde, en una
corrida «cancelada»). Si tenía una falla real que el commit nuevo no arregla, se ve en el commit nuevo.

**Cómo se verifica.** Se empuja dos veces seguidas al PR: la segunda corrida tiene que arrancar en segundos, y la primera
tiene que terminar «cancelada» en segundos, sin correr pruebas.

## Parte 2 · Levantar solo la base

**Lo que pasaba.** `npx supabase start` bajaba y arrancaba 8 contenedores (la base más gotrue, kong, mailpit, postgres-meta,
postgrest, storage-api y studio). Las 124 pruebas de `scripts/pruebas/` y `scripts/caja/` hablan solo con
`supabase_db_cayla-retail` por `docker exec … psql`: ninguna llama a la API, a auth ni a storage (se buscó `fetch(`,
`createClient`, `/rest/v1`, `/auth/v1`, `/storage/v1` y los puertos del stack; los 4 aciertos eran el celular de prueba
`987654321`, que contiene «54321»). Las migraciones y el seed se aplican **antes** de que arranquen los contenedores de
servicios (en el log: seed 22:12:42, «Starting containers» 22:12:43), así que tampoco los necesitan.

**Decisión.** `npx supabase@2.118.0 start -x gotrue,kong,mailpit,postgres-meta,postgrest,storage-api,studio`, con la versión y
la lista como variables del job (`SUPABASE_CLI`, `SIN_SERVICIOS`) para que los dos pasos que levantan la base las compartan.
Los nombres son los que acepta ese CLI (`supabase start --help`) y coinciden con las 7 imágenes que el CI bajaba. **La
versión se fija** porque los nombres de `-x` son de una versión: con `npx supabase` a secas (hoy 2.118.0, la misma que usó
la última corrida) un renombre del CLI —ya avisa que `inbucket` cambió— pondría el CI en rojo sin que cambie el código.
Subirla es cambiar un número en un PR.

**Qué se espera.** ~40–50 s menos por corrida completa (estimado, no medido) y menos fallas por el límite de descargas de
`public.ecr.aws`: pasa de bajar 8 imágenes a bajar 1.

**Qué se pierde.**
- El CI deja de ser una réplica del stack completo. Si una prueba futura necesita un servicio (RLS por la API con un JWT
  real, la API de storage), fallará con «conexión rechazada» y habrá que sacar ese servicio de `SIN_SERVICIOS`.
- Subir el CLI ya no es automático.

**Riesgo abierto (sin verificar antes de la primera corrida).** Quince pruebas insertan en `auth.users` y una toca
`storage.*` (`dinero_compras_solo_lider.mjs`). Si gotrue o storage-api terminan de armar esas tablas al arrancar (columnas
que agregan sus propias migraciones), esas pruebas fallarían sin ellos. **Si la primera corrida sale roja por eso, plan B:**
sacar `gotrue` y `storage-api` de `SIN_SERVICIOS` (siguen ahorrándose 5 de las 7 descargas). Se revierte solo este commit.

**Cómo se verifica.** La corrida del PR tiene que dar el mismo resultado que `main` en las 124 pruebas, y el paso
`npx supabase start` tiene que bajar de ~88 s a ~40 s.

## Qué se descartó

- **Repartir las pruebas en varios jobs.** Gana tiempo, pero cada job paga sus ~88 s de arranque.
- **Correrlas en paralelo sobre la misma base.** Varias hacen DDL dentro de su transacción y otras hacen commit
  (`concurrencia-*`): la misma clase de riesgo de `40P01` de ADR-0195. Sobre bases separadas habría que tocar 123 scripts, que
  tienen `-d postgres` escrito a mano. Queda como siguiente fase si esta no alcanza.
- **Quitar pruebas o saltárselas.** ADR-0066 midió que 19 de 20 fallas del job eran fallas reales del código.
