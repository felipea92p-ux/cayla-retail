# ADR-0176 — RLS: la función de permisos se evalúa una vez por consulta, no una vez por fila

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe, 2026-09-22: «hazlo con la A y luego hacemos B») · **Migraciones:** `20260923143700_rls_ventas_una_vez_por_consulta.sql` (A) y `20260923152300_rls_todas_una_vez_por_consulta.sql` (B) — las dos **PEGADAS en producción** el 2026-09-22

## Contexto

Ventas ▸ Historial mostraba «No se pudo cargar» (digest `575251889`). En los logs de Vercel: `canceling statement due to statement timeout`. `authenticated` tiene `statement_timeout = 8s`.

Ese mismo día el sembrado de 90 días (ADR-0150) llevó `ventas` de 16 a 7.001 filas. Las políticas de lectura llamaban `fn_puede_operar_ubicacion(ubicacion_id)` **una vez por fila**. Esa función llama a `fn_es_lider()` y a `fn_ubicacion_actual_persona()`, que son SECURITY DEFINER: Postgres no puede incrustarlas, así que corre su consulta (`personas` ⨝ `colaboradores`) por cada venta, y otra vez por cada ítem, pago y comprobante que la pantalla trae dentro de cada venta. Además, `ventas` no tenía índice por fecha: cada página recorría y ordenaba todas las ventas.

Mediciones en producción (como líder y como integrante, dentro de transacciones revertidas):

| Consulta | Antes | Después |
|---|---|---|
| Contar las ventas visibles | 2.664 ms | 1,6 ms |
| Lista del historial (51 filas con prendas, fotos, pagos y comprobantes), integrante | 12.294 ms (> 8 s: se caía) | 1.174 ms |
| Página real (21 filas), integrante, ya pegada | — | 482 ms |
| Totales del rango (tope de 1.001 ventas), líder | — | 28 ms |

## Decisión

**En una política RLS, toda función que depende solo de quién pregunta (no de la fila) va envuelta en `(select …)`.** Así Postgres la resuelve una sola vez como InitPlan y compara cada fila contra ese resultado. Es la receta de Supabase («wrap functions in select»).

```sql
-- mal: una consulta por fila
using (retail.fn_puede_operar_ubicacion(ubicacion_id))
-- bien: una consulta por pedido
using ((select retail.fn_es_lider()) or ubicacion_id = (select retail.fn_ubicacion_actual_persona()))
```

`fn_puede_operar_ubicacion(x)` no se puede envolver tal cual porque recibe la fila como argumento. Por eso se abre en sus dos piezas, que no dependen de la fila.

**Equivalencia:** la regla vieja era `coalesce(lider or ubicacion_id = actual, false)`. Cuando la persona no es líder y no tiene ubicación, la nueva da NULL, y para la RLS NULL también es «no pasa». Se verificó con la huella md5 de los ids visibles en las cuatro tablas, antes y después, como líder (7.002 ventas) y como integrante (4.777): 8 de 8 idénticas.

## Alcance por etapas

- **A (hecha):** las políticas de lectura de `ventas`, `venta_items`, `venta_pagos` y `comprobantes`, más el índice `ventas (created_at desc, id desc)`.
- **B (hecha, Felipe 2026-09-22: «vamos con la B»):** `20260923152300_rls_todas_una_vez_por_consulta.sql` reescribe todas las demás con dos funciones que quedan en la base: `retail.fn_rls_reescribir(texto)` (reescritura pura del texto) y `retail.fn_rls_una_vez_por_consulta()` (recorre las políticas vigentes y aplica `alter policy` a las que cambian). Se eligió una función en vez de 92 `alter policy` copiados a mano porque varias migraciones de `main` que crean o cambian políticas todavía no están en producción, y copiar el texto de hoy las habría pisado. La equivalencia se probó expresión por expresión: para cada política y cada cláusula (USING y WITH CHECK), las filas donde la vieja da verdadero son las mismas que con la nueva, como líder, integrantes de TRU, AQP y Taller, y dos terminales. Detalle abajo.
- **Contexto de la B:** antes de cerrar la A quedaban 92 políticas en `retail` con el mismo patrón (`stock`, `movimientos`, `cajas`, `transferencias`, `separaciones`…, y las `*_write_lider` del catálogo, que por ser `ALL` también se evalúan al leer). Hoy son el resto del 1,2 s de la lista: `variantes`, `productos` y `producto_fotos` llaman `fn_puede_editar_catalogo()` por fila, y `ubicaciones` llama `fn_es_lider()`. Van en su propia migración, con la misma prueba de huellas tabla por tabla.

### Resultado de la B (pegada en producción el 2026-09-22)

La función reescribió **92 políticas**; al cerrar quedaban 0 pendientes de las 131 de `retail`. La equivalencia se comparó sobre 121 cláusulas en producción, con 6 cuentas (líder; integrantes de TRU, AQP y Taller; terminales Caja Lima y Almacén Trujillo): 121 de 121 iguales en cada una. Se midió como integrante de TRU, con las mismas filas visibles antes y después:

| Consulta | Antes | Después |
|---|---|---|
| Contar movimientos visibles (13.563) | **57,1 s** (se caía: tope de 8 s) | 14 ms |
| Contar stock visible (2.348) | **7,3 s** (al borde) | 3 ms |
| Historial, 21 ventas con catálogo | 475 ms | 23 ms |

Antes de pegarla se guardó fuera del repo un respaldo de las 131 políticas como estaban (un `alter policy` por cada una, con el texto viejo). No se versiona: volver atrás solo devolvería la lentitud, porque la reescritura cambia la forma de la regla y no qué permite.

## Lo que se rompería sin esto

Cada pantalla que lee muchas filas se vuelve más lenta en proporción directa al volumen, hasta pasar los 8 s y caer. Historial cayó primero porque es la pantalla que más filas lee. Con el volumen del sembrado, Movimientos y Stock son las siguientes candidatas.

## Regla para lo nuevo

Una política nueva no llama a una función de permisos sin `(select …)`. **Toda migración que cree o cambie políticas termina con `select retail.fn_rls_una_vez_por_consulta();`**: es idempotente, no toca lo que ya está bien, y así pegar en producción una migración escrita antes de esta regla no reintroduce la lentitud. Solo la pueden ejecutar las migraciones (dueño de las tablas); la app no tiene permiso.

La función entiende dos formas: las llamadas `retail.fn_xxx()` sin argumentos, y `retail.fn_puede_operar_ubicacion(columna)`. Una función de permisos nueva que reciba argumentos necesita su propia regla en `fn_rls_reescribir`: si no, la consulta de abajo la muestra como pendiente.

Para revisar lo que ya existe:

```sql
-- políticas con alguna llamada a función que NO está envuelta en (select …); 92 al cerrar la A
select tablename, policyname, cmd from pg_policies
where schemaname = 'retail'
  and regexp_count(coalesce(qual,'') || ' ' || coalesce(with_check,''), 'retail\.fn_\w+\(')
    > regexp_count(coalesce(qual,'') || ' ' || coalesce(with_check,''), 'SELECT retail\.fn_\w+\(')
order by 1, 2;
```
