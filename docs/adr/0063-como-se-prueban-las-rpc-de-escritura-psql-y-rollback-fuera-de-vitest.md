# ADR-0063 — Cómo se prueban las RPC de escritura: `psql` + rollback, fuera de vitest

**Fecha:** 2026-09-16
**Estado:** Aplicado. `scripts/pruebas/registrar_cambio.mjs`, 12 escenarios, verde contra
el Postgres local dos corridas seguidas sin dejar rastro.
**Afecta:** cómo se prueba cualquier función `retail.*` que escribe (no solo
`registrar_cambio`) — precedente para `registrar_venta`, `crear_devolucion`,
`cerrar_caja`, etc. el día que alguien las prueba.

## Contexto

`registrar_cambio` (`0007_cambios.sql`, extendida por
`20260915200000_diferencia_de_cambio_en_el_arqueo.sql`) mueve stock real y, cuando hay
diferencia de precio, plata real del cajón — y tenía **cero pruebas automatizadas**. No es
la única: cada verificación de una RPC de escritura en este repo hasta hoy fue manual
("verificado en psql, 3 escenarios con rollback", "verificado en el navegador") — BACKLOG
está lleno de esa frase. Ninguna de esas corre sola la próxima vez que alguien toque la
función.

Los 20 archivos `*.test.ts` que ya existen (`apps/web/lib/*.test.ts`, vitest) prueban
**funciones puras** (`vender-reglas.ts`, `movimientos-reglas.ts`, `stock-por-sede.ts`…) —
ninguno toca Postgres. No había precedente de cómo probar una RPC de escritura de forma
automatizada en este repo.

## Decisión

**DECIDÍ: hablar con Postgres directo vía `docker exec supabase_db_cayla-retail psql`,
simulando la sesión con `set local request.jwt.claim.sub` dentro de una transacción que
siempre termina en `ROLLBACK`** — exactamente el patrón que `supabase/seed.sql` ya
documenta en su propia cabecera para llamar RPC "sin una sesión HTTP real". No hay JWT,
PostgREST ni `@supabase/supabase-js` de por medio.

Tres razones, no una preferencia:

1. **Ya es el patrón del repo**, no uno nuevo. `supabase/seed.sql` lo usa para sembrar
   `registrar_venta`/`recibir_lote`/`registrar_cambio` de punta a punta. Cada "verificado
   en psql" del BACKLOG es exactamente esto, a mano. Escribirlo en un script es
   automatizar lo que ya se hacía, no inventar una técnica.
2. **Cero dependencias nuevas.** `scripts/migraciones/verificar.mjs` ya eligió
   `docker exec ... psql` sobre un cliente `pg`/`postgres` de npm "para no sumar una
   dependencia de Postgres al monorepo solo para esto" — mismo razonamiento acá.
3. **El `ROLLBACK` es la única forma segura de tocar el Postgres compartido por ~27
   worktrees.** Nada se commitea nunca: corrí la prueba dos veces seguidas y verifiqué a
   mano que no quedó ni un `movimiento` ni un `cambio` de los que la prueba crea.

**DESCARTÉ: `@supabase/supabase-js` contra PostgREST/Auth locales** (login real como
Felipe/Micaela, `.rpc(...)` como hace la app). Es más fiel a producción, pero exige
crear/limpiar estado por fuera de una transacción — en un Postgres que comparten ~27
sesiones, no hay forma de "deshacer" un `INSERT` que ya pasó por HTTP sin un `DELETE`
explícito después, y una limpieza que se olvida una vez deja basura para las otras 26.

**DESCARTÉ: pgTAP.** Es la herramienta "correcta" para probar SQL, pero es infraestructura
nueva (extensión, convención de archivos, otro runner) para un repo de una persona que
recién está probando su primera RPC. Se revisita si el volumen de RPCs por probar lo
justifica — principio 5 (CLAUDE.md): diseñar para el volumen que viene, no para el que
nunca llega.

**DECIDÍ: que la prueba viva en `scripts/pruebas/`, no en `apps/web/lib/*.test.ts`, y que
NO corra desde `pnpm test`.** `pnpm test` (y por lo tanto CI —
`.github/workflows/ci.yml`, que dice explícitamente "no toca base de datos") corre sobre
un checkout limpio sin Docker ni Postgres. Si vitest la descubriera solo por vivir donde
vitest mira, cada PR futuro saldría rojo por Docker, no por el código. Se corre a mano:
`pnpm pruebas:registrar-cambio`, documentado con la misma disciplina que
`migraciones:verificar` ("esto necesita el Postgres local y no corre en CI").

## Hallazgo de paso, no causado por esta prueba

**Tienda Lima y Tienda Trujillo no tenían sububicaciones de piso/almacén en el Postgres
local compartido** (`retail.sububicaciones` vacía para ambas) — `seed.sql` las crea, pero
solo corre en `supabase db reset`; este Postgres se migró de más veces sin un reset después
de `20260914230000_inventario_piso_almacen.sql`, así que el backfill del seed nunca corrió
contra el estado actual. Sin esto, `fn_sububicacion_por_defecto` devuelve `NULL` para
cualquier venta/cambio en cualquiera de las dos tiendas — no solo en esta prueba, también
en el navegador real, hoy, para cualquier sesión que use este mismo Postgres.

No lo corregí en la base compartida (un `INSERT` así, sin rollback, quedó bloqueado por el
clasificador de auto mode como "Modify Shared Resources" — correcto: es una escritura
persistente sobre un recurso que comparten ~27 worktrees, no algo para decidir solo). Cada
escenario de `registrar_cambio.mjs` se repone sus propias sububicaciones dentro de su
propia transacción (`insert ... where not exists (...)`, antes del `ROLLBACK`), así que la
prueba no depende de que alguien lo arregle. **Queda en BACKLOG para que Felipe decida y
corra** (el `INSERT` exacto, aditivo, está en la cabecera de
`scripts/pruebas/registrar_cambio.mjs`).

## Se rompe si

Alguien corre este script contra un Postgres sin el stack de Supabase levantado
(`npx supabase start`) — sale un mensaje explicando eso, no un error críptico de Docker.
Si `BLU-EMMA-NEG-M`/`VES-SOFI-NEG-M`/`Tienda Lima` dejaran de existir en el catálogo
sembrado, los 12 escenarios fallan con "no existe" en vez de silenciarse — ninguno atrapa
excepciones que no espera.

## Lo que falta

1. **El backfill de sububicaciones de Lima/Trujillo** en el Postgres compartido — decisión
   y ejecución de Felipe (o de quien tenga permiso), ver arriba. Anotado en BACKLOG.
2. **El mismo patrón, para las demás RPC de escritura** (`registrar_venta`,
   `crear_devolucion`, `cerrar_caja`, `transferir`, `mover_interno`…) — ninguna tiene
   pruebas automatizadas todavía. Este ADR es el precedente a copiar, no un caso especial
   de Cambios.
