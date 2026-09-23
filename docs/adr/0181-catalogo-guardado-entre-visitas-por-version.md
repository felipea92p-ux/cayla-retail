# ADR-0181 — El catálogo se guarda entre visitas y lo invalida la base, por versión

- **Fecha:** 2026-09-23
- **Estado:** aceptado (opción A, Felipe); migración `20260923184300_version_del_catalogo.sql`
- **Contexto de la sesión:** auditoría de velocidad módulo por módulo (BACKLOG «Velocidad»; PR #332, #335, #337, #339, #343)

## Problema

Ocho pantallas leen el catálogo **entero** en cada visita con `getCatalogo()` (`apps/web/lib/catalogo-v2.ts`): Vender,
Apartados, Cambios, Recibir, Compras ▸ Nueva, Conteo, Ingreso sin comprobante y Proformas. Son ~1.300 variantes con talla,
color, fotos, códigos de barras y marca: ~0,7 s de base por visita, en una base de producción **limitada por CPU** (medido:
1 consulta 430 ms, 6 a la vez 1,3 s). El catálogo cambia pocas veces al día; la caja lo pide muchas veces por hora.

## Decisión

1. `getCatalogo()` guarda el resultado entre visitas con `unstable_cache` (caché de datos de Next/Vercel).
2. La copia se identifica por **la versión del catálogo que mantiene la base**: `retail.catalogo_version`, un solo número
   que suben disparadores *por sentencia* en las 8 tablas que el catálogo muestra (`variantes`, `productos`,
   `producto_fotos`, `codigos_barras`, `tallas`, `colores`, `categorias`, `marcas`). La web la lee con
   `fn_catalogo_version()` (una consulta de milisegundos) y busca la copia de ESA versión.
3. La clave incluye también el commit desplegado (`VERCEL_GIT_COMMIT_SHA`): la caché sobrevive a los despliegues y un
   cambio en la forma de `VarianteCatalogo` no debe encontrarse con una copia armada por el código anterior.
4. Si la versión no se puede leer (migración sin pegar, error), se lee **en vivo**: más lento, nunca viejo.

## Por qué así (y no invalidar a mano)

La alternativa natural era `revalidateTag("catalogo")` en cada lugar que edita. Descartada por dos razones medidas:

- **Quién escribe el catálogo no es solo la web**: RPC (`catalogo_actualizar_producto`, `fn_recalcular_costo_variante` desde
  `recibir_compras`/`recibir_lote`/`recibir_envio`/`cerrar_produccion`…), scripts de carga y Dynamic. Un lugar olvidado =
  un precio viejo en la caja. Con la versión en la base no hay lista que mantener (principio 2: el diseño impide el estado
  imposible, no una disciplina).
- En Next 16, `revalidateTag(tag, "max")` sirve **una vez más** la copia vieja mientras refresca: inaceptable para precios.

## Condición que la sostiene

La copia es **compartida** por todas las cuentas. Es correcto porque las 8 tablas se leen igual con cualquier sesión
(`auth.role() = 'authenticated'`, y `costo`/`precio` con `SELECT` para `authenticated`; verificado en producción el
2026-09-23). **Si algún día se esconde una columna del catálogo a un rol** (p. ej. `costo` a quien no es líder), esta copia
deja de poder compartirse: habría que separarla por rol o quitar esa columna de `getCatalogo()`.

## Consecuencias

- Una edición de catálogo (o una recepción que recalcula costos) hace que la siguiente visita lea fresco: el costo es una
  lectura completa, como hoy. Una venta no toca estas tablas.
- Ediciones concurrentes de catálogo se serializan un instante sobre la fila única de la versión: volumen bajo, aceptable.
- Tope: la caché de Vercel guarda hasta ~2 MB por entrada; hoy el catálogo ocupa ~0,5 MB. Pasadas ~5.000 variantes dejaría
  de guardarse (se leería en vivo): entonces, adelgazar lo que se guarda.
- Hallazgo aparte, no resuelto aquí: `getCatalogo()` manda `costo` al navegador en la caja a cualquier colaborador (la base
  hoy lo permite). Ver BACKLOG.
