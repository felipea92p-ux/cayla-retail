# ADR-0467 — Filtro «Tienda» (empresa) en Catálogo ▸ Productos

**Estado:** aceptada · migración EN PRODUCCIÓN desde 2026-10-20 (pegada con el OK de Felipe; la web va en el PR #1223) · **Fecha:** 2026-10-20 · **Decidió:** Felipe · Sigue a ADR-0463

## Contexto

Con CAYLA y CLAURE en el mismo catálogo (ADR-0463), Felipe pidió un filtro adicional en Catálogo ▸ Productos para ver solo las prendas de una
empresa. La lista (`fn_productos_listado`) y los conteos de cada opción (`fn_productos_facetas`) leen el mismo filtro interno
(`fn_productos_filtro`, 20261002200000) para que un conteo nunca contradiga a la lista.

## Decisión

- **El filtro se pone una sola vez, en `fn_productos_filtro`**, dentro de `visibles`: las variantes de otras empresas ni entran. Así lista y conteos
  coinciden por construcción y los conteos de las demás píldoras se calculan dentro de la empresa elegida. Los dos callers solo le pasan el parámetro.
- **Parámetro `p_empresa_id` al FINAL** de las tres firmas (`default null`): sin empresa, resultado idéntico al de antes (lo comprueba
  `pruebas:productos-empresa`). Cambia la firma, así que la migración 20261021004000 crea la nueva, borra la vieja y repite los permisos de siempre
  (filtro: solo postgres; lista y conteos: authenticated y service_role, nunca anon). Con las dos firmas a la vez una llamada sin el parámetro sería ambigua.
- **En la URL, `?empresa=<id>`** (como `cat` y `marca` llevan el suyo); la web solo manda `p_empresa_id` si hay una elegida, así que una base sin
  la migración sigue funcionando. La píldora dice «Tienda» (la palabra de Felipe) y **solo aparece si hay más de una empresa**.
- **Sin conteo por opción** en la píldora por ahora (no hay faceta «empresa»): sumarla es otro parche a `fn_productos_facetas`.

## Alternativas descartadas

- Filtrar en el navegador: la lista es paginada en la base; no vería las páginas siguientes.
- Parchar solo `listado` y `facetas` con su propia condición: dos reglas que pueden diverger, justo lo que el filtro compartido evita.
- Una firma nueva junto a la vieja (sobrecarga): ambigua para PostgREST con los argumentos con nombre.

## Lo que se rompe si…

- Se pega la web antes que la migración y alguien elige una tienda: la base no conoce `p_empresa_id` y la lista falla. Por eso la migración va antes de fusionar.
- Otra migración vuelve a crear las firmas viejas (como hacían las pruebas de listado y conteos): hay que volver a pegar la 20261021004000 después.

## Verificación

Migración probada con `begin … rollback` en el Postgres local: sin empresa, lista y conteos idénticos (huella md5); con CLAURE, 0 prendas, y con una
prenda cambiada a CLAURE sale 1 y CAYLA pierde 1; aplicarla dos veces no cambia nada. Pantalla vista con datos inventados (píldora, `?empresa=`, chip,
«Limpiar filtros»). Las 8 fallas de `pruebas:productos-listado` en la base local son las mismas sin este cambio (datos que la base local no tiene).
