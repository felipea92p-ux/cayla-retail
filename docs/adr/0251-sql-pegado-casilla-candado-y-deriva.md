# ADR-0251 · SQL pegado en producción: la casilla, el candado de `drop trigger` y la deriva

- **Fecha:** 2026-09-28 (act. 2026-10-12: la casilla se comprueba; act. 2026-10-14: un PR cerrado con su SQL en producción
  avisa) · **Estado:** construido; la revisión diaria corre desde el 2026-10-03 (llave guardada en GitHub), desde el
  2026-10-12 el check «SQL pegado» comprueba la casilla en producción y, desde el 2026-10-14, «SQL huérfano» avisa al cerrar.
- **Pedido:** Felipe, 2026-09-27 (eligió «casilla + revisión diaria»): que no se vuelva a publicar un cambio sin su SQL.
- **Migración:** `20260928210000_huellas_catalogo_con_llave.sql` (la llave de la revisión diaria). Lo demás vive en
  `.github/` y `scripts/migraciones/`.
- **Complementa:** ADR-0195 («Políticas y deadlocks»: nunca `drop trigger`), `scripts/migraciones/verificar.mjs` (qué
  promete cada archivo) y la memoria de la auditoría del 2026-09-27.

## Problema

El SQL de producción lo pega Felipe a mano, y Vercel publica `main` apenas se fusiona un PR. Falla en las dos
direcciones, y nada lo avisaba:

- **SQL de `main` sin pegar.** El 2026-09-27 una auditoría encontró 6 cambios publicados sin su SQL: el botón «Pedir» de
  Traslados roto (#525), el nº de operación de Yape que se perdía en silencio (#488), el candado de datos de prueba, el
  costo (#520)… Antes, #409 dejó Roles y accesos sin poder guardar.
- **Arreglos que viven solo en producción.** Revokes y cuerpos de función que alguien corrigió directo en la base, y que
  una migración futura puede deshacer al recrear la función desde el repo (le pasó a Análisis con el PR 397).
- **`drop trigger` en una migración nueva.** Toma en exclusiva las tablas de `auth` y `storage` hasta el final de la
  pegada y choca con el Asesor de seguridad (40P01). La regla estaba escrita, pero igual llegó una a `main` (`20260927190000`,
  corregida en #538).
- **Fusionar con la revisión corriendo.** #542 y #544 se fusionaron antes de terminar su revisión; los arreglos tuvieron
  que ir en migraciones nuevas.

## Decidí

1. **Casilla en el formulario de PR** (`.github/pull_request_template.md`): «SQL pegado en producción» (se pega ANTES de
   fusionar) o «El SQL se pega después de fusionar» (con el porqué y la fila «POR PEGAR» en BACKLOG). Y la nota de que un
   PR con una revisión corriendo va en BORRADOR: GitHub no deja fusionar un borrador.
2. **Check «SQL pegado»** (`.github/workflows/sql-pegado.yml` + `scripts/migraciones/sql-pegado.mjs`): rojo si el PR agrega
   una migración y no marcó ninguna casilla, o si edita o borra una migración que ya está en la rama base (renombrar sin
   cambiar el contenido, para resolver un choque de versiones, sí se permite). Corre también al editar el cuerpo del PR:
   marcar la casilla lo pone verde sin volver a correr las pruebas.
3. **Candado de `drop trigger`** (`scripts/migraciones/sin-drop-trigger.mjs`, paso «Migraciones sin drop trigger» del CI):
   rojo si una migración fuera del legado lo usa, aunque sea dentro de un `execute '…'`. Las 22 que ya lo tenían quedan en
   un legado con su cantidad, así que sumarle uno a un archivo viejo también sale rojo.
4. **Deriva: ¿producción corre la MISMA versión que `main`?** (`scripts/migraciones/deriva.sql` + `deriva.mjs`). Una
   consulta de solo lectura saca huellas del catálogo de `retail` (cuerpo de cada función sin comentarios ni espacios,
   permisos, políticas, disparadores, columnas, candados, índices y vistas); se corre en las dos bases y el comparador dice,
   en palabras del negocio, qué falta pegar, qué vive solo en producción y qué tiene otra versión. El CI ya calcula las
   huellas de `main` en cada push y las guarda como artefacto `huellas-main`. Es la mitad que `verificar.mjs` no puede
   decir: él sabe si existe «algo con ese nombre», no cuál versión está viva.

**DESCARTÉ:**
- **Solo la casilla, sin check.** Una casilla que nadie mira no frena a nadie: el formulario ya tenía la de 375 px y el
  incidente del 27-sep pasó igual.
- **Leer el historial `supabase_migrations.schema_migrations` de producción.** Las pegadas en el SQL Editor no dejan fila
  con el nombre del archivo (verificado el 2026-09-22): diría que falta lo que ya está.
- **Comparar por nombre** (lo que hace `verificar.mjs`). No ve un `create or replace` sin pegar ni un arreglo en vivo, que
  son justo los dos casos que dolieron.

**SE ROMPE SI:**
- **Alguien marca la casilla sin pegar.** El check queda verde; lo atrapa la deriva (punto 4) al día siguiente.
- **`main` no está protegida** (hoy no lo está): un check rojo avisa pero no impide fusionar. Protegerla es otra decisión.
- **Producción cambia su forma de guardar un cuerpo** (otra versión de Postgres que reescriba el texto): la deriva diría
  «distinto» de todo. Se ve enseguida (cientos de líneas) y se corrige la normalización en `deriva.sql`.

## La primera corrida (2026-09-28)

`main` en `d6bb5a37` sin las tres migraciones del paso 3 de Frescura (todavía sin pegar) contra producción, solo lectura:
**14 diferencias reales y 53 conocidas** (la tabla vieja de gastos y su función, que Finanzas renombra solo en una base con
datos; los candados de `gastos` con sufijo `1`; la vista `planilla_por_sede`, que solo nace con las tablas de Dynamic).
- **En main y no en producción (1):** la política `clientas_fusiones.clientas_fusiones_select`. Se pegó sin ella a
  propósito (exponía DNI y WhatsApp de fichas unidas); se saca del repo en el PR de Clientas.
- **Solo en producción (1):** `fn_rentabilidad` (PR #168, abierto).
- **Con otra versión (12):** `compras_nota_pendiente`, `notas_credito_tablero`, `emitir_comprobante`, `emitir_nota`,
  `fn_aplicar_movimiento`, `recalcular_stock`, `fn_resumen_comparacion_json`, `fn_resumen_variantes_json`,
  `fn_stock_por_sede_json`, y los permisos de `movimientos` (service_role) y `stock` (authenticated y service_role). Van a
  `main` en el PR de «arreglos que solo viven en producción».

Cómo se repite: ver el encabezado de `scripts/migraciones/deriva.mjs`.

## La revisión diaria (decidida por Felipe el 2026-09-28)

**DECIDÍ (Felipe, entre tres opciones): huellas con llave propia.** Cada mañana a las 7:00 (Lima),
`.github/workflows/deriva-diaria.yml` le pide a producción las huellas con `retail.huellas_catalogo(p_llave)`, arma `main`
como el CI y las compara. Si hay diferencias, abre o comenta el aviso «Producción ≠ main (deriva diaria)» y el job sale en
rojo (GitHub avisa por correo); si no, cierra el aviso.
- **La función** es la consulta de `deriva.sql` al pie de la letra (lo vigila `deriva.test.mjs`) y devuelve lo mismo
  (`pruebas:huellas-catalogo`, en el CI). Solo huellas: ningún dato de ninguna tabla.
- **La llave** la crea `select retail.fn_huellas_nueva_llave();` en el SQL Editor, que la devuelve UNA vez. La base guarda
  solo su sha256. Va a GitHub como el secreto `DERIVA_LLAVE`. Con la llave pública (anon), que ya está en la web, es la
  única función de `retail` que anon puede ejecutar, y sin la llave no devuelve nada.
- **Lo público no nombra nada.** El registro de un job y los avisos de un repo público los ve cualquiera. El aviso dice
  solo SI hay diferencias (`deriva.mjs --resumen`), nunca cuáles ni cuántas: «este revoke de main todavía no está en
  producción» diría qué puerta sigue abierta. Las cuentas también lo decían: el 2026-09-28, cinco funciones de las
  migraciones públicas de #545, fusionado ese día (`fn_frescura_sede`, `fn_es_llegada`…), no estaban en producción
  (revisión del PR, consulta de solo lectura), y una cuenta «sin pegar» publicada esa mañana las señalaba con el dedo.
  El sí/no ya es público: la corrida sale roja o verde.
  Los nombres y las cuentas se miran en privado (el conector de Supabase o el SQL Editor, y `pnpm migraciones:deriva`).
- **Un search_path fijo.** Postgres escribe los nombres de tipos, valores por defecto y candados según el `search_path` de
  quien pregunta, y el SQL Editor, el conector y psql tienen uno distinto cada uno. `deriva.sql` y la función fijan el
  mismo (`pg_catalog, extensions`). Sin eso, la función y `deriva.sql` daban huellas distintas sobre la MISMA base (lo
  atrapó la primera corrida de la prueba).

**DESCARTÉ:**
- **Una cuenta de Postgres de solo lectura con contraseña en GitHub.** Aunque solo lea el catálogo, lee el código SQL de
  Dynamic (que puede no ser público) y hereda lo que PUBLIC puede en su schema.
- **Una tarea programada en la Mac de Felipe.** Nada nuevo en producción ni en GitHub, pero solo corre con la Mac prendida
  y el aviso lo ve solo él.

**SE ROMPE SI:**
- **La llave se filtra:** se leen huellas, nada más. Se cambia con `select retail.fn_huellas_nueva_llave();` y el secreto.
- **Producción no responde, o falta la configuración:** el job sale en rojo diciendo «No se pudo leer producción» o qué
  falta configurar, y el aviso «Producción ≠ main» dice «Hoy NO se pudo comparar (falló …)» (lo mismo si main no arma o
  el comparador no puede leer). Nunca queda verde sin haber comparado, ni sin aviso: en la revisión del PR, un paso rojo
  saltaba al que avisaba y «ningún aviso» se leía como «sin deriva». `deriva-diaria.test.mjs` simula el workflow.
- **Alguien cambia `deriva.sql` sin cambiar la función** (o al revés): `deriva.test.mjs` y `pruebas:huellas-catalogo` se
  ponen rojos en el PR. Para cambiar la consulta hace falta una migración nueva que recree la función.

**Lo que Felipe hace una vez:** pegar `20260928210000` sola en el SQL Editor; correr `select retail.fn_huellas_nueva_llave();`;
guardar lo que devuelve como el secreto `DERIVA_LLAVE` y, como variables, `SUPABASE_URL` y `SUPABASE_ANON_KEY` (las de la
web), en Settings ▸ Secrets and variables ▸ Actions. Después, «Run workflow» en la pestaña Actions para la primera corrida.

## `main` protegida (Felipe, 2026-09-28)

Desde el 2026-09-28, `main` exige PR y los checks «Tipos, lint y pruebas» y «Pruebas de RPC contra Postgres», no acepta
pushes forzados ni se puede borrar. Sin aprobaciones obligatorias (Felipe fusiona sus propios PR) y el dueño puede saltarse
la regla en una urgencia. **«SQL pegado» se suma a los checks exigidos cuando este PR esté en `main`:** exigir un check que
todavía no corre bloquearía todos los PR. Motivo: #542, #544 y #545 se fusionaron con su revisión corriendo; con la
protección y el PR en borrador, eso ya no pasa.

## Actualización 2026-10-12 — la casilla se comprueba antes de fusionar

**Pedido:** Felipe, 2026-10-12 («agrega ese chequeo de migraciones antes del deploy»), después de que el despliegue de #970
fallara en Vercel y hubiera que confirmar a mano que las 6 migraciones de #973 ya estaban en producción.

**El hueco.** El check «SQL pegado» le creía a la casilla. Lo que la desmentía era la revisión diaria, y esa llevaba desde
el 2026-10-03 en rojo todos los días: producción va casi siempre POR DELANTE de `main` (Felipe pega el SQL antes de
fusionar, y hay PR abiertos con su SQL ya pegado), así que «producción ≠ main» era el estado normal y el aviso ya no decía
nada. Medido hoy, solo lectura: 189 diferencias, ninguna de «main tiene algo que producción no» (183 adelantadas, 6 con
otra versión). Un PR marcado «pegado» sin estarlo se publicaba igual.

**DECIDÍ: el check «SQL pegado», cuando el PR marca «SQL pegado en producción», compara con producción lo que deja CADA
migración del PR.** Tres piezas:
1. **El CI aparta las migraciones del PR** antes de `supabase start`, levanta la base de main y las aplica una por una
   —cada una en su sesión y su transacción, como el SQL Editor— (las cuatro tandas del ADR-0381; solo la tanda 1 toma
   huellas con `deriva.sql`, antes y después de cada una: `scripts/migraciones/huellas-del-pr.mjs`). Sube el artefacto `huellas-del-pr`: por archivo, cada objeto que cambió
   y la huella FINAL que tiene que tener en producción (o que no tiene que existir). Sale apenas la base está arriba (~3
   min), sin esperar las pruebas. Después devuelve los archivos a su carpeta: 42 scripts de `scripts/pruebas/` leen el
   archivo de su migración.
2. **El check espera esas huellas, le pide las suyas a producción** con la misma llave de la revisión diaria
   (`retail.huellas_catalogo`, `DERIVA_LLAVE`) y las compara (`sql-en-produccion.sh` → `sql-en-produccion.mjs`). Por
   archivo: ✓ pegada, ✗ falta (o está con otra versión), ? sin huella (solo datos: vale la casilla).
3. **Solo se mira lo que el PR cambia**, no todo `main`: lo adelantado en producción por otros PR no tiñe a este de rojo.

Como «SQL pegado» ya es obligatorio en `main`, un PR con SQL no se fusiona —y Vercel no publica su web— hasta que producción
lo tiene. Marcar «El SQL se pega después de fusionar» sigue sin mirar producción (lo cubre la revisión diaria).

Verificado con datos reales (2026-10-12): las huellas de `main` antes y después de #973 contra las de producción dan los 98
objetos que cambiaron idénticos (✓, que es lo correcto: su SQL estaba pegado); y un cambio simulado de `regularizar_prenda`
que producción no tiene sale ✗.

**Lo público.** El repo sigue público (verificado hoy) y el registro del check lo ve cualquiera: dice solo el NOMBRE de cada
archivo del PR (que ya está en el PR) y si está o no, nunca qué objeto falta ni cuántos (el mismo criterio de la revisión
diaria). El detalle, en privado: `sql-en-produccion.mjs <huellas> <produccion> --detalle`, o pedírselo a Claude.

**DESCARTÉ:**
- **Frenar en Vercel, al construir.** Vercel tendría que leer los artefactos de GitHub con un token propio, y un SQL
  pendiente frenaría TODA publicación de `main`, también un arreglo urgente de otra pantalla que no tiene nada que ver.
  Frenar antes de fusionar deja `main` siempre publicable.
- **Comparar todo `main` con producción** (la revisión diaria, pero antes de fusionar). Con producción adelantada por otros
  PR, saldría rojo siempre, que es justo lo que le pasó a la revisión diaria.
- **Leer los nombres del SQL** (qué función crea cada archivo) en vez de aplicarlo. No entiende un `create or replace` que
  no cambia nada, ni un reemplazo anclado, ni un `revoke`; aplicarlo y mirar el catálogo sí.
- **Comprobar dentro del job de Postgres.** Un rojo ahí obliga a repetir ~8 min de pruebas solo porque el SQL se pegó
  después de abrir el PR; el check liviano se vuelve a correr en segundos al marcar la casilla.

Lo vigilan `huellas-del-pr.test.mjs` y `sql-en-produccion.test.mjs` (en «Tipos, lint y pruebas», con `gh` y `curl` falsos
para cada «no pude mirar») y `pnpm pruebas:huellas-del-pr`, que recorre el camino del CI de punta a punta en una base aparte
del mismo Postgres (en una de las tandas).

**SE ROMPE SI:**
- **Producción tiene otra versión de algo que el PR toca** (un arreglo que vive solo allá, u otro PR pegado encima): el
  check sale ✗ aunque el SQL se haya pegado. Es real —la web del PR se publicaría contra otra versión—: se trae el
  arreglo de producción a la migración (memoria «reescribir función parchada por ancla») o se decide cuál vale.
- **Una migración solo de datos** (un `insert` en `modulos`) no tiene huella: sale «?» y vale la casilla. Si nadie la pegó,
  no lo ve este check (sí, sin nombre, la revisión diaria si deja algo en el catálogo).
- **Se marca la casilla antes de que el CI levante su base:** el check espera hasta 20 min; si el CI no deja huellas
  (una migración que no se aplica), sale rojo diciéndolo. Nunca verde sin haber mirado.
- **La versión de una migración del PR es anterior a la última de main:** en el CI corre DESPUÉS de las de main (es el
  orden real de producción, no el de los nombres). Si las dos tocan lo mismo, el CI lo muestra como lo verá producción.
- **Dos PR pegan sobre la misma función:** el primero pasó su check; si el segundo pisa su versión en producción antes de
  que el primero se fusione, el primero se fusiona contra la versión del segundo. Este check no vuelve a correr solo; lo
  ve la revisión diaria.
- **Supabase o la API de artefactos de GitHub no responden:** los PR con SQL quedan en rojo («no se pudo leer producción»)
  hasta que vuelvan; los PR sin SQL no se enteran. El dueño puede saltarse la regla en una urgencia.

## Actualización 2026-10-14 — un PR cerrado sin fusionar, con su SQL en producción, avisa

**Pedido:** Felipe, 2026-10-14, después de #978 → #1062.

**El hueco.** El SQL se pega ANTES de fusionar. Si después el PR se cierra sin fusionar, su SQL sigue vivo en producción y
no está en ningún archivo de `main`: la próxima migración que rehaga esa función desde el repo lo borra sin que nadie se
entere. #978 (ADR-0382) se cerró el 2026-10-12, sin comentario, con su migración ya pegada en `aprobar_devolucion`. Nada
avisó hasta que el check «SQL pegado» de #1054, que cambia la misma función, salió rojo el 2026-10-14 sin una causa a la
vista (lo resolvió #1062, que devolvió ese trabajo al repo apilado sobre #1054). Los dos avisos que había no podían verlo:
«SQL pegado» mira un PR antes de fusionar, nunca uno que se cierra; y la revisión diaria dice «producción ≠ main» sin
nombres, como casi todos los días desde el 03-oct.

**DECIDÍ: un aviso propio, en el momento del cierre** (`.github/workflows/sql-huerfano.yml` + `scripts/migraciones/sql-huerfano.mjs`).
Cuando un PR de este repo se cierra sin fusionar, marcó «SQL pegado en producción» y agrega migraciones que `main` no
tiene, se abre el aviso «SQL en producción que main no tiene: PR #N» —con los nombres de archivo y las dos salidas:
reabrirlo o llevar sus migraciones a otro PR, o devolver producción a lo que dice `main`— y se comenta en el PR. GitHub lo
manda por correo a quien sigue el repo. El aviso se cierra solo cuando esos archivos llegan a `main`. Corre también al
llegar migraciones a `main` (para cerrar los que ya no corresponden) y una vez al día (por si GitHub no entregó un cierre, o
el PR iba contra una rama que todavía no tenía este workflow, como uno apilado). Un aviso por PR: si se cierra a mano, no
se vuelve a abrir.
- **`pull_request_target`, no `pull_request`.** GitHub no corre `pull_request` en un PR con conflictos, y un PR que se
  cierra sin fusionar suele tenerlos. Como `pull_request_target` corre con permiso de escribir, el job baja SIEMPRE `main`
  (nunca el código del PR), salta los forks (no pudieron pegar nada en producción) y lee el cuerpo con `gh`, sin
  interpolarlo en el shell. Lo vigila la prueba.
- **La misma regla que «SQL pegado».** La casilla y las migraciones nuevas se leen con `revisarSqlPegado`: las dos piezas
  no pueden discrepar sobre qué es «marcó pegado» ni qué es «migración nueva».
- **Verde cuando avisó.** El aviso y el comentario ya notifican; la corrida sale roja solo si no pudo mirar (GitHub no
  respondió, no están las migraciones de main). Un rojo que quiere decir «hay aviso» se vuelve paisaje, como le pasó a la
  revisión diaria.
- **Lo público.** El aviso nombra el PR y sus archivos de migración, que ya están en el PR (y el PR ya dice que se
  pegaron); nunca qué objeto de la base cambia, y el script no lee el contenido de ningún archivo. Y solo dice que
  producción tiene algo DE MÁS, nunca que le falta algo de `main` (eso diría qué puerta sigue abierta).

**Medido hoy (solo lectura).** De 1045 PR cerrados, 29 sin fusionar; 2 con «SQL pegado» marcada: #978 (su migración todavía
no está en `main`: viaja en #1062 → #1054) y #788 (sus dos migraciones ya llegaron a `main` por otro PR). El simulacro contra
GitHub (`--simular`) abre solo el de #978. Otros cinco cerrados sin fusionar tienen migraciones que tampoco están en `main`
con ese nombre (#56, #58, #123, #131, #170, del 16 al 18-sep): son de antes de la casilla (28-sep), así que este aviso no
los ve. Si alguno se pegó, lo dice la revisión diaria, sin nombre.

**DESCARTÉ:**
- **Que la revisión diaria cruce sus diferencias con los PR cerrados y nombre el de origen.** Para atribuir una diferencia
  a un PR hace falta la huella que ese PR deja en cada objeto, y el artefacto `huellas-del-pr` dura 7 días: un PR cerrado
  hace más de una semana ya no se puede atribuir. Peor: en el caso que lo motivó no habría nombrado a #978. En cuanto otro
  PR pega encima de la misma función (lo que hizo #1054 con `aprobar_devolucion`), producción ya no calza ni con la huella
  de #978 ni con la de `main`. Y avisaría hasta un día tarde, en un aviso que está rojo casi todos los días.
- **Solo comentar en el PR.** Lo lee quien lo cerró, una vez; no queda en ninguna lista de pendientes ni se cierra cuando
  se resuelve.
- **Comprobar en producción antes de avisar** (con las huellas del PR, como «SQL pegado»). Diría «no está» en el mismo caso
  de la pila (producción con otra versión encima) y callaría justo el aviso que importa; y pasados 7 días no hay huellas.
  Avisar de más cuesta un clic («la casilla se marcó por error»); callar cuesta otro #978.

**SE ROMPE SI:**
- **Se pega el SQL sin marcar la casilla** (o marcando «se pega después») y el PR se cierra: no hay aviso. La revisión
  diaria lo sigue viendo, sin nombre.
- **Las migraciones vuelven a `main` con otro nombre** (renumeradas por un choque de versión): el aviso no se cierra solo
  y hay que cerrarlo a mano. Comparar por contenido no sirve: la migración que llega a `main` suele venir corregida.
- **Alguien cierra el aviso a mano sin resolverlo:** no se vuelve a abrir. Es la misma puerta que «la casilla se marcó por
  error», y se eligió así para que un aviso descartado no vuelva cada mañana.
- **Un PR apilado se cierra y su rama base no tiene este workflow:** no hay aviso en el momento; lo abre el barrido de la
  mañana siguiente.
- **GitHub no responde:** la corrida queda roja y la del día siguiente lo repite (cada corrida decide de nuevo con lo que
  hay; no se pierde nada).

Lo vigila `scripts/migraciones/sql-huerfano.test.mjs`, en «Tipos, lint y pruebas»: el caso de #978, lo que no avisa, un
aviso por PR, el cierre solo, lo público sin objetos de la base, el script con un `gh` caído, y que el workflow baje `main`
y no interpole el cuerpo del PR.
