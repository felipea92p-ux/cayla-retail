# ADR-0074 — Revocar EXECUTE público de las funciones "motor" (fn_aplicar_movimiento y afines)

**Fecha:** 2026-09-17
**Estado:** Aplicado en LOCAL y en PRODUCCIÓN. El primer intento contra producción lo bloqueó
el clasificador de auto mode de Claude Code; Felipe reconfirmó en el chat y el segundo
intento (vía MCP de Supabase, `apply_migration` contra `vovjyyiafkxteijimpuy`) sí se aplicó,
verificado después con `has_function_privilege` — ver hallazgo abajo, que cambió el
diagnóstico antes de aplicar nada.
**Afecta:** permisos (`GRANT`/`REVOKE`), ningún cambio de esquema ni de comportamiento para
ningún llamador legítimo. Migraciones nuevas:
`supabase/migrations/20260917150000_revocar_execute_fn_aplicar_movimiento.sql` y
`supabase/migrations/20260917150001_revocar_execute_correlativos_y_codigos.sql`.

## Hallazgo al verificar producción (solo lectura, 2026-09-17, vovjyyiafkxteijimpuy)

Antes de asumir que producción tiene el mismo hueco que local, se verificó
(`has_function_privilege`, mismo método que todo este documento) contra la base real.
El diagnóstico no es uniforme — production está a medio camino, no en el mismo punto que
local antes de esta tarea ni en el mismo punto después:

| Función | anon | authenticated | Diagnóstico |
|---|---|---|---|
| `fn_aplicar_movimiento` | `false` | `false` | **Ya cerrada.** No tiene el hueco que sí tenía local. |
| `fn_recalcular_costo_variante` | `false` | `false` | Ya cerrada — confirma ADR-0067. |
| `fn_asignar_codigo_producto` | `false` | `true` | **Ya en el estado angosto correcto** — igual al que buscaba `20260917150001`. |
| `fn_asignar_codigo_variante` | `false` | `true` | Igual. |
| `fn_reservar_numero_serie` | `false` | **`true`** | **Hueco real y vigente hoy.** `anon` ya está cerrado (alguien ya corrió un revoke de PUBLIC en algún momento, sin dejar rastro en ningún archivo de este repo) pero `authenticated` no — cualquier colaborador con sesión real puede llamarla directo y quemar un número de serie SUNAT sin emitir nada. |
| `fn_siguiente_correlativo` | `false` | **`true`** | Mismo hueco, mismo diagnóstico. |

También se confirmó: producción tiene una sola sobrecarga de `registrar_movimiento` (7
argumentos) — `registrar_movimiento_una_sola_firma` (20260916214600, BACKLOG) en efecto
colapsó las dos firmas ambiguas que sí sigue teniendo local. Sin acción de esta tarea (no
hay archivo local que replique ese parche todavía — sigue siendo cierto lo anotado en la
sección "Lo que falta" abajo).

**Conclusión, y lo que pasó después:** en producción, `20260917150000` resultó un no-op
seguro (ya estaba en ese estado) y `20260917150001` **sí cambió algo real** — cerró el hueco
vigente de `fn_reservar_numero_serie`/`fn_siguiente_correlativo` para `authenticated`, sin
tocar `fn_asignar_codigo_producto`/`variante` (ya estaban donde debían). Las dos se
aplicaron (`apply_migration`) y se reverificaron con la misma consulta: las cinco funciones
quedaron en `anon=false`/`authenticated=false` salvo `fn_asignar_codigo_producto`/`variante`
(`authenticated=true`, intencional). `get_advisors` (security) no mostró nada nuevo — solo el
aviso genérico ya esperado de "security definer callable by authenticated" en esas dos
últimas, que es la excepción intencional.

**De paso, verificando qué más seguía abierto:** `docs/datos/SQL-PENDIENTE-PRODUCCION.sql`
(2026-09-12, nunca marcado como ejecutado) describía algo mucho más grave — `authenticated`
con `TRUNCATE` sobre las tablas de `retail`, incluida `movimientos` ("riesgo de no pegarlo:
perder CAYLA entera"). Verificado contra producción (solo lectura,
`information_schema.role_table_grants`): **cero filas** — ya no existe, para ningún rol. Se
cerró en algún momento sin dejar rastro en ningún archivo de este repo, mismo patrón que
viene apareciendo todo el día (`fn_aplicar_movimiento`, `fn_recalcular_costo_variante`,
`registrar_movimiento_una_sola_firma`). El archivo que lo describe quedó desactualizado, no
el riesgo — vale la pena una pasada dedicada para reconciliar o archivar ese documento, pero
no se tocó en esta tarea.

## Contexto

`retail.fn_aplicar_movimiento(uuid)` es security definer y no valida nada por su cuenta:
lee el movimiento por id y aplica el delta a `stock` según `movimientos.tipo`. Confía en
que quien la llama ya insertó la fila después de validar el negocio. Verificado 2026-09-17
contra `pg_proc`/`has_function_privilege` en este mismo Postgres: tenía EXECUTE otorgado a
`anon` **y** a `authenticated`. Consecuencia concreta: cualquier `POST
/rest/v1/rpc/fn_aplicar_movimiento` anónimo con un `movimiento_id` de tipo `entrada` que ya
existe (expuesto en cualquier respuesta previa de la API que liste movimientos) reaplica esa
entrada y duplica stock, sin sesión ni permiso.

Es el mismo patrón que ya se encontró y cerró para `retail.fn_recalcular_costo_variante`
(`20260916090000_costo_promedio_ponderado.sql`, ADR-0067) — con una diferencia: acá no hace
falta inventar un costo arbitrario, alcanza con repetir un id real.

**Aclaración importante, para no sembrar una alarma que no corresponde:** ADR-0067 dice que
esa migración (con el revoke de `fn_recalcular_costo_variante`) **ya está aplicada en
producción**, autorizada por Felipe y aplicada vía MCP de Supabase contra `vovjyyiafkxteijimpuy`.
Este Postgres LOCAL compartido, en cambio, no la tiene — ni ella ni las otras nueve
migraciones fechadas 16-sep (confirmado: `select version from
supabase_migrations.schema_migrations` salta de `20260915231500` a `20260917124059` sin pasar
por ninguna de `20260916*`). La sección "Auditoría de migraciones pendientes en producción"
de BACKLOG (mismo día, MCP de Supabase, solo lectura) ya confirmó que production SÍ las
tiene todas. Es un atraso de este Postgres de desarrollo compartido por ~27 worktrees, no un
hueco de producción. No lo corregí (traer las 10 migraciones de golpe a este Postgres es una
decisión aparte, de varios módulos a la vez — corresponde pararse y confirmar con Felipe, no
improvisarlo dentro de esta tarea).

De paso, este mismo Postgres tiene aplicada `20260917124059_materia_prima_taller`, que no
existe en el árbol de este worktree — de otra sesión/worktree todavía no fusionada. Trajo
consigo `retail.recibir_insumos`/`retail.registrar_consumo_insumos` (confirmados security
definer, incluidos en el revoke de abajo) y, aparentemente, ya dejó
`fn_aplicar_movimiento_insumo` con EXECUTE cerrado a `anon`/`authenticated` desde su propia
creación (verificado con `has_function_privilege`: `f`/`f`) — sin acción de esta migración.

## Decisión

**Confirmé contra `pg_proc` (no contra archivos de migración — varios de estos llamadores
están redefinidos varias veces con `create or replace`, y lo único que importa es la
definición vigente) que TODOS los llamadores actuales de `fn_aplicar_movimiento` son security
definer:** `aprobar_devolucion`, `cerrar_conteo`, `cerrar_produccion`, `mover_interno`,
`recibir_compras`, `recibir_insumos`, `recibir_lote`, `registrar_cambio`,
`registrar_consumo_insumos`, `registrar_movimiento` (las dos sobrecargas), `registrar_venta`,
`revertir_produccion`, `transferir`. Ninguno fuera de `retail`, ningún trigger la invoca.
Corren con el privilegio del owner — revocarle EXECUTE a `anon`/`authenticated` no los afecta.

**Aplicué el revoke de dos pasos que ya documentó ADR-0067** (hay que cerrar dos fuentes de
permiso distintas, no una — Postgres otorga EXECUTE a PUBLIC automáticamente al crear una
función, y `0005_grants.sql` otorga EXECUTE a `authenticated` por separado vía `alter default
privileges`):

```sql
revoke all on function retail.fn_aplicar_movimiento(uuid) from public;
revoke execute on function retail.fn_aplicar_movimiento(uuid) from authenticated;
```

**Extendí la revisión (pedida) a otras funciones "motor"** — mismo patrón: security definer +
sin auto-chequeo + EXECUTE público. Encontré cuatro más, con DOS remedios distintos porque no
todas tienen la misma forma de ser llamadas:

| Función | Muta | Llamadores (todos security definer) | Remedio |
|---|---|---|---|
| `fn_reservar_numero_serie` | `series_comprobantes.siguiente_numero` (numeración SUNAT) | `emitir_comprobante`, `emitir_nota` | Revoke completo (`public` + `authenticated`) |
| `fn_siguiente_correlativo` | `codigos_correlativos.ultimo` | `emitir_comprobante`, `emitir_nota`, `fn_asignar_codigo_producto` | Revoke completo |
| `fn_asignar_codigo_producto` | `productos.codigo` | `fn_asignar_codigo_variante` (sd), **`fn_variantes_asignar_codigo`** (trigger `AFTER INSERT` en `variantes`, **NO** security definer) | Revoke solo de `public` (ver abajo) |
| `fn_asignar_codigo_variante` | `variantes.codigo`, `codigos_barras` | igual | Revoke solo de `public` |

`fn_reservar_numero_serie`/`fn_siguiente_correlativo` son el hallazgo más serio de esta
revisión: llamarlas directo sin pasar por `emitir_comprobante`/`emitir_nota` quema un número
de serie **sin emitir nada** — un hueco permanente en una numeración que SUNAT exige
correlativa y sin saltos. Revoke completo, seguro: ningún trigger las invoca, sus tres
llamadores son security definer.

`fn_asignar_codigo_producto`/`fn_asignar_codigo_variante` necesitaron el remedio angosto.
`fn_variantes_asignar_codigo` (el trigger que las dispara en el alta normal de una variante)
NO es security definer — cuando `authenticated` inserta una variante directo por la API de
tablas de PostgREST (tiene `INSERT` en `retail.variantes`, confirmado en
`information_schema.role_table_grants`), el trigger corre como `authenticated`, no como el
owner. Un revoke completo le habría roto ese alta real con "permission denied for function".
`anon`, en cambio, no tiene ningún grant de tabla sobre `productos`/`variantes` — su único
camino a estas dos funciones es la llamada RPC directa. Y acá había una trampa: `anon` no
tiene una entrada propia en el ACL de estas funciones (confirmado leyendo `proacl` crudo:
`{=X/postgres,postgres=X/postgres,authenticated=X/postgres}`, sin entrada `anon=...`) — su
acceso viene entero del grant automático a PUBLIC. `revoke execute ... from anon` habría sido
un no-op idéntico al error de dos-fuentes que ADR-0067 ya documentó para
`fn_recalcular_costo_variante`. El remedio correcto es `revoke all ... from public`, que
apaga esa entrada sin tocar la entrada propia de `authenticated`.

**Revisado y descartado, sin acción:** `fn_sububicacion_por_defecto` (el otro nombre que
pidió mirarse) — `language sql`, `stable`, un solo `select`, no security definer. No bypassa
RLS, no aplica el patrón. Los otros ~30 `fn_*` de `retail` con EXECUTE abierto que no entraron
en esta migración son o bien funciones trigger (`returns trigger` — Postgres no permite
invocarlas fuera de un trigger, el grant es inerte) o bien lectura pura (`stable`, `language
sql`, sin ninguna escritura: `fn_es_lider`, `fn_mi_perfil`, `fn_persona_actual_resumen`,
`fn_tiene_acceso_retail`, `fn_ubicacion_actual_persona`, `fn_colaboradores`, `fn_proveedores`,
`fn_nombres_personas`, `fn_ventas_del_dia`, `fn_puede_operar_ubicacion`,
`fn_puede_registrar_compras`, `fn_dynamic_disponibles`). Ninguna es el patrón "motor sin
auto-chequeo": no mutan estado.

**Revisado y descartado, sin acción:** `codigos_correlativos`/`series_comprobantes` tienen
`GRANT` de tabla a `authenticated` (INSERT/UPDATE/DELETE) pero RLS habilitado con SOLO policy
de `SELECT` — sin policy de escritura, un intento de escribirlas directo por la API de tablas
ya cae en cero filas por su cuenta (RLS sin policy que aplique = deniega, no error). No hace
falta agregar policy.

## Verificación (smoke test, `psql` + `ROLLBACK`, mismo patrón que ADR-0066)

Contra el Postgres local, ya con las dos migraciones aplicadas, usando `set local role` (no
solo el JWT — esto prueba el `GRANT` real, no solo RLS) más `set local request.jwt.claim.sub`
para el camino legítimo (Felipe, `lider`, mismo `auth_user_id` que ya usa
`scripts/pruebas/registrar_cambio.mjs`):

- `anon` y `authenticated` directo a `fn_aplicar_movimiento`, `fn_siguiente_correlativo`,
  `fn_reservar_numero_serie` → **`ERROR: permission denied for function`** en los seis casos.
- `anon` directo a `fn_asignar_codigo_variante` → **permission denied**.
- `authenticated` (Felipe) directo a `fn_asignar_codigo_variante` → **funciona**
  (`BLU-0001-NEG-S`) — confirma que el remedio angosto no rompió el camino del trigger.
- `authenticated` (Felipe) vía `registrar_movimiento(...)` de punta a punta → **funciona**,
  devuelve un `movimiento_id` real — confirma que el wrapper security definer sigue pudiendo
  llamar a `fn_aplicar_movimiento` internamente pese al revoke.

Todo dentro de una transacción con `SAVEPOINT` por caso y `ROLLBACK` final — nada quedó
escrito en el Postgres compartido.

**Nota lateral de la propia prueba, ya confirmada:** para probar `registrar_movimiento` hubo
que pasar los 7 argumentos posicionales explícitos — con 6, Postgres no puede elegir entre sus
dos sobrecargas locales (`ambiguous function call`). Verificado después contra producción
(lectura, `execute_sql`): ahí `registrar_movimiento` tiene una sola firma (7 argumentos,
`p_sububicacion_id` incluido) — `registrar_movimiento_una_sola_firma` (20260916214600, sin
archivo local, ver BACKLOG) en efecto colapsó las dos. Sigue faltando traer ese parche a un
archivo de este repo (ver "Lo que falta").

## Se rompe si

Alguna integración externa (Edge Function, cron, script con `service_role`) llama
`fn_reservar_numero_serie`/`fn_siguiente_correlativo` directo por RPC en vez de a través de
`emitir_comprobante`/`emitir_nota` — no se encontró ninguna (`grep` sobre `apps/`/`packages/`
sin resultados: nada llama estas cinco funciones vía `.rpc()`, solo aparecen en los tipos
autogenerados de `packages/database`), pero si existiera fuera de este repo (otro servicio,
un webhook), se rompería con "permission denied" igual que `anon`/`authenticated`.

## Lo que falta

1. **El atraso de 10 migraciones de este Postgres local compartido** (16-sep, ver Contexto) —
   decisión de Felipe, no de esta sesión: si se trae de golpe con `npx supabase db reset` (el
   Postgres es compartido por ~27 worktrees, ADR-0066) o migración por migración a mano. Sin
   relación con producción — production ya las tiene todas (ver Contexto).
2. **`registrar_movimiento` con dos sobrecargas ambiguas en local, ya resuelto en producción**
   sin archivo en el repo (`registrar_movimiento_una_sola_firma`, 20260916214600) — traer ese
   parche a una migración de este repo para que local deje de tener el problema que
   producción ya no tiene.
3. **`docs/datos/SQL-PENDIENTE-PRODUCCION.sql` está desactualizado** — al menos su BLOQUE 1
   (`authenticated` con `TRUNCATE` sobre `retail`) ya no aplica, verificado hoy. No se
   revisaron los demás bloques del archivo (fuera del alcance de esta tarea) — antes de
   confiar en ese archivo para decidir qué falta, alguien tiene que reconciliarlo contra la
   base real o archivarlo.
4. **`pnpm datos:comparar` encontró 18 pantallas rotas en producción, sin relación con esta
   tarea** — ninguna de las cinco funciones de este ADR aparece en esa lista. Son funciones
   que sí existen en este código (`iniciar_traslado`, `cerrar_produccion`,
   `crear_producto_con_variantes`, `fn_prioridad_conteo`, entre otras — mayormente Producción
   del Taller, Traslados y Conteos) pero nunca llegaron a `vovjyyiafkxteijimpuy`. Detalle
   completo, ya regenerado, en `docs/datos/generado/DRIFT.md`. Requiere su propia sesión —
   toca varios módulos a la vez, no algo para resolver de paso en una migración de permisos.
