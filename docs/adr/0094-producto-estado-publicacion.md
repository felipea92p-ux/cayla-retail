# ADR-0094 — `estado_publicacion`: un eje nuevo, distinto de si el producto vende

**Fecha:** 2026-09-17
**Estado:** Aplicado en LOCAL (`20260917201500_producto_estado_publicacion.sql`,
`20260917202000_productos_filtro_publicacion.sql`), verificado con `db reset` +
consultas directas. **No aplicado en producción** — no se pidió, y de todas formas el
backfill (ver abajo) solo tiene sentido corriendo una vez contra el catálogo real.
**Afecta:** tabla `retail.productos` (columna nueva); `retail.fn_productos`,
`retail.fn_productos_resumen`, `retail.catalogo_actualizar_producto` (drop + create,
firma nueva); `apps/web/lib/catalogo-v2.ts`, `apps/web/app/(app)/productos/page.tsx`,
`apps/web/app/(app)/vender/page.tsx`, `apps/web/components/FiltrosProductos.tsx`,
`apps/web/components/ProductoForm.tsx`, `apps/web/components/ProductosGrilla.tsx`,
`apps/web/components/ProductosAgrupados.tsx`, `packages/database/src/types.ts`. **No
toca** `retail.catalogo_crear_producto` ni `retail.crear_producto_con_variantes` — ver
"Descarté" más abajo.

## El problema

`retail.productos.estado` (`0002_esquema.sql:39`) responde una sola pregunta — "¿esto se
sigue vendiendo?" (`activo`/`descontinuado`). No existe ninguna noción de si un producto
está LISTO para mostrarse: un producto recién creado (sin fotos, sin variantes
completas) aparece en `/productos` y en `/vender` exactamente igual que uno terminado,
visible para cualquier colaborador de sede. Confirmado por grep de
`"publicacion|borrador|draft"` sobre `supabase/migrations/` para `productos`: cero
resultados antes de esta ADR.

## Decisión

**DECIDÍ: columna nueva, `estado_publicacion` (`borrador`/`activo`/`archivado`), eje
DISTINTO de `estado`.** Un producto puede estar `estado = 'activo'` (sigue
vendiéndose) y `estado_publicacion = 'borrador'` (nadie lo ve todavía) al mismo
tiempo — es el caso normal de un producto recién cargado, con stock en camino, pero sin
fotos/variantes terminadas.

**DESCARTÉ reusar `estado` agregando un tercer valor ahí mismo.** Ya existe precedente
de esta discusión en este repo — [ADR-0007](0007-facturacion-esquema-legal-completo.md),
sección "Alternativas descartadas": guardar la proforma como un `comprobante` en estado
`'borrador'` se descartó por mezclar un documento sin peso legal con uno que sí lo
tiene. Mismo defecto acá: el día que alguien filtre `estado = 'activo'` para un reporte
de ventas tendría que acordarse de que eso no significa "publicado". Ese ADR es
referencia de diseño (dos ejes de estado no comparten columna), no algo ya construido
para `productos` — antes de esta tarea no existía nada parecido para el catálogo.

**DECIDÍ: default `'borrador'` para todo lo nuevo desde ahora, backfill explícito
`'activo'` para lo que ya existía.** Sin el backfill, todo el catálogo real quedaría
invisible en `/productos` y `/vender` para cualquier colaborador de sede desde el primer
`db reset` — nadie lo pidió escondido retroactivamente.

**DECIDÍ: candado real en el servidor, no solo en la UI.** `productos_select`
(`0004_rls.sql:29`) deja ver CUALQUIER fila a cualquier `authenticated` — no hay RLS por
rol para SELECT en este esquema (mismo patrón que ya usa el resto de `/productos`: el
botón "+ Nuevo producto" se oculta con `persona.rol`, pero el candado real de escritura
es `productos_write_lider`). Sin un `if` explícito en el servidor, un colaborador vería
borradores con solo escribir `?pub=borrador` en la URL. `filtrosProductosDesdeParams`
(`catalogo-v2.ts`) fija `estadoPublicacion: esLider ? pub : "activo"` — la UI que no
muestra el filtro (`FiltrosProductos.tsx`, `esLider` prop) es la primera capa, no la
única.

**DECIDÍ: `/vender` excluye borrador/archivado para CUALQUIERA, líder o no.** A
diferencia del listado (donde un Líder sí puede ver/filtrar borrador y archivado),
vender un producto no listo es una decisión de una sola vía — nadie lo vende por
accidente, sea colaborador o líder. Publicar (pasar a `'activo'`) se hace en
`/productos/[id]/editar`, nunca desde la caja. Implementado en
`getCatalogo()`/`VarianteCatalogo.estadoPublicacion` (expone la publicación del
PRODUCTO en cada fila de variante) + un filtro adicional en `vender/page.tsx`
(`v.activo && v.estadoPublicacion === "activo"`) — `getCatalogo()` en sí NO filtra por
publicación, porque otros 7 llamadores (Compras/recibir, Compras/nueva, Inventario/
recibir, Inventario/traslados, Inventario/conteo, Cambios, Buscar) necesitan operar
sobre CUALQUIER producto sin importar si ya se publicó: recibir o contar stock de un
producto en borrador es normal (se compra antes de publicarlo). Solo Vender necesita
ocultarlo, así que solo Vender filtra.

**DESCARTÉ tocar `catalogo_crear_producto`/`crear_producto_con_variantes`.** Encontré
en el camino que `/productos/nuevo` (la ruta de alta REAL, alcanzable) usa
`NuevoProductoForm.tsx` + RPC `crear_producto_con_variantes`
(`20260915221633_crear_producto_con_variantes.sql`) — no `ProductoForm.tsx` + RPC
`catalogo_crear_producto`, aunque el propio comentario de `ProductoForm.tsx` diga "un
solo componente para /productos/nuevo y /productos/[id]/editar". Esa discrepancia ya
existía antes de esta tarea (no la causé ni la until oculto: es una inconsistencia de
integridad conceptual real — dos RPCs de alta distintas para el mismo problema — que
no me corresponde resolver acá, arriesgaría romper trabajo de otra sesión en curso
sobre ese mismo formulario). No hacía falta tocar ninguna de las dos para cumplir el
pedido: ninguna inserta hoy un valor explícito para `estado_publicacion`, así que un
producto nuevo por CUALQUIER camino ya nace en `'borrador'` por el DEFAULT de la
columna, sin RPC que cambiar. Lo que sí se agregó es el campo en `ProductoForm.tsx`
(edición, la ruta real) + `catalogo_actualizar_producto`, que es por donde un Líder
efectivamente publica un producto ya creado.

**DECIDÍ: `drop function if exists` explícito antes de cada `create` en las tres RPCs
tocadas — no `create or replace` a secas.** Agregar un parámetro nuevo cambia la lista
de TIPOS de la firma; Postgres trata una firma distinta como una sobrecarga NUEVA en
vez de remplazar la vieja. Es el incidente que
`20260917200000_fn_productos_dropea_sobrecarga_vieja.sql` documentó y repartó en
producción horas antes de esta tarea (dos sobrecargas de `fn_productos` vivas a la vez →
PostgREST no podía elegir con parámetros nombrados → `/productos` caído). No se repite
ese error acá.

## Se rompe si

Alguien agrega un tercer eje de estado a `productos` sin pasar por esta misma
disciplina (columna propia, nunca un valor extra en una columna que ya significa otra
cosa) — volveríamos al problema que esta ADR resuelve. También se rompe si algún día se
unifica `/productos/nuevo` para que use `ProductoForm.tsx`/`catalogo_crear_producto` en
vez de `NuevoProductoForm.tsx`/`crear_producto_con_variantes`: quien haga esa
unificación tiene que revisar que el nuevo camino único siga respetando el default
`'borrador'` (hoy lo hace por omisión, sin ningún código explícito que lo garantice más
allá del `DEFAULT` de la columna).

## Cómo se verificó

- `npx supabase db reset` limpio con las dos migraciones nuevas aplicadas sin error.
- Verificado por consulta directa (`psql`) justo después del reset: `estado_publicacion`
  existe con el `CHECK` correcto; `fn_productos`/`fn_productos_resumen` aceptan y
  filtran por `p_estado_publicacion`.
- `pnpm --filter web typecheck`: limpio para todo lo tocado por esta tarea. Quedan 4
  errores preexistentes y ajenos (`ConteoPanel.tsx`/`lib/conteos.ts`, `ventas_30d`/
  `valor_stock` — ya documentados en BITÁCORA 2026-09-17 como no relacionados, tipos de
  Supabase desactualizados de otra migración) más el caché stale de `.next` sobre la
  ruta `/almacen` ya borrada por otra sesión. `pnpm --filter web lint`: limpio.
  `pnpm --filter database typecheck`: limpio.
- `pnpm --filter web test`: 295/295 (mismo número que reportan ADR-0092/0093 el mismo
  día — sin regresión).
- **`packages/database/src/types.ts` se editó A MANO, no con `gen-types`.** El
  Postgres local de este worktree es un contenedor Docker COMPARTIDO por al menos 6
  sesiones paralelas trabajando sobre `cayla-retail` hoy — confirmado en vivo: en
  cuestión de minutos vi el mismo contenedor pasar de tener mi columna, a no tenerla
  (otra sesión corrió `db reset` con SU PROPIA carpeta de migraciones, que no incluye la
  mía), a perder hasta la tabla `retail.personas` por completo. Correr `gen-types`
  contra ese estado fluctuante trajo una vez un `Database = {}` vacío (el CLI ni
  siquiera pudo conectar) y sería, en el mejor caso, un snapshot de esquema de OTRAS
  sesiones en curso, no del mío. Se optó por editar el archivo a mano — mismo criterio
  que ya documentó ADR-0093 el mismo día por la misma razón.
- **No se pudo verificar en navegador (click-through).** El tooling de `preview_start`
  de esta sesión arranca el dev server en el worktree `producto-estado-publicacion-
  e3c13e` (el nombre con el que se lanzó la sesión), no en `ecstatic-booth-676259`
  (donde de verdad vive este trabajo, por instrucción explícita de la tarea) — mismo
  hueco que ya documentó hoy la sesión de "historial de producto: costo" en su propia
  entrada de BITÁCORA. Ese worktree está además varios cientos de commits atrás de
  `main` real: ni siquiera tiene la carpeta de rutas `/productos` (V2), así que no
  hubiera servido para probar esto aunque el tooling sí siguiera el `EnterWorktree` de
  la sesión. Se verificó en su lugar el candado real (servidor, no solo UI) por
  consulta directa a `fn_productos`/`fn_productos_resumen` con `p_estado_publicacion`, y
  se revisó cada archivo de UI tocado línea por línea.

## Lo que falta

1. **Verificación visual en navegador** — bloqueada por las dos razones de arriba, no
   por esta tarea. Cuando alguien tenga un worktree al día con `/productos` y el
   tooling de preview apuntando ahí, repetir el flujo: colaborador de sede no ve
   borrador ni en `/productos` ni en `/vender`; Líder los ve, los filtra, y puede
   cambiar uno a `'activo'` desde `/productos/[id]/editar`.
2. **Aplicar en producción** — con el prefijo `retail.` en el SQL Editor (ver
   `/CLAUDE.md`), pendiente de que Felipe decida.
3. Si algún día se unifica el alta de producto en un solo camino, revisar que el
   default `'borrador'` siga garantizado (ver "Se rompe si").
