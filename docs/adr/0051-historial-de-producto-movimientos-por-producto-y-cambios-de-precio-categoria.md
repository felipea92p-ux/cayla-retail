# ADR-0051 — Historial de Producto: `p_producto_id` en `fn_movimientos` + ledger nuevo para precio/categoría

**Fecha:** 2026-09-15
**Estado:** Aplicado en la base local (`20260915204457_movimientos_por_producto.sql`,
`20260915204541_historial_producto_cambios.sql`). **No aplicado en producción** — falta
que Felipe lo pegue con el prefijo `retail.` (ver CLAUDE.md). Hasta entonces, el
diccionario de `docs/datos/` no se regenera y ambas migraciones viven en BACKLOG como
"no está en producción".
**Afecta:** `retail.fn_movimientos` (firma cambia: nuevo parámetro opcional al final,
mismo `returns table`), tabla nueva `retail.historial_producto_cambios`, funciones
nuevas `retail.fn_registrar_cambio_producto` (trigger) y
`retail.fn_historial_producto_cambios` (lectura); triggers nuevos en `retail.productos`
y `retail.variantes`; `apps/web/lib/movimientos-v2.ts` (función nueva
`listarMovimientosProducto`), `apps/web/lib/historial-producto.ts` (nuevo),
`apps/web/components/HistorialProductoPanel.tsx` (nuevo),
`packages/database/src/types.ts` (tipos a mano, ver Consecuencias).
**Ninguna tabla existente cambia de forma. Ninguna escritura existente cambia de
comportamiento.**

## Contexto

Encargo: un panel de "Historial de Producto" — movimientos de stock de todas las
variantes de un producto, más (decisión de Felipe, tomada en esta sesión) los cambios de
precio y categoría, que hoy no dejan ningún rastro.

Auditoría antes de tocar nada (principio 1): `fn_movimientos` (ADR-0050) ya arma una fila
plana del ledger, pero **filtra por `p_ubicacion_id` obligatorio, no por producto ni
variante** — el único filtro relacionado es `p_busqueda`, texto libre. Y
`productos`/`variantes` no tienen `updated_at` ni ningún log: un `UPDATE` de `precio` o
`categoria_id` pisa el valor anterior sin dejar huella.

## Decisión

1. **`p_producto_id` se agrega a `fn_movimientos`, `p_ubicacion_id` sigue obligatorio.**
   El historial de un producto se mira sede por sede, con selector — mismo modelo de
   permiso que `/movimientos` (`fn_puede_operar_ubicacion`), en vez de una función nueva
   que agregue varias sedes a la vez. Decisión de Felipe: reusar el permiso que ya existe
   pesa más que ver todas las sedes en una sola lista.
2. **Los cambios de precio/categoría son un ledger append-only nuevo, no una columna
   `updated_at`.** `updated_at` solo guardaría el último cambio; un historial de verdad
   necesita todos. `retail.historial_producto_cambios` (`entidad`, `entidad_id`, `campo`,
   `valor_anterior`, `valor_nuevo`, `usuario_id`, `created_at`) sigue el mismo espíritu
   que `movimientos`: se inserta, nunca se edita ni se borra (trigger propio que rechaza
   `UPDATE`/`DELETE`, mismo patrón que ADR-0042).
3. **Se llena por TRIGGER en `productos`/`variantes`, no por una llamada explícita desde
   cada pantalla.** Decisión de Felipe. Razón concreta: la ficha de producto (edición de
   precio/categoría) se estaba construyendo en paralelo, en otra sesión, en el mismo
   checkout — un trigger a nivel de base captura el cambio pase lo que pase por encima
   (esa ficha, una futura importación masiva, una consola SQL), sin depender de que
   alguien recuerde loguearlo. Compara con ADR-0042: la misma filosofía de "invariante en
   la base, no disciplina de app".
4. **El trigger es `security definer`** para poder insertar en el ledger sin necesidad de
   dar privilegios de `INSERT` sobre `historial_producto_cambios` a `authenticated` — la
   tabla tiene RLS activada sin políticas y todo privilegio directo revocado; solo se
   llega por el trigger o por `fn_historial_producto_cambios`.
5. **`fn_historial_producto_cambios` resuelve nombres, no ids crudos.** `categoria_id`
   viaja como texto (`valor_anterior`/`valor_nuevo`, columna genérica para poder guardar
   tanto un uuid de categoría como un precio numérico); la función hace un join a
   `categorias` **con un `case when campo = 'categoria_id' then …::uuid end`**, no un
   `and` en el `ON` — en Postgres el orden de evaluación de un `and` no está garantizado,
   y castear `"99.90"` (un cambio de precio) a `uuid` directamente reventaría esa fila.
6. **Alcance exacto: `categoria_id` de `productos` y `precio` de `variantes`, nada más.**
   No un genérico "cualquier columna cambió" — eso metería ruido (ej. `activo`) que
   Felipe no pidió. Si mañana se quiere auditar otro campo, se agrega al `if`/`elsif` del
   trigger a propósito, no automáticamente.

## Alternativas descartadas

- **Agregar `updated_at` a `productos`/`variantes`.** Resuelve "¿cuándo fue la última
  vez?", no "historial" — se pierden todos los cambios intermedios. Descartado porque el
  pedido explícito era ver el historial, no solo el último valor.
- **Cada pantalla que edita loguea el cambio a mano.** Más simple de escribir, pero frágil
  exactamente en el escenario real de esta sesión: otra sesión ya estaba construyendo la
  ficha de edición en paralelo, sin saber de esta tabla — su código no la habría llenado,
  y el historial habría quedado incompleto hasta que alguien coordinara el cambio.
- **Una función nueva que agregue movimientos de varias sedes a la vez** (en vez de
  `p_producto_id` sede por sede). Descartado por Felipe: reusar el modelo de permiso ya
  probado pesa más que la comodidad de ver todo junto; queda como posible Fase 2 si hace
  falta.

## Consecuencias

- `fn_movimientos` cambia de firma (`drop function` + `create function`, no
  `create or replace`, porque Postgres no permite agregar un parámetro con
  `create or replace`). Compatible hacia atrás: el parámetro es opcional y va al final;
  ningún llamador existente (`/movimientos`) cambia de comportamiento — verificado con
  `p_producto_id` omitido devolviendo las mismas filas que antes.
- **`packages/database/src/types.ts` se editó a mano**, no con
  `generate_typescript_types`: el Postgres local es un checkout compartido entre 7
  sesiones en paralelo y no era seguro correr `supabase db reset` (otra sesión lo había
  reiniciado minutos antes). Cuando alguien regenere los tipos contra una base estable,
  esta edición a mano queda reemplazada por la real — no debería haber diferencia si el
  SQL de esta migración es la fuente de verdad.
- El historial de precio/categoría empieza a contar desde que el trigger existe: no hay
  forma de reconstruir cambios pasados que nunca se guardaron.
- **Se rompe si** alguien agrega un campo a auditar en el trigger sin agregar el `case
  when` correspondiente en `fn_historial_producto_cambios` para resolver su nombre (si
  aplica) — el dato se guardaría, pero se leería como texto crudo.
- **Hallazgo aparte, documentado en el código** (`app/(app)/productos/dev/historial/[id]/page.tsx`):
  una carpeta de ruta con prefijo `_` (`_dev`) es una "private folder" en el App Router de
  Next.js — Next la excluye del ruteo por completo (404 directo, ni compila la página).
  La ruta de demo de esta sesión se armó como `productos/dev/historial/[id]` (sin guion
  bajo). Si el criterio de demo temporal de otra sesión usó `_dev`, tiene el mismo
  problema — vale la pena que quien cierre esa sesión lo revise en el navegador, no solo
  en el build.
