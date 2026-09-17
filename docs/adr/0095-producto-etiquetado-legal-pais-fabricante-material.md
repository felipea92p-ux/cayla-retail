# ADR-0095 — Etiquetado legal del producto: país de origen, fabricante y material

**Fecha:** 2026-09-17
**Estado:** Aplicado y verificado en local (`20260917210000_producto_etiquetado_legal.sql`).
No aplicado en producción — pendiente de que Felipe lo decida (ver "Lo que falta").
**Afecta:** tabla `retail.productos` (3 columnas nuevas); funciones
`retail.catalogo_crear_producto`, `retail.catalogo_actualizar_producto` y
`retail.crear_producto_con_variantes` (las 3 ganan 3 parámetros nuevos, todos
opcionales); `apps/web/components/ProductoForm.tsx`,
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

**Colisión de firma esperable al fusionar con `main`:** mientras se verificaba esta
tarea, el Postgres local compartido mostró brevemente
`crear_producto_con_variantes(p_referencia, p_categoria_id, p_variantes, p_descripcion,
p_token, p_tejido_id, p_patron_id)` — otra sesión (diseño de taxonomía de
tejidos/patrones, branch con ADR-0072/0073 propios, ver `docs/SESIONES-ACTIVAS.md`) está
agregando SUS propios parámetros nuevos a la misma función, con su propio DROP+CREATE.
Quien fusione ambas ramas contra `main` va a necesitar combinar los dos juegos de
parámetros nuevos (`p_pais_origen/p_fabricante_declarado/p_material` + `p_tejido_id/
p_patron_id`) en una sola firma final — el segundo `DROP FUNCTION` en llegar borra los
parámetros del primero si no se hace a mano. Dejado en `docs/SESIONES-ACTIVAS.md` para
que ambas sesiones lo vean.

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
- **Navegador, de punta a punta:** login local (`felipe@cayla.local`) → `/productos/nuevo`
  → los 3 campos ("Etiquetado legal (opcional)") se completan → "Crear producto" →
  confirmado en Postgres que `pais_origen`/`fabricante_declarado`/`material` quedaron
  guardados exactamente como se escribieron → `/productos/[id]/editar` del mismo
  producto muestra los 3 valores precargados → el mismo formulario, abierto sobre un
  producto SIN estos datos (creado antes de esta migración), muestra los 3 campos vacíos
  con placeholder, sin ningún `"null"` ni espacio en blanco raro (confirmado con
  `read_page`: son `placeholder`, no `value`).

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
   en el SQL Editor (ver `CLAUDE.md`, "Cómo aplicar SQL a producción").
2. **Reconciliar con la rama de taxonomía de tejidos/patrones** cuando ambas lleguen a
   `main` — ver "Se rompe si".
3. El comentario desactualizado en `ProductoForm.tsx` (dice que sirve para
   `/productos/nuevo`, ya no es cierto) — no se tocó, fuera del alcance de esta tarea.
