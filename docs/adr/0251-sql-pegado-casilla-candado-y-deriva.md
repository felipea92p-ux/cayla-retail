# ADR-0251 · SQL pegado en producción: la casilla, el candado de `drop trigger` y la deriva

- **Fecha:** 2026-09-28 · **Estado:** construido; la revisión diaria espera que Felipe pegue `20260928210000` y guarde la
  llave en GitHub.
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
  CUÁNTAS diferencias hay de cada tipo (`deriva.mjs --resumen`), nunca cuáles: «este revoke de main todavía no está en
  producción» diría qué puerta sigue abierta. Los nombres se miran en privado (el conector de Supabase o el SQL Editor, y
  `pnpm migraciones:deriva`).
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
  falta configurar. Nunca queda verde sin haber comparado.
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
