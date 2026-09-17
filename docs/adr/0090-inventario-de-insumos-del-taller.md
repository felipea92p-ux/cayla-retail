# ADR-0090 — Inventario de insumos del Taller: entra, se descuenta al cortar, avisa cuando falta

**Fecha:** 2026-09-17. Reescrita dos veces el mismo día — ver "Qué pasó antes de esta
versión" y "Reconciliación con la otra sesión" más abajo.
**Estado:** Aplicado en local por el riel normal de migraciones, timestamped en orden:
`20260917140000_insumos_taller_reconstruido.sql` (el espejo de las 3 tablas + vista + 2
funciones huérfanas) y `20260917141500_registrar_consumo_insumo.sql` (la única pieza
nueva). Verificado end-to-end en `psql` tras la reconciliación: `recibir_insumo` crea
lote + movimiento, `registrar_consumo_insumo` consume del lote más antiguo, recalcula
`costo_tela`, y rechaza sin partir cuando el lote no alcanza — huella cero confirmada.
**Producción:** `retail.insumos` / `retail.insumo_lotes` / `retail.movimientos_insumo` /
`retail.v_insumo_saldos` / `retail.recibir_insumo` / `retail.ajustar_insumo_por_conteo`
**ya existen ahí desde julio** (huérfanas del volcado de unificación con Dynamic, 0
filas, verificado de nuevo hoy vía MCP de Supabase de solo lectura contra el proyecto
`vovjyyiafkxteijimpuy`). **`20260917141500_registrar_consumo_insumo.sql` pegada en
producción el 2026-09-17** (ok explícito de Felipe, excepción puntual a D-11) —
confirmado `security_type=DEFINER` y `proacl` sin `public`; el resto (espejo) no se
tocó, ya estaba allá. Entra al diccionario (`docs/datos/generado/`) cuando se regenere
(`pnpm datos:generar:produccion`).
**Afecta:** local gana el espejo de las 3 tablas + vista + 2 funciones huérfanas
(idénticas a producción, verificado columna por columna, constraint por constraint, RLS
y grants incluidos) más `retail.registrar_consumo_insumo` (la única función
genuinamente nueva). **No toca** `abrir_produccion` / `cerrar_produccion` /
`anular_produccion` / `revertir_produccion` (`20260915130000`) ni
`NuevaOrdenProduccionForm.tsx`. Módulo 10 · Producción del Taller. Decisión de negocio:
**D-47** (`docs/datos/DECISIONES-2026-09-12.md:242-244`).

## Qué pasó antes de esta versión

La primera versión de hoy (commit `fd3488f`) construyó un esquema nuevo desde cero —
`insumos` / `insumo_stock` / `insumo_movimientos` / `produccion_insumos` + 3 funciones,
migración `20260917124059_materia_prima_taller.sql` — sin saber que un esquema para lo
mismo ya existía en producción, huérfano, desde la unificación con Dynamic de julio.
Recién se detectó al cerrar esa primera versión (quedó documentado en un Addendum de
este mismo archivo, ahora reemplazado por la sección "Decisión" de abajo) y quedó
pendiente de que Felipe decidiera. Decidió: **adoptar el huérfano.** Este documento
reemplaza esa primera decisión, no la esconde — el commit `fd3488f` sigue en el
historial de git tal cual quedó, y las 4 tablas + 3 funciones que construyó se
dropearon del Postgres local ese mismo día, en una transacción, confirmado limpio con
`information_schema.tables`/`pg_proc` antes de seguir.

## Reconciliación con la otra sesión (mismo día, tras la adopción)

Al reconstruir el esquema huérfano se encontró que **otra sesión, en un worktree
distinto, había hecho exactamente lo mismo en paralelo**: `git log --all` muestra el
commit `b8a8a05` ("reconstruye insumos_taller desde producción, no aplicada"), ya
fusionado a `main`, con un archivo `supabase/migrations/20260917140000_insumos_taller_reconstruido.sql`
— su propio mensaje de commit nombra explícitamente este worktree
(`cayla-invoices-module-review-451aa5`) como la "tercera versión distinta e
incompatible" y pide la misma decisión que Felipe ya había tomado acá. Comparado
línea por línea (`diff`, ignorando comentarios/espacios): **las dos reconstrucciones
son funcionalmente idénticas** — mismas columnas, mismos CHECK, mismas policies RLS,
mismos grants, mismos cuerpos de función — buena confirmación cruzada e independiente
de que ambas leyeron bien la producción real.

**DECIDÍ: adoptar el archivo de `main` como el canónico** (ya fusionado, mejor
comentado) en vez del propio (que vivía sin timestamp, como
`espejo-local-insumos-huerfanos-de-produccion.sql`, fuera del riel normal) — con UN
agregado propio: el `revoke execute ... from public` sobre `recibir_insumo`/
`ajustar_insumo_por_conteo`, verificado directo contra `pg_proc.proacl` en producción
(esas dos funciones YA están sin `EXECUTE` de `PUBLIC` allá; sin este revoke, el
espejo local habría quedado más permisivo que lo que replica). El archivo propio se
borró; `registrar_consumo_insumo` se renombró de `20260917140000` a `20260917141500`
para no compartir timestamp con el de `main` — mismo tipo de colisión que ya le pasó a
`20260915130000_produccion_del_taller.sql` antes.

## El problema

`producciones.costo_tela`/`costo_avios` son montos que alguien teclea en
`abrir_produccion`. Nadie sabe cuánta tela queda en el Taller, ni si el monto tecleado
corresponde a lo que salió del estante — y `producciones.costo_unitario` (columna
generada) hace matemática exacta sobre tres números que pueden ser inventados. Eso se
derrama fuera del Taller: D-31 mide el Taller por costo absorbido y a cada tienda por
margen contra ese costo; si el costo es tecleado, las dos medidas son estimaciones con
cara de dato. Diseño original (tablas, por qué no reusar `bom_items` ni `variantes`) en
`docs/datos/10-ROADMAP-DATOS.md:274-423` — ese diseño describía un esquema propio, hoy
descartado a favor del huérfano (ver abajo).

## Decisión

**DECIDÍ: adoptar tal cual el esquema huérfano de producción — `insumos`,
`insumo_lotes`, `movimientos_insumo`, la vista `v_insumo_saldos`, y las funciones
`recibir_insumo`/`ajustar_insumo_por_conteo`, ya existentes ahí desde julio — en vez de
la migración que construyó la primera versión de hoy.** Tres razones:

1. **Es más maduro que lo que se construyó hoy a ciegas.** El huérfano rastrea
   `insumo_lotes` **por lote**: proveedor, costo unitario, fecha de ingreso y documento
   propios de CADA entrada, no un promedio global como hacía `insumo_stock` (un único
   número por insumo+ubicación). Un Taller que compra la misma tela a proveedores y
   precios distintos en momentos distintos necesita exactamente esto para costear bien
   — es la clase de detalle que solo se ve si el diseño ya pasó por un ciclo de uso
   real, aunque ese uso haya sido en otra unidad de negocio (Dynamic) y hoy tenga 0
   filas acá.
2. **`recibir_insumo`/`ajustar_insumo_por_conteo` no son texto que alguien escribió hoy
   apurado: son funciones reales de un sistema hermano**, con su propio manejo de
   errores en español, su propio candado de permiso
   (`fn_puede_operar_ubicacion`, mismo helper que ya usa este módulo) y su propio
   criterio de redondeo (`numeric(12,4)` para costo unitario). Recrearlas de cero
   habría sido repetir trabajo ya hecho y ya en producción, además de introducir una
   segunda forma de resolver el mismo problema (el error exacto que evitar según
   principio 3).
3. **Construir un esquema paralelo con nombres de tabla que YA EXISTEN en producción
   (`retail.insumos`, etc., aunque vacías) es, directamente, no poder aplicarse nunca**:
   `create table retail.insumos` habría fallado de entrada contra la tabla huérfana ya
   existente. No es una preferencia de diseño, es que una de las dos rutas ni siquiera
   corre.

**DESCARTÉ: dar de baja el huérfano y quedarme con el diseño de hoy** (la otra opción
que planteaba el Addendum de la versión anterior de este documento). Habría significado
ignorar un esquema más completo ya verificado en producción para quedarme con uno
escrito en una tarde sin ese contexto — lo contrario de principio 12 (causa raíz, no la
primera solución a mano).

**DECIDÍ: descartar `produccion_insumos` como bridge table — es redundante.** El diseño
de hoy la necesitaba porque `insumo_movimientos` (su propio historial) no distinguía
"a qué producción fue este consumo" de forma que `producciones.costo_tela` pudiera
recalcularse sin un join adicional. El huérfano no tiene ese problema:
`movimientos_insumo.produccion_id` ya liga cada fila de consumo/devolución a su
corrida directo (ver el constraint `movimientos_insumo_produccion_segun_tipo`, que
además hace obligatorio ese vínculo para `consumo`/`devolucion` y lo prohíbe para
`compra`/`merma`/`ajuste` — la propia tabla fuerza la coherencia que
`produccion_insumos` existía para dar). Agregar una tabla puente encima de un esquema
que ya no la necesita habría sido la clase de pieza de más que principio 3 (simplicidad
radical) prohíbe.

**DECIDÍ: el candado de concurrencia de `registrar_consumo_insumo` es un `for update`
sobre la FILA DE `insumo_lotes` elegida, no sobre una fila de "stock" — porque este
esquema no tiene una tabla de stock materializada que bloquear.** A diferencia del
núcleo (`stock`/`fn_aplicar_movimiento`, que sí tiene una fila por variante+ubicación
para bloquear) o del propio diseño de hoy que se descartó (`insumo_stock`, calcado de
ese patrón), acá el saldo es 100% derivado: `v_insumo_saldos` lo sabe sumando
`movimientos_insumo` con signo, y no hay ninguna fila que represente "el stock actual
de este insumo" de forma directa. Por eso el candado tiene que ir sobre lo único que sí
es una fila real y estable: el lote. `registrar_consumo_insumo`
(`20260917140000_registrar_consumo_insumo.sql`) recorre los lotes de ese insumo+
ubicación en orden de antigüedad (`order by fecha_ingreso, created_at`) con un cursor
`for update` — Postgres bloquea cada fila según el cursor la va recorriendo, en ese
mismo orden — y **recalcula el saldo remanente de CADA lote candidato recién después de
tomar su lock** (`cantidad_ingresada - suma de consumo+merma de ese lote + suma de
devolución de ese lote`), nunca antes: leer el saldo antes del lock es exactamente el
bug que dos cortes concurrentes del mismo lote explotarían (las dos transacciones
leerían "quedan 6,5 m" y las dos completarían, aunque juntas pidan más de lo que hay).
El loop corta apenas encuentra un lote con saldo real > 0 — un lote más nuevo que ni se
llegó a mirar queda sin bloquear. **Verificado con dos procesos `docker exec` reales en
paralelo, no solo en teoría** — ver escenario de concurrencia abajo.

**DECIDÍ, además del candado por lote (que el encargo original pedía), bloquear también
la fila de `producciones` desde el inicio de la función, con `for update`.** No es
redundante con el candado del lote: protege un problema distinto. `costo_tela`/
`costo_avios` se recalculan con un `SUM` sobre TODO el historial de
`movimientos_insumo` de esa producción — sin este lock, dos consumos concurrentes del
MISMO tipo (dos telas distintas cortadas a la vez en la misma corrida) podrían pisarse
el costo uno al otro: cada `UPDATE` vería solo su propia fila recién insertada, no la
del otro todavía sin confirmar, y el que termine de escribir último dejaría el costo
con el consumo del otro perdido — un estado inconsistente real (principio 2), aunque
sin él el saldo del lote en sí mismo hubiera quedado correcto. Mismo orden de lock que
ya usa `cerrar_produccion` (`producciones` primero): no hay ningún otro camino en este
módulo que bloquee `insumo_lotes` antes que `producciones`, así que no se introduce un
ciclo de deadlock nuevo.

**DECIDÍ: NO partir automáticamente el consumo entre varios lotes cuando el más antiguo
no alcanza.** Alcance chico a propósito (principio 5: un Taller de una sola ubicación,
no una cadena que necesite optimizar cuántos lotes toca cada corte). Si el lote más
antiguo con saldo tiene menos de lo pedido, la función rechaza con el saldo exacto de
ESE lote y sugiere una segunda llamada — nunca completa con dos costos unitarios
distintos en una sola fila de movimiento, que además habría exigido inventar qué hacer
si el segundo lote tampoco alcanza (¿partir en 3? ¿en N?). Un rechazo claro con el
número real es más simple y más honesto que una función que adivina.

**DECIDÍ: separar espejo local (nunca a producción) de la migración nueva (sí a
producción) — pero usando el riel timestamped normal para las dos, no un nombre fuera
de ese riel.** Primer intento propio: `espejo-local-insumos-huerfanos-de-produccion.sql`
(sin timestamp, mismo patrón que `benja-migracion.sql`, para que `supabase migration
up`/`db reset` lo saltee solo). La reconciliación con `main` (ver sección de arriba)
cambió esto: el archivo que ya estaba fusionado ahí SÍ usa el riel normal
(`20260917140000_insumos_taller_reconstruido.sql`), así que se adoptó ese en vez de
mantener dos convenciones distintas para el mismo tipo de archivo. Ambos enfoques
cumplen la regla real que importa — pegar sus `create table` en producción **fallaría
de entrada** contra las tablas huérfanas que ya están ahí, así que su propio encabezado
lo dice en mayúsculas — el riel normal simplemente evita tener una excepción de
nomenclatura más en el repo. `20260917141500_registrar_consumo_insumo.sql` es la única
pieza que producción no tiene todavía, la que sí se pega ahí cuando Felipe decida.

**DECIDÍ: verificar RLS/policies/grants/índices del huérfano contra producción en vez
de inferirlos, ya que el MCP de Supabase (solo lectura) estaba disponible.** El
encargo original anticipaba que esto podía quedar como inferencia ("dejalo anotado si
no podés confirmarlo") — se pudo confirmar, así que el espejo local replica lo
verificado, no una suposición:
- `insumos`: 3 policies reales, con esos nombres exactos —
  `insumos_select_autenticado` (select, `auth.role() = 'authenticated'`),
  `insumos_insert_lider` e `insumos_update_lider` (`fn_es_lider()`). **Sin policy de
  DELETE** — un insumo se archiva (`archivado_at`), nunca se borra.
- `insumo_lotes`/`movimientos_insumo`: UNA policy cada una, solo `select` con
  `fn_puede_operar_ubicacion(ubicacion_id)` — sin ninguna de insert/update/delete: se
  escribe solo a través de `recibir_insumo`/`ajustar_insumo_por_conteo`/
  `registrar_consumo_insumo`, las tres `security definer` con dueño `postgres`, que en
  este Postgres (y, confirmado, también en producción) tiene `BYPASSRLS` — el mismo
  patrón exacto que ya usan `producciones`/`produccion_lineas`.
- 3 índices reales que el primer volcado (solo columnas/constraints) no había traído:
  `insumo_lotes_codigo_unico` (unique parcial `(insumo_id, codigo_lote) where
  codigo_lote is not null` — una regla de negocio real, no cosmética: dos lotes del
  mismo insumo no pueden compartir código), `insumo_lotes_insumo_ubicacion_idx`, y en
  `movimientos_insumo`: `insumo_ubicacion_idx`, `lote_idx (insumo_lote_id, tipo)` —
  este último es, además, exactamente el índice que la búsqueda por lote de
  `registrar_consumo_insumo` necesita — y `produccion_idx`.
- Grants: `authenticated` tiene `select, insert, update, delete` a nivel de tabla en
  las 3 tablas + la vista (igual en producción); lo que realmente permite escribir o
  no es la RLS de arriba, no el grant — mismo patrón que el resto del módulo.

**HALLAZGO, no corregido acá — para que Felipe lo sepa, no para arreglarlo sin
consultar:** `retail.v_insumo_saldos` en producción **no tiene `security_invoker`**
(confirmado: `reloptions` es `null`) y su dueño, `postgres`, tiene `BYPASSRLS`
(confirmado). Combinado, eso significa que si algún día una pantalla consulta la vista
DIRECTO (`supabase.from('v_insumo_saldos').select(...)`, sin pasar por una función
`security definer`), **cualquier `authenticated` vería el saldo de TODAS las
ubicaciones, no solo la suya** — la vista no hereda el filtro de
`fn_puede_operar_ubicacion` de sus tablas base, porque una vista sin
`security_invoker` corre con los permisos de su dueño, y el dueño se salta RLS. Hoy es
inerte: 0 filas, ninguna pantalla la toca, y las dos funciones que sí la leen
(`ajustar_insumo_por_conteo`, y ninguna otra) son `security definer` y ya se saltan RLS
de por sí, así que el problema no les cambia nada. El espejo local reproduce esto tal
cual (no le agregué `security_invoker` que producción no tiene — hacerlo habría hecho
que el espejo mienta sobre cómo se comporta lo real). Corregirlo es una decisión sobre
un objeto que ya vive en producción — fuera del alcance de esta tarea, pero real y
verificado, no una sospecha.

**DESCARTÉ: tocar la firma de `cerrar_produccion` para que reciba insumos directo** —
mismo argumento que la versión anterior de este documento: el bug de sobrecarga viva
que ya sufrió `registrar_produccion`/`cerrar_produccion` (16 argumentos en producción,
15 en local, sin migración gemela — hueco 1 de `docs/datos/modulos/
10-produccion-del-taller.md`) es la razón concreta para no repetir el patrón de "agregar
un parámetro a una función que la app ya llama". Una función nueva y composable no
exige tocar el formulario existente.

**DESCARTÉ: idempotencia por `p_token`** para `registrar_consumo_insumo`, igual que
`recibir_insumo`/`ajustar_insumo_por_conteo` (heredadas, sin tocar) tampoco la tienen.
Se agrega el día que un reintento de red duplicado sea un problema real medido, no
antes (principio 5).

**DECIDÍ: revocar `EXECUTE` de `PUBLIC` en `registrar_consumo_insumo`, igual que ya
tienen `recibir_insumo`/`ajustar_insumo_por_conteo` en producción (verificado:
`proacl` no trae una entrada vacía de rol, solo `postgres`/`authenticated`).** Este
Postgres local, como cualquier Postgres, otorga `EXECUTE` a `PUBLIC` automáticamente al
crear una función — mismo hallazgo que la versión anterior de este documento ya
encontró para `fn_aplicar_movimiento_insumo`, reconfirmado hoy al recrear
`recibir_insumo`/`ajustar_insumo_por_conteo` en el espejo (antes del `revoke`, su
`proacl` sí traía la entrada vacía de PUBLIC). `0005_grants.sql:24` además ya le da
`EXECUTE` a `authenticated` por default a toda función nueva del schema `retail` — el
`grant` explícito al final de la migración es redundante con eso, pero se deja, por
claridad, como ya hace el resto del módulo.

## Cómo se verificó

10 escenarios contra el Postgres local, todos con `set local request.jwt.claim.sub`
simulando la sesión (mismo patrón que ADR-0066) — 9 en una sola transacción cerrada con
`ROLLBACK` (nada quedó escrito: confirmado `select count(*) from retail.insumos where
codigo like 'ZZTEST-%'` = 0 después) y 1 de concurrencia real que sí necesitó
`COMMIT` (dos procesos de sistema operativo distintos no pueden competir por un lock
dentro de una transacción que ninguno comparte) con limpieza explícita al final
(confirmado huella cero con `DELETE` + conteo):

1. `recibir_insumo` (heredada) sigue funcionando igual sobre el espejo local: 10 m de
   tela nueva a S/8.50/m (`p_costo_total=85`) → crea el lote con `cantidad_ingresada=10,
   costo_unitario=8.5000` y su movimiento `compra` gemelo.
2. Un segundo lote del mismo insumo+ubicación, más nuevo (5 m a S/9.00).
3. `registrar_consumo_insumo` consume 3,5 m → toma el lote MÁS ANTIGUO (confirmado
   `insumo_lote_id` = el del paso 1, no el del paso 2) con SU costo (8.50, no 9.00);
   `producciones.costo_tela` pasa de 0 a **29.75** (=3.5×8.50); `costo_avios` (tecleado
   a mano en 15.00 al abrir la producción de prueba) **sigue en 15.00** — no se pisa a
   0 ni se toca, porque esta producción no registró ningún consumo de tipo `avio`.
4. Pedir 100 cuando el lote más antiguo (ya consumido en el paso 3) solo tiene 6,5 →
   rechazo exacto: *"El lote más antiguo con saldo tiene 6.5 y pediste 100 — si de
   verdad necesitas cruzar de lote, registra el consumo en dos llamadas"*; confirmado
   que no se insertó ningún movimiento (conteo de `consumo` para ese insumo sigue en 1,
   el del paso 3).
5. Un insumo que nunca se recibió (0 lotes) → mensaje DISTINTO al del paso 4: *"No hay
   stock de este insumo en esta ubicación — recíbelo con recibir_insumo antes de
   registrar consumo"*.
6. Un `p_insumo_id` que no existe en absoluto → *"El insumo
   00000000-0000-0000-0000-000000000000 no existe"* (falla antes de buscar lotes).
7. La misma producción, forzada a `estado='anulada'` (una segunda producción de prueba
   insertada directo con ese estado, no vía `cerrar_produccion`) → *"El consumo de
   insumos se registra antes de cerrar la orden — esta ya está anulada"*.
8. Micaela (colaboradora fija a Tienda Trujillo) intentando consumo sobre una
   producción del Taller → *"No tienes permiso para registrar consumo de insumos en
   esa producción"* — confirmado además, en el mismo escenario, que Micaela SÍ puede
   `recibir_insumo` en SU PROPIA ubicación (Trujillo): el candado es de ubicación, no
   un bloqueo general a colaboradores.
9. `select` sobre el estado final antes del `ROLLBACK`: 2 lotes (10 y 5), 3 movimientos
   (`compra`×2, `consumo`×1), `costo_tela=29.75`, `costo_avios=15.00` — exactamente lo
   esperado por los pasos 1-3, nada más.
10. **Concurrencia real**, no simulada: un lote committeado con 10 m, dos procesos
    `docker exec supabase_db_cayla-retail psql` **del sistema operativo, en paralelo de
    verdad** (`&`/`wait` en bash, cada uno con su propio `pg_sleep(0.5)` antes de
    llamar a la función para maximizar el solape), cada uno pidiendo 6 m del mismo
    lote. Resultado: el primero en tomar el lock consumió sus 6 m y comprometió
    (`costo_tela` de esa producción de prueba pasó a 30.00 = 6×5.00); el segundo quedó
    bloqueado esperando el lock, y al obtenerlo **recalculó el saldo DESPUÉS de la
    espera** (vio 4, no los 10 originales) y rechazó limpio: *"El lote más antiguo con
    saldo tiene 4 y pediste 6..."* — el saldo nunca bajó de 4, nunca llegó a -2. Se
    limpiaron a mano (`DELETE`, en ese orden: movimientos, lotes, producción, insumo)
    los objetos que esta prueba sí tuvo que comprometer para que la carrera fuera real;
    confirmado conteo 0 en las 3 tablas después.

## Lo que falta

1. **Aplicar `20260917140000_registrar_consumo_insumo.sql` en producción** — la única
   pieza pendiente de esa base; el resto del esquema ya está ahí desde julio. Decisión
   y ejecución de Felipe (D-11), con el prefijo `retail.` en el SQL Editor.
2. **Conectar el frontend**: `NuevaOrdenProduccionForm.tsx` sigue sin usar
   `recibir_insumo`, y no existe ninguna pantalla para `registrar_consumo_insumo` ni
   para ver `v_insumo_saldos`. A propósito fuera de esta tarea (era así también en la
   versión anterior de este documento).
3. **El hallazgo de `v_insumo_saldos` sin `security_invoker`** (ver "Decisión" arriba)
   — no bloquea nada hoy (0 filas, nada la consulta directo), pero hay que resolverlo
   antes de construir una pantalla que lea esa vista con la sesión del usuario en vez
   de con una función `security definer`.
4. **RLS/policies/grants de `insumo_lotes`/`movimientos_insumo`/`insumos` en
   producción** quedaron verificados hoy contra la base real (ver "Decisión" arriba) —
   ya no es una inferencia, así que este punto de la versión anterior del documento
   queda cerrado.
5. **`fn_aplicar_movimiento` (el original del núcleo, sin tocar por esta tarea ni por
   la anterior) sigue con el mismo agujero de permisos** que ya se cerró para
   `fn_aplicar_movimiento_insumo` (hoy dropeada) y que nunca existió en
   `recibir_insumo`/`ajustar_insumo_por_conteo`/`registrar_consumo_insumo` (ninguna de
   las tres necesitó un motor mecánico intermedio: escriben `movimientos_insumo`
   directo, no hay una función `fn_aplicar_movimiento_insumo` en este esquema).
   Cerrarlo en el núcleo exige auditar todos sus call sites — sigue fuera de alcance.
6. **La sección de Prioridad 1 del roadmap (compras/gastos) también describe
   `p_sede_id` contra un esquema que ya no existe** — mismo hallazgo que ya señalaba la
   versión anterior de este documento, sin auditar todavía.
7. **La pantalla de alerta "avisa cuando falta"** (`insumos.stock_minimo` contra el
   `fisico` de `v_insumo_saldos`) — la columna existe, la lectura no se construyó.
