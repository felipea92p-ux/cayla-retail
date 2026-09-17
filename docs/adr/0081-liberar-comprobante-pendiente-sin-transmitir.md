# ADR-0081 — Liberar un comprobante pendiente que nunca se transmitió ("sin espera")

**Fecha:** 2026-09-17
**Estado:** Aplicado en local (`20260917130050_comprobante_no_emitido.sql`), verificado con
6 escenarios en `psql` + rollback. **Producción: NO aplicada** — la pega Felipe cuando
decida, con el prefijo `retail.` en el SQL Editor (ver `/CLAUDE.md`, sección "Cómo aplicar
SQL a producción"). Entra al diccionario (`docs/datos/generado/`) recién cuando se aplique
allá.
**Afecta:** tabla `retail.comprobantes` (3 columnas nuevas + 2 constraints reemplazadas + 1
constraint nueva); función nueva `retail.marcar_comprobante_no_emitido`.
`apps/web/components/ComprobantesPanel.tsx`, `apps/web/lib/comprobantes-reglas.ts`,
`apps/web/lib/comprobantes.ts`, `packages/database/src/types.ts`. **No toca**
`retail.anular_comprobante`, `retail.actualizar_transmision_comprobante`, ni
`apps/web/app/api/lucode/*` — a propósito, ver más abajo. Los 2 comprobantes reales en
producción (`B004-000004`, `B004-000005`) no se tocaron: esta tarea es solo el mecanismo.

## El problema

`retail.emitir_comprobante` reserva el correlativo SUNAT (vía `fn_reservar_numero_serie`)
ANTES de que exista intención de transmitir — el `insert` cae en `estado = 'pendiente'`, sin
tocar Lucode/SUNAT para nada (`0010_facturacion.sql:209-237`, comentario de líneas 89-93).
Si esa venta nunca se cobra o el comprobante se emitió por error, la fila queda pendiente
para siempre: `ComprobantesPanel.tsx` solo ofrecía "Transmitir" (reintentar el envío) o,
si ya estaba aceptado, "Anular" — no existía una tercera vía para decir "este número no va
a usarse, dejen de mostrármelo como pendiente". `anular_comprobante` rechaza explícitamente
cualquier `estado <> 'aceptado'` (línea 314-316) porque anular implica que SUNAT ya lo supo
— usarla acá habría sido semánticamente falso.

## Decisión de producto (ya tomada por Felipe, no se revisó acá)

Felipe ya decidió la forma: **"Liberar sin espera"** — un botón que libera el estado de
inmediato, sin el plazo de 48h que se había barajado como alternativa. Esta ADR documenta
el razonamiento TÉCNICO del resto del diseño a partir de esa decisión, no la vuelve a
discutir.

## Decisión

**DECIDÍ: el correlativo/número NUNCA se libera para reuso — solo cambia el `estado` de la
fila.** En facturación electrónica peruana un hueco en la numeración es normal y legal; lo
que no se permite es reutilizar un número ya reservado. Como consecuencia directa, esta
migración y esta RPC no tocan Lucode/SUNAT en ningún punto: un comprobante `pendiente`
nunca se transmitió, así que no hay nada que "avisarle" a nadie — a diferencia de
`anular_comprobante`, que sí orquesta una baja real vía `/api/lucode/anular`.

**DECIDÍ: un estado nuevo, `'no_emitido'`, no reutilizar `'anulado'`.** Un comprobante
`anulado` es uno que SUNAT aceptó y luego se dio de baja formalmente — tiene
`anulado_por`/`anulado_at`/`respuesta_anulacion` con sentido legal real. Marcar un
`pendiente` liberado como `'anulado'` habría sido mentir: le habría dado a una fila que
SUNAT NUNCA VIO la misma etiqueta que a una que SUNAT sí vio y dio de baja. Mismo criterio
que ya separa `'rechazado'` (SUNAT respondió que no) de `'pendiente'` (SUNAT nunca
respondió porque nunca se le preguntó) — dos historias distintas necesitan dos palabras
distintas, y esta pantalla ya lo distingue con colores (rojo vs ámbar) precisamente por
eso.

**DECIDÍ: solo `estado = 'pendiente'` es liberable — `'rechazado'` queda afuera, a
propósito.** Un `rechazado` SÍ se transmitió: SUNAT/Lucode respondió con un rechazo real
(`motivo_rechazo`, `respuesta_sunat` llenos, `enviado_at` seteado). Su único camino de
salida ya existe y ya funciona: corregir el dato y volver a apretar "Transmitir" — la
pantalla ya lo permite (`puedeTransmitir = estado === "pendiente" || estado === "rechazado"`,
`ComprobantesPanel.tsx`) y el guard de servidor en
`app/api/lucode/emitir/route.ts:89` ya lo refuerza. Sumarle una segunda salida ("dejar de
intentar, liberar") mezclaría dos decisiones de negocio distintas en la misma fila
(¿reintento o abandono?) que Felipe nunca pidió, y la frase que él eligió — "reservó
correlativo SUNAT **pero nunca transmitió**" — describe exactamente `pendiente`, no
`rechazado`. Si algún día un rechazo se vuelve genuinamente irrecuperable (ej. la clienta
se fue y no hay forma de corregir el RUC), es una decisión de producto nueva y explícita,
no una que esta migración deba dar por sentada. Verificado en el escenario 3b: un
`rechazado` se rechaza con el mismo mensaje que un `aceptado`/`anulado`.

**DECIDÍ: `retail.marcar_comprobante_no_emitido(p_comprobante_id uuid, p_motivo text)`, con
las mismas guardas que `anular_comprobante`** (mismo archivo base, `0010_facturacion.sql`):
`security definer`, exige `fn_es_lider()` — es una decisión irreversible con implicancia de
compliance, mismo criterio que anular, no algo que un colaborador de sede deba poder hacer
solo —, exige `estado = 'pendiente'` con un mensaje que dice en qué estado está de verdad,
exige `p_motivo` no vacío (mínimo 3 caracteres, mismo patrón). El orden de las
validaciones (líder → existe → estado → motivo) copia el de `anular_comprobante` línea por
línea a propósito: dos funciones hermanas que difieren en el orden de sus guardas son un
bug esperando a pasar la próxima vez que alguien las edite mirando solo una.

**DECIDÍ: rastro auditable con columnas nuevas, nunca un `DELETE`** — `motivo_no_emitido
text`, `marcado_no_emitido_por uuid references public.personas(id)`,
`marcado_no_emitido_at timestamptz`. Calco exacto del patrón que ya usa la anulación
(`motivo_anulacion`/`anulado_por`/`anulado_at`) por la misma razón: dentro de seis meses,
"se liberó" sin quién/cuándo/por qué no le sirve a nadie (principio 8). `motivo_no_emitido`
entra al `select` de `getComprobantesMes` (`comprobantes.ts`) para mostrarse en la fila,
igual que `motivo_anulacion` — `marcado_no_emitido_por`/`_at` se guardan pero no se
muestran en esta pantalla, mismo criterio que ya aplica hoy a `anulado_por`/`anulado_at`
(tampoco están en ese `select`).

**DECIDÍ: candado de esquema — `estado` entra al `CHECK` que ya limitaba sus valores
posibles, nunca fue "texto libre sin restricción" en este archivo.** El contexto que traía
esta tarea decía que en producción el campo no tiene un `CHECK` estricto; verificado
directo contra el Postgres LOCAL (`pg_get_constraintdef`) antes de escribir una sola línea:
`comprobantes_estado_check` SÍ existe acá y SÍ limita a los 5 valores originales — nace en
`0010_facturacion.sql:56`, la migración que consolida la "baseline limpia" de Facturación,
y no hay evidencia de que se haya tocado después (grep sobre las 74 migraciones del repo).
Si producción de verdad no tiene ese `CHECK` (posible: viene de un historial de 7
migraciones incrementales distinto, `0032`/`0034`/`0037-0041`, que esta baseline
reemplazó), es una divergencia previa entre local y producción — no algo que esta tarea
deba resolver, pero si Felipe la pega allá y el `drop constraint` falla porque el nombre
real es otro, es la primera señal a mirar (ver "Se rompe si").

**HALLAZGO, no obvio, encontrado verificando contra el Postgres real en vez de asumir:**
`comprobantes_transmitido_tiene_entorno` (`estado = 'pendiente' OR entorno_transmision IS
NOT NULL`, agregada en `0010` desde el historial de producción) habría bloqueado esta RPC
si no se tocaba — un comprobante liberado desde `pendiente` nunca pasa por
`actualizar_transmision_comprobante`, así que `entorno_transmision` se queda en `NULL`
para siempre, y `estado` deja de ser `'pendiente'`. Sin ajustar esa constraint, el primer
`UPDATE` real de la RPC habría reventado con una violación de `CHECK` en vez de liberar
nada. Se amplió la excepción a `estado in ('pendiente', 'no_emitido')`. Recreada `NOT
VALID` — no porque haga falta acá (el Postgres local no tiene la fila legacy que motivó el
`NOT VALID` original), sino porque este archivo, sin el prefijo `retail.`, es exactamente
el que se va a pegar en producción algún día (ver `/CLAUDE.md`), y ahí SÍ existe la boleta
transmitida antes de que `entorno_transmision` existiera (comentario original, `0010`
línea 80-84). Un `DROP + ADD` validado a secas correría limpio hoy acá y reventaría el día
que se pegue allá — exactamente el tipo de bug que un `NOT VALID` bien puesto evita. La
nueva constraint (`comprobantes_no_emitido_tiene_motivo`) SÍ se agregó validada — ninguna
fila, ni local ni en producción, puede tener `estado = 'no_emitido'` todavía, así que no
hay legado que temer.

**DESCARTÉ una ruta `/api/...` nueva.** `anular_comprobante` pasa por
`/api/lucode/anular` porque ese servidor necesita orquestar una llamada real a Lucode
ANTES de tocar la base (y esconder credenciales de Lucode del navegador). Esta acción no
llama a ningún proveedor externo — no hay nada que el servidor deba orquestar u ocultar.
Mismo criterio que ya usan `onEmitir`/`onRegistrarSerie` en el propio
`ComprobantesPanel.tsx`: RPC directa desde el cliente vía `supabase.rpc(...)`, sin capa
intermedia. Sumar una ruta acá habría sido una pieza más "porque sí", no porque el
problema la necesite (principio 3).

**DESCARTÉ el plazo de 48h** que se había barajado como alternativa — es la parte que
Felipe ya resolvió (ver arriba). Lo apunto acá solo para que quede un registro de que se
consideró y por qué no es lo que se construyó, no para reabrirlo.

## Se rompe si

Se pega en producción y el nombre real de `comprobantes_estado_check` (o de
`comprobantes_transmitido_tiene_entorno`) no es el que este archivo asume — el `DROP
CONSTRAINT` fallaría con "constraint does not exist" en vez de silenciarse; es la señal de
que producción heredó esas restricciones con otro nombre desde su propio historial
(`0032`/`0034`/`0037-0041`) y hay que mirar `pg_get_constraintdef` allá antes de reintentar,
igual que se hizo acá antes de escribir la migración. También se rompe si algún día se
decide que `'rechazado'` sí debería ser liberable sin pasar por esta ADR de nuevo: hoy
`accionComprobante` en `ComprobantesPanel.tsx` calcula `puedeLiberar` con un único `if`
(`estado === "pendiente"`) — ampliarlo sin revisar el razonamiento de arriba reabriría la
mezcla "reintentar vs. abandonar" que se descartó a propósito.

## Cómo se verificó

6 escenarios en una transacción `psql` con `request.jwt.claim.sub` simulado (mismo patrón
que ADR-0066/ADR-0078), cada uno terminado en `ROLLBACK`; confirmado después que
`select count(*) from retail.comprobantes where cliente_nombre like 'ADR-0081 escenario%'`
devuelve 0 — nada quedó escrito en el Postgres compartido:

1. Comprobante `pendiente` (Felipe, líder) → `marcar_comprobante_no_emitido` con motivo →
   `estado = 'no_emitido'`, `motivo_no_emitido` guardado, `marcado_no_emitido_por` y
   `marcado_no_emitido_at` completos.
2. Comprobante `aceptado` → `Solo se puede liberar un comprobante pendiente que nunca se
   transmitió a SUNAT (este está aceptado)`.
3. Comprobante `anulado` → mismo mensaje, con `anulado` en el hueco.
3b. Comprobante `rechazado` → mismo mensaje, con `rechazado` en el hueco — confirma que la
   decisión de dejarlo afuera se cumple de verdad, no solo en el diseño.
4. Motivo vacío (`''`) sobre un `pendiente` → `El motivo es obligatorio para liberar un
   comprobante como no emitido`.
5. Micaela (colaboradora, no líder) sobre un `pendiente` → `Solo un líder puede liberar un
   comprobante no emitido — es una decisión irreversible con implicancia de compliance` —
   el guard de líder corre ANTES que el de estado, así que ni siquiera importa si Micaela
   podía ver ese comprobante.

`pnpm --filter web typecheck`: limpio. `pnpm --filter database typecheck`: limpio (se
actualizó `packages/database/src/types.ts` a mano con las 3 columnas nuevas y la función
nueva — no se corrió `gen-types`: habría traído de regalo el esquema de otras ~9
migraciones que otras sesiones dejaron sin aplicar en este mismo Postgres compartido, ver
"Nota al margen" abajo). `pnpm --filter web lint`: limpio. `pnpm --filter web test`:
293/293 en verde, mismo número que reporta ADR-0080 el mismo día — sin regresión.

## Nota al margen: el Postgres local estaba 10 migraciones atrás

Antes de poder aplicar la propia, `supabase migration up --local` encontró 10 migraciones
con fecha `20260916*` que ya estaban commiteadas en este branch pero nunca se habían
aplicado al Postgres compartido (`supabase_migrations.schema_migrations` saltaba de
`20260915231500` directo a `20260917124059`, la del agente hermano de Insumos). Verificado
antes de tocar nada: ninguna tenía `drop table`/`truncate`/`delete` — todas eran
`drop function if exists` + `create function` (cambio de firma, patrón normal) o DDL
aditivo. Se aplicaron con `--include-all` (la propia salida de la CLI lo sugiere para
exactamente este caso) junto con la propia. No es un problema causado por esta tarea, pero
sí una condición que cualquier sesión futura en este Postgres compartido se va a volver a
encontrar — la causa más probable es que el agente que aplicó `20260917124059` trabajaba
en un worktree/branch que todavía no tenía esas 10 migraciones en su propio
`supabase/migrations/`.

## Lo que falta

1. **Aplicar en producción** — pendiente de que Felipe decida, con el prefijo `retail.` en
   el SQL Editor. Verificar primero el nombre real de `comprobantes_estado_check` /
   `comprobantes_transmitido_tiene_entorno` allá (ver "Se rompe si").
2. **Verificación visual en navegador** — no se hizo en esta sesión (esta tarea llegó sin
   `apps/web/.env.local` en este worktree, así que un servidor local no tendría con qué
   Supabase hablar sin configurarlo primero; fuera del alcance pedido). Mismo trade-off
   explícito que ya tomó ADR-0080 el mismo día.
3. Si algún día se decide que `'rechazado'` también debería ser liberable, es una decisión
   de producto nueva — ver "Se rompe si".
