# ADR-0097 — Etiquetado legal del producto: país de origen, fabricante y material

**Fecha:** 2026-09-17
**Estado:** Aplicado y verificado en local (`20260917220000_producto_etiquetado_legal.sql`
— renumerada de `20260917210000`, ver "Se rompe si"). No aplicado en producción —
pendiente de que Felipe lo decida (ver "Lo que falta").
**Afecta:** tabla `retail.productos` (3 columnas nuevas); funciones
`retail.catalogo_crear_producto`, `retail.catalogo_actualizar_producto` y
`retail.crear_producto_con_variantes` (las 3 ganan 3 parámetros nuevos, todos
opcionales, sobre la firma ya fusionada con tejido/patrón/talla_id — ver "Reconciliación
con la taxonomía de variante" más abajo); `apps/web/components/ProductoForm.tsx`,
`apps/web/components/NuevoProductoForm.tsx`, `apps/web/lib/catalogo-v2.ts`,
`packages/database/src/types.ts`. **No toca** `variantes`, `producto_fotos`, ni ninguna
RPC de venta/inventario.

## El problema

La Ley 28405 (Ley de Rotulado de Productos Industriales Manufacturados) y el Reglamento
Técnico Andino de Etiquetado de Confecciones exigen declarar país de origen,
fabricante/importador y composición del material en toda prenda. Ninguno de los tres
existía en `retail.productos` — no había dónde guardarlos para imprimirlos en una
etiqueta ni para responder una fiscalización.

## Decisión

**DECIDÍ: los 3 campos en `productos`, texto libre, NULLABLE, sin backfill.** El
catálogo actual no tiene este dato levantado producto por producto — exigirlo
retroactivamente habría dejado productos existentes bloqueados por un dato que nadie
cargó nunca. Se completan hacia adelante, en el alta o edición, cuando quien carga el
producto lo sepa.

**DESCARTÉ una tabla aparte `producto_etiquetado`.** Ganas: aísla un concepto legal del
núcleo de catálogo. Pagas: un join más en cada lectura de ficha/formulario para 3
columnas de texto que se leen y escriben siempre junto con el resto del producto — no
hay ningún caso de uso que lea etiquetado legal sin leer el producto. Antes de agregar,
se probó que no puede vivir más simple: acá sí puede (principio 7, Carmack).

**DECIDÍ: texto libre, no un vocabulario cerrado ni una FK.** `material` en particular
podría tentar a un enum, pero la variedad real de composiciones textiles ("60% algodón /
40% poliéster", mezclas arbitrarias) no calza en uno. `fabricante_declarado` tampoco
referencia otra tabla porque no siempre es CAYLA (prendas de terceros, maquila) — no se
asume razón social fija.

**HALLAZGO no obvio, encontrado verificando contra el código en vez de asumir: la RPC
que el formulario de alta declaraba en su propio comentario
(`catalogo_crear_producto`, "Un solo componente para /productos/nuevo y
/productos/[id]/editar") lleva desde el 2026-09-15 sin ninguna ruta real que la
llame para crear.** `/productos/nuevo/page.tsx` usa `NuevoProductoForm.tsx` +
`crear_producto_con_variantes` (20260915221633) — una RPC distinta, con su propia matriz
talla×color. `ProductoForm.tsx` (la que documentaba el comentario) solo se monta desde
`/productos/[id]/editar`, siempre con `producto` presente, así que su rama
`editando === false` (la que llama `catalogo_crear_producto`) es código muerto en la UI
de hoy — confirmado por `grep` de cada caller real, no por el comentario del archivo. Se
actualizaron las 3 funciones de todas formas (`catalogo_crear_producto` por prolijidad
de la pareja alta/edición con `catalogo_actualizar_producto`, que SÍ es la RPC real de
edición), pero el alta real pasa por `crear_producto_con_variantes` — verificado en
navegador creando un producto de punta a punta (ver "Cómo se verificó"). No se corrigió
el comentario desactualizado de `ProductoForm.tsx`: reescribir esa documentación es un
cambio aparte, fuera del alcance de esta tarea.

**DECIDÍ: DROP FUNCTION antes de CREATE OR REPLACE en las 3 funciones.** Postgres
identifica una función por su firma completa (tipos y orden de parámetros) — agregar 3
parámetros nuevos al final, aunque tengan `default null`, cambia la firma. Un `CREATE OR
REPLACE` sin `DROP` previo no reemplaza la función vieja: crea una segunda función
sobrecargada, y PostgREST (que resuelve `supabase.rpc(...)` por nombre) queda con dos
candidatos ambiguos. Verificado con `pg_get_function_identity_arguments` después de
aplicar: exactamente una firma por función, no dos.

## Se rompe si

SUNAT/INDECOPI empiezan a exigir composición POR VARIANTE (ej. una colección con telas
distintas por color) — hoy es un solo texto libre a nivel de producto, asumiendo que
todas las variantes de un mismo producto comparten material. Si eso deja de ser cierto,
esto se mueve a `variantes` en una migración aparte, no se fuerza acá.

## Reconciliación con la taxonomía de variante (ADR-0095/0096, ya en `main`)

Mientras se verificaba esta tarea, PR #75 (taxonomía cerrada de talla/tejido/patrón,
`talla` → `talla_id`, `crear_producto_con_variantes`/`catalogo_crear_producto`/
`catalogo_actualizar_producto` con `p_tejido_id`/`p_patron_id`) se fusionó a `main` —
exactamente la colisión de firma que se anticipó al escribir la primera versión de esta
migración. Resuelto: se fusionó `origin/main` a esta rama y las 3 funciones se
reescribieron partiendo del CUERPO YA FUSIONADO (`20260917210001` para
`catalogo_crear/actualizar_producto`, `20260917100600` para
`crear_producto_con_variantes`), no de la copia local desactualizada — agregarle los 3
parámetros de etiquetado legal a una versión vieja habría revivido `talla` (columna que
ya no existe en esta rama) y perdido los candados de tejido/patrón/talla por categoría.
La migración también se renumeró de `20260917210000` a `20260917220000`: ese timestamp
ya lo tenía `20260917210000_catalogo_actualizar_producto_recupera_color_codigo_fotos.sql`
en `main`.

**HALLAZGO no relacionado con esta tarea, encontrado al verificar contra Postgres real en
vez de confiar en el `CREATE OR REPLACE`: `catalogo_crear_producto` y
`catalogo_actualizar_producto` ya tenían DOS sobrecargas ambiguas en `main` antes de esta
migración.** `20260917190000_producto_fotos_por_color.sql` (fix de fotos, sin relación
con taxonomía) hizo `CREATE OR REPLACE` de las dos funciones con la firma VIEJA de 8/10
parámetros (sin `tejido_id`/`patron_id`) — pero para ese momento en el historial de
migraciones, `20260917100600_catalogo_rpc_ejes_nuevos.sql` (taxonomía, timestamp
cronológicamente anterior) ya las había recreado con 10/12 parámetros. Como las firmas no
calzan, Postgres no reemplazó nada: creó una TERCERA función. Confirmado en vivo con
`pg_get_function_identity_arguments` después de un `db reset` limpio (dos filas por
función, no una) — y confirmado que `20260917210000`/`20260917210001` (los dos intentos
de arreglar el bug de `color_codigo`) tampoco lo notaron, porque ninguno miró
`pg_proc` directo. Esta migración dropea también esa firma huérfana (ver el SQL, sección
"HALLAZGO" inline) porque ya está tocando las dos funciones de todas formas — dejarla
habría sumado una CUARTA sobrecarga en vez de resolver el problema.

## Cómo se verificó

- `npx supabase db reset` local: limpio, la migración aplica sin error contra el
  historial completo de migraciones (confirmado tres veces, en ventanas sin contención
  del Postgres compartido — ver nota al margen).
- `pg_get_function_identity_arguments`: cada una de las 3 funciones queda con
  exactamente una firma (sin sobrecarga ambigua) después del DROP+CREATE.
- `pnpm --filter web typecheck` y `pnpm --filter web lint`: limpios. `types.ts` se
  actualizó A MANO (mismo criterio que ADR-0093), no con `gen-types`: el Postgres
  compartido, en el momento de correrlo, traía de regalo esquema de otras ~2 sesiones
  concurrentes sin relación (`categorias.ciclo_vida_*`) y le faltaba esquema propio de
  este repo (`comprobantes.motivo_no_emitido`) — correr `gen-types` ahí habría
  introducido una regresión real en vez de solo mis 3 columnas.
- **Navegador, de punta a punta (contra el esquema PRE-reconciliación, antes de fusionar
  la taxonomía):** login local (`felipe@cayla.local`) → `/productos/nuevo` → los 3 campos
  ("Etiquetado legal (opcional)") se completan → "Crear producto" → confirmado en
  Postgres que `pais_origen`/`fabricante_declarado`/`material` quedaron guardados
  exactamente como se escribieron → `/productos/[id]/editar` del mismo producto muestra
  los 3 valores precargados → el mismo formulario, abierto sobre un producto SIN estos
  datos (creado antes de esta migración), muestra los 3 campos vacíos con placeholder,
  sin ningún `"null"` ni espacio en blanco raro (confirmado con `read_page`: son
  `placeholder`, no `value`).
- **`crear_producto_con_variantes` reconciliada (post-taxonomía), smoke test por SQL
  directo:** transacción `psql` con `request.jwt.claim.sub` simulado (mismo patrón que
  ADR-0093), llamando la función con `p_tejido_id`/`p_patron_id` en null y los 3 legales
  con valor — el producto se crea, los 3 campos quedan guardados tal cual, `ROLLBACK` al
  final (nada quedó escrito). No se repitió la corrida completa en navegador contra el
  esquema reconciliado por la ventana de tiempo/contención del Postgres compartido (ver
  nota al margen) — mismo trade-off explícito que ya tomó ADR-0093 el mismo día.

## Nota al margen: Postgres local compartido entre 9 sesiones concurrentes

El `supabase_db_cayla-retail` local es UN SOLO contenedor Docker, compartido por todos
los worktrees de este repo (mismo `project_id`/puertos fijos en `supabase/config.toml`).
Con ~9 sesiones de Claude activas a la vez hoy, cada `supabase db reset` de una sesión
reinicia el contenedor que las demás están usando — varios de los intentos de esta tarea
fallaron a medias ("unexpected EOF", "error running container", PostgREST reportando
"Could not find the function ... in the schema cache") no por ningún error en esta
migración, sino porque otra sesión reseteaba el mismo Postgres en el medio. Coordinado
por chat entre sesiones (ver mensajes cruzados de esta tarea) para conseguir una ventana
estable; la verificación final de arriba se hizo aplicando la migración directo por
`psql` (idempotente: `add column if not exists`, `drop function if exists`) en vez de
`db reset`, para no competir por el contenedor. Ya señalado antes en
[ADR-0093](0093-liberar-comprobante-pendiente-sin-transmitir.md) ("el Postgres local
estaba 10 migraciones atrás") — no es un hallazgo nuevo, es el mismo síntoma recurrente.
Recomendación (no aplicada acá, fuera de alcance): `project_id`/puertos únicos por
worktree en `supabase/config.toml`, o un lock documentado en
`docs/SESIONES-ACTIVAS.md` antes de correr `db reset`.

## Lo que falta

1. **Aplicar en producción** — pendiente de que Felipe decida, con el prefijo `retail.`
   en el SQL Editor (ver `CLAUDE.md`, "Cómo aplicar SQL a producción"). Ojo: producción
   todavía no tiene la taxonomía de tejido/patrón/talla_id aplicada (ver BACKLOG, sección
   de taxonomía) — esta migración asume que esa parte ya corrió antes que la propia,
   porque `DROP FUNCTION` apunta a la firma CON `tejido_id`/`patron_id`. Si se pega en
   producción antes que la taxonomía, el `DROP` de esa firma es un no-op inofensivo (no
   existe todavía) pero el `CREATE` de esta migración SÍ le agregaría `p_tejido_id`/
   `p_patron_id` a producción antes de tiempo — revisar el orden con Felipe.
2. **Verificar si producción tiene la misma sobrecarga huérfana** que se encontró y
   limpió en local (ver "Reconciliación con la taxonomía de variante") — depende de si
   `20260917190000_producto_fotos_por_color.sql` y `20260917100600` (o sus equivalentes)
   ya se pegaron ahí en ese orden. `pg_get_function_identity_arguments` lo confirma en
   30 segundos antes de pegar nada nuevo.
3. El comentario desactualizado en `ProductoForm.tsx` (dice que sirve para
   `/productos/nuevo`, ya no es cierto) — no se tocó, fuera del alcance de esta tarea.
4. Repetir la verificación de navegador de punta a punta contra el esquema YA
   reconciliado (con tejido/patrón/talla_id) — la de esta sesión se hizo contra el
   esquema pre-reconciliación; el smoke test SQL post-reconciliación confirma que la RPC
   funciona, pero no reemplaza probar el formulario real en el navegador.
