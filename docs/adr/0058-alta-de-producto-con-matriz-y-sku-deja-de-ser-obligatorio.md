# ADR-0058 — Alta de producto con matriz talla×color, y `sku` deja de ser obligatorio

**Fecha:** 2026-09-15
**Estado:** Aplicado y verificado en la base local. **No aplicado en producción** — es una
prueba local a pedido de Felipe, sin ok todavía para producción.
**Afecta:** `retail.variantes.sku`, `retail.productos.token_cliente` (nueva),
`retail.crear_producto_con_variantes` (nueva) — en
`supabase/migrations/20260915221526_categorias_tallas_sugeridas.sql` y
`supabase/migrations/20260915221633_crear_producto_con_variantes.sql`.

## Contexto

Se auditó el modelo de variantes de CAYLA contra el de Lightspeed Retail (POS de
referencia) para ver qué aplicaba a talla/color. El hueco de mayor consecuencia no era el
modelo de datos — ya es sólido — sino que **la pantalla para dar de alta un producto con su
matriz talla×color no existe en V2**: `productos/page.tsx` era solo lectura desde el
2026-09-11 ("Alta de producto queda para Fase 2"). Escribir en `variantes` sin ella era
INSERT directo desde el cliente, sin transacción: una matriz de 5×6 cargada como 30 INSERTs
sueltos podía quedar a medias si el navegador fallaba a mitad de camino.

## Decisión

**DECIDÍ: una función nueva, `retail.crear_producto_con_variantes`, crea el producto y TODA
su matriz de variantes en una sola transacción**, siguiendo el mismo patrón que
`abrir_produccion` (`20260915130000_produccion_del_taller.sql`, hoy mismo): candado
`fn_es_lider()` explícito al inicio, idempotencia por `p_token`, loop de validación antes de
escribir una sola fila.

**Inmune por diseño al bug de `docs/BITACORA.md` 2026-09-10** (`AltaEnConteo` perdía
`p_producto_id` y creaba un producto nuevo por cada talla, partiendo el inventario en dos):
esta función no acepta `producto_id` — siempre crea exactamente uno, nunca reutiliza uno
existente.

**DECIDÍ además: `variantes.sku` pasa de `NOT NULL` a nullable.** Es un campo legado ("de
antes del 2026-09-09" según el propio diccionario de datos) que el trigger
`fn_asignar_codigo_variante` (`20260912235500_vocabulario_cerrado.sql`) ya trataba como
opcional (`if v_sku is not null then …`) pese a que la columna todavía lo exigía. Pedirle a
la RPC un SKU manual no tenía sentido — ya existe `codigo`, autogenerado — e inventar un
valor sintético solo para satisfacer el NOT NULL habría sido meter un dato falso a la
fuerza. Un índice UNIQUE en Postgres no choca entre NULLs, así que relajar esto no arriesgó
nada de lo ya sembrado (verificado, no asumido: `db reset` completo con el seed existente
corrió limpio después del cambio).

**No se le creyó al cambio sin evidencia — se corrió, no se razonó:**
1. `variantes.sku` nullable + la RPC probadas en el SQL Editor local: alta real (6
   variantes, S/M/L × dos colores, un override de precio en una celda), idempotencia (mismo
   `p_token` dos veces → mismo producto, no dos), rechazo de talla+color repetido dentro del
   mismo envío, y rechazo de un colaborador sin rol líder — los cuatro casos correctos.
2. **Blindaje de `security definer` confirmado, no asumido:** `grep` sobre toda
   `supabase/migrations/` — ninguna tabla tiene `FORCE ROW LEVEL SECURITY`. Sin el
   `fn_es_lider()` explícito dentro de la función, cualquier `authenticated` podría
   llamarla directo (`0005_grants.sql` da `execute` a todos por defecto), sin que
   `variantes_write_lider`/`productos_write_lider` lo frenaran.
3. **`grep` de `\.sku\b` en todo `apps/web`** antes de aplicar el cambio: encontró 2 sitios
   con llamada directa a método sobre `sku` sin guardia de null
   (`components/ConteoPanel.tsx:121`, `lib/inventario-v2.ts:109`) y una función de
   normalización de búsqueda (`lib/buscar-prenda-v2.ts` → `clave()`) que alimenta el
   **buscador/escáner de Vender** y también revienta — esa era la de mayor consecuencia real:
   una sola variante con `sku = null` en el catálogo rompía cualquier búsqueda de texto en el
   punto de venta, no solo la del producto nuevo. Los tres se corrigieron primero, en su
   propio commit, antes de tocar el esquema (principio: haz fácil el cambio, luego cámbialo).
4. `pnpm gen-types` regeneró los tipos de Supabase, lo que a su vez destapó otros 2 sitios
   que el `grep` manual no había encontrado (`lib/catalogo-v2.ts:42`, `lib/produccion.ts:159`)
   — `tsc --noEmit` los marcó como error de tipos, no en tiempo de ejecución. Corregidos con
   el mismo patrón `?? ""` que el resto del repo ya usa en casos análogos.
5. **Probado en el navegador de verdad**, contra el `pnpm dev` ya corriendo (no se levantó un
   segundo servidor — Next.js no deja correr dos del mismo directorio a la vez, y había otra
   sesión con el suyo activo): alta completa de "Blusa Aurora" vía la pantalla nueva
   (`/productos/nuevo`), y después una búsqueda de esa misma prenda en Vender — con sus 6
   variantes de `sku` null ya en el catálogo — sin error de consola ni pantalla caída.

**DESCARTÉ: exigir `p_categoria_id` opcional.** Sin categoría no hay de dónde sugerir
tallas (`categorias.tallas_sugeridas`, la otra mitad de este cambio), que es el punto de
agregar esta pantalla ahora.

**DESCARTÉ: deduplicar en silencio una celda de talla+color repetida** (a diferencia de
`abrir_produccion`, que sí suma cantidades repetidas con `group by`). Dos precios distintos
para la misma celda no tienen una fusión correcta — se rechaza con un error claro.

## Se rompe si

Alguien agrega una pantalla o reporte nuevo que asuma `variantes.sku` siempre tiene valor
(`.algo()` sin `?? ""` antes) — sale un `TypeError` en tiempo de ejecución si `tsc` no lo
atrapó primero (ver punto 4 arriba: dos de los cinco sitios reales no aparecieron en el
`grep` manual, solo al regenerar tipos).

## Lo que falta

1. **Aplicar en producción** — esta ronda fue explícitamente solo para probar en local; falta
   el ok puntual de Felipe, y decidir si conviene un backfill de `codigo`/`codigos_barras`
   para las variantes reales que todavía dependen de `sku`.
2. **`productos.referencia` sigue sin constraint de unicidad** — dos altas legítimas y
   separadas con el mismo nombre no chocan en ningún lado. Detectado durante el diseño, no
   resuelto a propósito: es una decisión de negocio (¿puede haber una reedición con el mismo
   nombre?), no de esquema. Sugerencia de bajo costo si Felipe la quiere: un aviso suave en
   la UI, sin constraint nuevo en el núcleo.
3. **Override de costo por celda** — la matriz nueva solo permite override de precio por
   celda; costo es un solo valor base para todo el producto. Recorte deliberado (la prenda
   casi nunca cambia de costo por talla/color); ampliarlo es un cambio de UI, no de esquema
   ni de la RPC.
4. **El componente compartido `Campo` (`components/ui/campos.tsx`) no separa visualmente
   `etiqueta` de `ayuda`** cuando ambos vienen largos (se renderizan pegados en la misma
   línea, ej. "REFERENCIACÓMO SE LLAMA..."). No es un bug de esta pantalla — pasa en
   cualquier formulario que use `ayuda` con más de 2-3 palabras. Se evitó en el texto propio
   de esta pantalla, no se tocó el componente compartido (fuera de alcance de esta prueba).
