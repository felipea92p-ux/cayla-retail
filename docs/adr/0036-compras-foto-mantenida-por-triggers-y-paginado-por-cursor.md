# ADR-0036 — Compras: la foto la mantiene la base (triggers) y se pagina por cursor

**Fecha:** 2026-09-12
**Estado:** Aplicado y medido en local con 500 000 facturas sintéticas. Migración
`20260912234815_compras_snapshot_y_paginado.sql`. Pendiente: pegar en producción.
**Afecta:** `compras` (columnas `pagado`, `facturado_cantidad`, `recibido_cantidad` +
generadas `documento`, `saldo`, `estado_pago`, `estado_recepcion`), triggers sobre
`compra_items`/`compra_pagos`/`movimientos`, `recalcular_compras()`, índices,
`compras_resumen` (redefinida sin agregados), RPCs `listar_compras` y
`resumen_compras`, políticas RLS de las tres tablas; en la app `lib/compras.ts`
(`listarCompras`, `getResumenCompras`, `filtrosDesdeParams`),
`components/FiltrosCompras.tsx`, `components/Paginacion.tsx` y las tres páginas de lista.

## Contexto

Felipe pidió filtros y paginado en las tablas de Compras "para millones de
registros". CAYLA no va a tener millones de facturas de compra (3 tiendas + 1
taller), pero la forma correcta es la misma a 300 que a 3 millones: **la app
nunca trae más de una página, y todo filtro cae en un índice**.

El diseño de ADR-0035 calculaba `pagado` y `recibido` en la vista, sumando
pagos y movimientos por cada fila al consultar. Correcto para ver una factura;
imposible de indexar para filtrar "las pendientes de pago" sobre una tabla grande.

## Decisión

**DECIDÍ: la misma arquitectura que ya tiene el stock.** `compra_pagos`,
`compra_items` y `movimientos` siguen siendo la única verdad (principio 4);
`compras.pagado / facturado_cantidad / recibido_cantidad` son la foto,
mantenida por triggers en la misma transacción, y `recalcular_compras()` la
reconstruye desde la verdad en cualquier momento (como `recalcular_stock()`).
Nadie puede escribir la foto a mano: no hay política de UPDATE y las RPC no la tocan.

- **Columnas generadas** encima de la foto (`saldo`, `estado_pago`,
  `estado_recepcion`, `documento`): cero lógica duplicada, y son indexables.
- **Índices por filtro**: orden (`fecha_emision desc, id desc`) y compuestos
  por estado de pago / recepción / condición; **parciales** para "por pagar"
  (`estado='vigente' and saldo>0`) y "por recibir" — chicos aunque haya
  millones pagadas/recibidas; **trigram** (`pg_trgm`) sobre `documento` y
  `proveedores.nombre` para buscar por cualquier fragmento.
- **Paginado por cursor (keyset)**, no OFFSET: el cursor es `(fecha, id)` de
  la última fila vista y Postgres salta por el índice. Solo hay "siguiente" y
  "volver al inicio": un "página 7 de 2 000" exigiría OFFSET o un COUNT(*) por
  carga — justo lo que no escala. Para ir a un punto exacto están los filtros.
- **Una sola función, `listar_compras(...)`**, sirve a las tres pantallas con
  los filtros como parámetros. Dos consultas estáticas adentro (orden por
  emisión / por vencimiento) en vez de un `ORDER BY CASE`, que no puede usar
  índice para ordenar. Devuelve `limite+1` filas para saber si hay otra página
  sin contar.
- **Filtros en la URL** (`?q=&prov=&pago=&recep=&cond=&desde=&hasta=&vencidas=`):
  la página es Server Component, el enlace se comparte, "atrás" funciona.
  Cambiar un filtro borra el cursor.
- **Cifras de cabecera en `resumen_compras()`** (una llamada, `security
  definer` con chequeo de sesión), nunca sumando en la página.

## Lo que se midió y se corrigió en el camino (500k filas, psql)

| Consulta | Antes | Después | Causa |
|---|---|---|---|
| Lista, página 1 | 184 ms | 0.9 ms | `ORDER BY CASE` → dos consultas estáticas |
| Por pagar vencidas | 118 ms | 0.9 ms | índice parcial con `total - pagado > 0` no matchea `saldo > 0`; se redefine con `saldo` |
| Búsqueda por número | 286 ms | 11 ms | `OR` contra columna de otra tabla → proveedores resueltos a array antes, BitmapOr en `compras` |
| Búsqueda sin resultados | 578 ms | 0.6 ms | ídem |
| `resumen_compras` por PostgREST | 3 100 ms | 220 ms | RLS `auth.role() = …` evaluada por fila → `(select auth.role())` (InitPlan) + `security definer` |

Las páginas reales en Next (dev) con 200k facturas: ~0.35 s cada una.

## Consecuencias

- Toda política RLS nueva que llame a `auth.*` se escribe como
  `(select auth.xxx())`. Las políticas viejas del repo (`0004_rls.sql`) no se
  tocan acá — no son de este módulo — pero es el mismo problema latente.
- Si alguien inserta en las tablas de verdad saltándose los triggers (solo
  puede el rol `postgres` desde el SQL Editor), la foto queda vieja hasta
  `select retail.recalcular_compras();`.
- `listarPorRecibir` filtra con `p_por_recibir` (índice parcial), no en la app.

## Cómo verificar

`npx supabase db reset`, cargar filas sintéticas con el `generate_series` que
está en la conversación del 2026-09-12 (o cualquier volumen), y en Studio:
`select * from retail.listar_compras(p_busqueda => '00123', p_limite => 50);`
debe responder en milisegundos con `\timing on`.
