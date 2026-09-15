# ADR-0053 — Fotos de producto (varias, reordenables), temporada y venta sin stock

**Fecha:** 2026-09-15
**Estado:** Aplicado en la base local (`20260915224500_producto_fotos_temporada_venta_sin_stock.sql`).
**No aplicado en producción** — falta pegarla con el prefijo `retail.` (CLAUDE.md).
**Afecta:** tabla nueva `retail.producto_fotos`; columnas nuevas
`retail.productos.temporada` y `retail.productos.permitir_venta_sin_stock`; bucket
`retail-productos-fotos` (público); `catalogo_crear_producto`/
`catalogo_actualizar_producto` ganan `p_temporada`, `p_permitir_venta_sin_stock` y
`p_fotos`; `apps/web/lib/catalogo-v2.ts` (`ProductoDetalle`, `getProducto`);
`apps/web/lib/producto-fotos.ts` (nuevo); `apps/web/components/FotosProducto.tsx`
(nuevo); `apps/web/components/ProductoForm.tsx`; `packages/database/src/types.ts`.

## Contexto

Sesión F1 de un reparto de 4 en paralelo sobre `DiegoN` (F1-F4 + integradora F5), dueña
de `/productos/nuevo` y `/productos/[id]/editar`. La consigna: ficha de producto con
fotos (varias, reordenables), temporada, venta-sin-stock y margen % en pantalla.

La consigna asumía que `retail.productos` en producción ya tiene `foto_url` y
`temporada` como columnas V1 muertas, y que la migración debía "resucitarlas"/migrar
`foto_url`. Verificado contra `docs/datos/generado/DICCIONARIO-RETAIL.md` (refrescado
2026-09-15 directo desde producción, no a mano): la tabla real tiene **7 columnas** —
`id, categoria_id, referencia, descripcion, estado, created_at, codigo` — ninguna de las
dos existe. La suposición venía de `docs/datos/modulos/02-catalogo-y-vocabulario.md`,
que describe el `productos` de V1 (con `sku_padre`, `marca`, `foto_url`,
`costo_mano_obra`...) — el aviso de la cabecera de `CLAUDE.md`/`BACKLOG.md` de que esa
carpeta describe V1 y no lo que hoy corre en producción resultó literal también acá.

## Decisión

1. **Tabla `producto_fotos` aparte, no una columna `foto_url`.** "Varias, reordenables,
   una principal" no cabe en un `text`. Una fila por foto, con `orden` y `es_principal`
   (índice único parcial: a lo más una por producto — el candado real, no una
   convención de la UI). Mismo espíritu que `compra_adjuntos`: la tabla es la fuente de
   verdad, el bucket solo aloja bytes.
2. **Bucket público, no privado con URL firmada** (a diferencia de
   `retail-compras-adjuntos`). Una factura de proveedor lleva RUC y montos; una foto de
   producto existe para mostrarse — catálogo y, a futuro, POS/vitrina. `getPublicUrl`
   directo, sin generar una URL firmada por cada `<img>`. Mismo patrón que ya usa
   `fotos-perfil` (bucket de Dynamic, `PerfilModal.tsx`) — no inventado acá.
3. **El candado de negocio vive en la RPC, no en la policy de storage.** La política de
   `storage.objects` solo mira `bucket_id`; quién puede hacer que el objeto EXISTA para
   el sistema (escribir la fila en `producto_fotos`) lo decide
   `producto_fotos_write_lider` (RLS), igual que `productos`/`variantes`.
4. **Las fotos entran como `p_fotos` a las mismas dos RPC de alta/edición, no RPC
   propias.** El criterio de verificación es "crear con 3 fotos, reordenar, marcar
   principal, guardar, recargar, confirmar que persiste" — el guardado es un solo acto,
   igual que ya lo es para variantes. `p_fotos` reemplaza la lista completa en el orden
   del array (mismo patrón que `p_variantes`: `id` presente = fila existente, ausente =
   nueva). `p_fotos = null` en la de editar significa "no tocar la galería" (no todas
   las llamadas futuras van a traer fotos); `[]` sí la vacía a propósito. El posible
   "doble `true`" de `es_principal` a mitad de un UPDATE fila por fila se evita poniendo
   TODO el producto en `es_principal = false` antes del loop que vuelve a marcar como
   mucho una — el índice único parcial no es diferible.
5. **Reordenar en la UI es con flechas (‹ ›), no arrastre nativo HTML5.** Un drag&drop
   nativo es poco confiable en touch (tablets de tienda); una flecha se toca igual de
   rápido y se prueba con un clic (Playwright, sin simular gestos de arrastre).
   Simplicidad radical antes que una librería de DnD para 3-5 fotos por producto.
6. **`temporada` y `permitir_venta_sin_stock` se agregan de cero, no se "resucitan".**
   Mismo resultado práctico (`add column if not exists`) que pedía la consigna, pero el
   porqué es distinto: no había nada que resucitar. La migración de `foto_url` legado
   queda con una guardia real (`information_schema.columns`, columna puede no existir)
   en vez de asumida — por si algún entorno (no producción, verificado) todavía la tiene.
7. **Margen % es cálculo derivado en cliente, sin columna nueva.** `(precio − costo) /
   precio` en `ProductoForm.tsx`; no hay nada que persistir ni recalcular en la base.
8. **`permitir_venta_sin_stock` solo se escribe y se muestra en esta sesión.** El
   candado real (que `registrar_venta` deje vender con stock 0 cuando el flag está
   activo) queda fuera de alcance — F1 es dueña de la ficha, no de Vender/POS (otras
   sesiones lo tocan en paralelo). Queda en BACKLOG.

## Verificación

Sin Docker funcional para Supabase local en este entorno (pulls de imagen bloqueados por
la política de red del sandbox), la migración se probó completa —columnas, tabla,
índices, RLS y las dos RPC reescritas— contra un schema `f1_dryrun` aislado dentro del
mismo proyecto Supabase de producción (`cayla-dynamic`/`vovjyyiafkxteijimpuy`), nunca
contra `retail.*` real: alta con 3 fotos (principal automática en la primera), edición
con reorden + cambio de principal + foto nueva + persistencia, borrado de una foto con
reasignación de principal, y `p_fotos = null` sin tocar la galería. Schema `f1_dryrun`
borrado al terminar. `pnpm typecheck`, `lint` y los 215 tests existentes (`pnpm test`)
en verde, sin regresiones. **No se verificó en navegador real** (Chrome headless/
Playwright) por la misma limitación de Docker — pendiente para quien continúe esta
sesión o para F5 al integrar.
