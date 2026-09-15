# ADR-0051 — El INSERT directo a `movimientos` ya no pasa

**Fecha:** 2026-09-15
**Estado:** Aplicado y verificado en local, y aplicado y verificado en producción el mismo
día (con el ok puntual de Felipe, vía `apply_migration` del MCP de Supabase — mismo
mecanismo que `20260915090000_movimientos_lectura.sql`).
**Afecta:** `retail.movimientos` en `supabase/migrations/20260915150000_movimientos_insert_solo_rpc.sql`.

## Contexto

ADR-0042 (2026-09-14) cerró la mitad del hueco D-22: bloqueó `UPDATE`/`DELETE` sobre
`movimientos` con un disparador, y **descartó a propósito** cerrar también el `INSERT`
directo — lo dejó anotado como hueco aparte (P-05 en
`docs/datos/13-PROMESAS-INCUMPLIDAS.md`, "El `insert` directo a `movimientos` sigue
abierto", prioridad ALTO) porque cerrarlo exigía primero verificar qué llama a
`insert into movimientos` hoy, y no quería mezclar los dos cambios en una sola migración.

Se llegó a este ADR leyendo código, no documentación: `0004_rls.sql:74-78` crea
`movimientos_insert`, una policy que deja insertar a cualquier `authenticated` con acceso a
la ubicación. El comentario del propio archivo la describe como una "segunda capa detrás de
la RPC `security definer`" — no lo es. `fn_aplicar_movimiento` (`0003_funciones.sql:62-124`,
el único lugar que valida stock no-negativo, toma el lock `for update` y escribe `stock`) se
invoca **a mano** desde dentro de cada función, nunca desde un disparador. Una fila
insertada sin pasar por esas funciones queda en el ledger sin que `stock` se entere — hasta
que alguien corra `recalcular_stock`, que la reconstruye igual y la vuelve indistinguible de
un movimiento real.

## Decisión

**DECIDÍ: revocar el privilegio `INSERT` sobre `retail.movimientos` a `authenticated` y
`anon`**, dejando el privilegio solo a `postgres` (dueño) y `service_role`.

Verificado contra producción antes de escribirlo, no razonado — mismo criterio que ADR-0042:

1. Qué función de `retail` inserta en `movimientos`, y si es dueña: **12 funciones**
   (`aprobar_devolucion`, `cerrar_conteo`, `cerrar_produccion`, `mover_interno`,
   `recibir_compras`, `recibir_lote`, `registrar_cambio`, `registrar_movimiento` ×2 firmas,
   `registrar_venta`, `revertir_produccion`, `transferir`) — las 12 `security definer`, las
   12 dueño `postgres`.
2. Si el dueño se salta la RLS de la tabla: `relrowsecurity=true`, `relforcerowsecurity=false`
   — sin `FORCE`, el dueño de esas 12 funciones se salta la policy por completo. Confirma
   que ninguna de las 12 pasaba por `movimientos_insert` hoy; dependían solo de ser dueñas.
3. Qué privilegios tiene `authenticated` hoy: `INSERT` y `SELECT` (`UPDATE`/`DELETE` ya los
   sacó ADR-0042). Tras esta migración, solo `SELECT`.
4. Qué pantalla toca `movimientos` directo: un solo resultado en todo `apps/web`
   (`lib/compras.ts:330`), y es un `.select(...)` — cero pantallas insertan directo.

**Se probó en rojo/verde en local, no se le creyó al `REVOKE` sin evidencia:** como
`authenticated`, `insert into retail.movimientos (...)` sale `permission denied for table
movimientos`. Intentar la ruta legítima (`select retail.registrar_movimiento(...)`) para
probar que seguía viva destapó un hallazgo aparte, no causado por este cambio: **hay dos
firmas vivas de `registrar_movimiento`** (6 y 7 parámetros — `p_sububicacion_id` de más en
la segunda), y una llamada con los 6 parámetros históricos sale `is not unique`. Mismo
patrón que `recibir_lote` en ADR-0004 (`create or replace` con firma distinta crea función
nueva, no reemplaza la vieja). No rompe nada hoy porque **nada en `apps/web` llama a
`registrar_movimiento`** — el único lugar del código que menciona un RPC de "movimiento" es
`MovimientoCajaModal.tsx`, y llama a `registrar_movimiento_caja`, una función distinta
(caja, no stock). Se probó entonces contra `mover_interno` (única firma): confirma que las
funciones de una sola firma no tienen este problema. Queda anotado en BACKLOG, no se toca en
esta migración — mezclar los dos es el mismo error que ADR-0042 ya evitó una vez.

Además de revocar el privilegio, se comentó la policy `movimientos_insert` (`comment on
policy`) aclarando que ya no es la protección activa — para que nadie la lea en seis meses y
asuma que todavía filtra algo.

**DESCARTÉ: `force row level security`** — la pieza que sigue faltando de D-22. Mismo
motivo que ADR-0042: obligaría a las 12 funciones a pasar por sus propias policies, con
riesgo real de romper venta/transferencia/conteo, y merece su propia prueba aparte.

**DESCARTÉ: arreglar la firma duplicada de `registrar_movimiento` en esta misma migración**
— es un hallazgo real pero un problema distinto (una función que nadie llama hoy, no un
hueco de seguridad activo). Mezclarlo aquí repite exactamente el error que este ADR está
evitando en el punto de arriba.

## Cómo se corrige un error a partir de acá

Igual que ADR-0042: no se edita ni se inserta a mano desde la app — un movimiento de
corrección con el signo contrario. Si hiciera falta un insert manual real (recuperación de
un incidente), se hace desde el SQL Editor conectado como `postgres` (dueño, se salta todo
esto) — no hace falta una puerta de atrás nueva, ya existe por ser dueño.

## Se rompe si

Alguien escribe una pantalla o script nuevo que inserte en `movimientos` sin pasar por una
función `security definer` — sale `permission denied for table movimientos`. La respuesta
correcta no es devolver el privilegio: es escribir esa operación como RPC (o reusar
`registrar_movimiento`, una vez resuelta su firma duplicada).

## Aplicado en producción (2026-09-15, mismo día)

Con el ok puntual de Felipe, aplicado contra el proyecto `vovjyyiafkxteijimpuy` con
`apply_migration` (nombre `movimientos_insert_solo_rpc`). Verificado después, no solo por
el `success: true` de la llamada:

- `information_schema.role_table_grants` sobre `retail.movimientos`: `authenticated` quedó
  solo con `SELECT` (antes tenía también `INSERT`); `anon` sigue sin nada.
- El comentario de `movimientos_insert` quedó guardado tal cual (`pg_policy` +
  `obj_description`).
- `get_advisors` (security) después del cambio: cero advertencias nuevas sobre
  `retail.movimientos` o la policy `movimientos_insert`. Las únicas menciones de
  "movimientos" en el reporte son las funciones `security definer` expuestas por
  PostgREST —esperadas, son el diseño, no algo que este cambio introdujo.

## Lo que falta

1. **`force row level security`**, con su propia prueba de que venta/transferencia/conteo
   siguen insertando — sigue en BACKLOG desde ADR-0042.
2. **Las dos firmas de `registrar_movimiento`** — `drop function` de la que sobra, igual que
   se hizo con `recibir_lote` (ADR-0004). Anotado en BACKLOG, no bloquea nada hoy.
3. **`retail.transferencias`** tiene la misma forma de policy de INSERT
   (`transferencias_insert`, `0004_rls.sql`) sin verificar si tiene el mismo problema.

Los tres quedan anotados en `docs/BACKLOG.md`.
