# ADR-0194 — Prueba de carga: 15 a 50 personas a la vez sobre un año de datos

- **Fecha:** 2026-09-24
- **Estado:** en producción: Felipe pegó `20260924180000_varios_usuarios_lecturas_rapidas_y_cambio_en_orden.sql` el
  2026-09-24 y se verificó en solo lectura (firmas, pre-bloqueo, índices, políticas, permisos, llamadas). Sin cambios en la web.
- **Contexto:** Felipe pidió probar todo el ERP para encontrar bugs y demoras cuando muchas personas lo usan a la vez
  (meta: 15 a 50 a la vez), en el Postgres local y validando antes que el local esté igual a producción. Sigue a la
  auditoría de concurrencia de ADR-0188 a 0193 (candados, doble clic, totales en la base), que no midió volumen.

## Cómo se armó la prueba

1. **Local igual a producción, comparado por huellas.** md5 del cuerpo de cada función, de cada columna, índice y
   política, en local y en producción (`vovjyyiafkxteijimpuy`, solo lectura). Al empezar el local iba 16 migraciones
   atrás (y una, `conteo_vacio_no_se_cierra`, nunca había corrido: su número lo ocupaba otra) y **46 funciones hacían
   algo distinto que en producción** (ediciones en vivo y, sobre todo, lo que pasa al aplicar migraciones viejas DESPUÉS
   de las nuevas: recrean funciones con su cuerpo viejo y pisan los parches de concurrencia; ver «Lo que queda»).
2. **Base aparte `cayla_carga`** (copia del local + las 45 funciones tal como están en producción + la tabla `gastos`
   que solo existe allá). La base `postgres` del local la comparten las otras sesiones y no se tocó para medir.
3. **Un año de operación sintética** (`scripts/carga/01_volumen.sql`): 6 tiendas, 3.000 productos × 8 = 24.000
   variantes, 144.000 filas de stock, 60 colaboradoras con asistencia diaria (marcajes y jornadas como Dynamic),
   2.190 cajas, 131.000 ventas con 263.000 líneas, 131.000 boletas, 407.000 movimientos, 20.000 clientas. Producción
   hoy tiene 3 productos y 0 ventas: medir allá no dice nada de cómo se portará en 12 meses.
4. **Personas simuladas con pgbench** (`scripts/carga/`): cada una es una colaboradora con su cuenta, su tienda y su
   entrada marcada, entra como `authenticated` (RLS activa) con los límites de PostgREST de producción (8 s por consulta
   y por espera) y hace la mezcla de un día: cobrar 40 % (prendas elegidas con Zipf: pocas muy vendidas, para forzar
   choques), mirar la caja 20 %, abrir Vender 15 %, «ventas de hoy» 15 %, Existencias 10 %. Sin pausas: peor caso.
5. **Dos métricas**, porque la Mac tenía otras sesiones (carga 10 a 72): milisegundos con el antes y el después
   INTERCALADOS en la misma sesión, y **bloques leídos** (`explain (analyze, buffers)`) para cada consulta sola, que no
   depende de lo ocupada que esté la máquina.

## Lo que se encontró

| # | Hallazgo | Medido | Tipo |
|---|---|---|---|
| 1 | `fn_ventas_del_dia` (Vender, cada apertura) filtraba «hoy» con `(created_at at time zone …)::date = hoy`: sin índice, recorría toda la historia; y Postgres metía «¿es líder?» en el WHERE (`fn_es_lider()` 2 veces por venta) | 3 s por llamada con 15 personas; con 50, 196 de 207 llamadas pasaban los 8 s | arreglado |
| 2 | `fn_productos` (Existencias) calculaba demanda y reposición con dos laterales dentro de producto × variante × stock-de-cada-sede (~144.000 filas) antes de elegir la página | ~300.000 bloques por llamada | arreglado |
| 3 | `fn_productos` es PL/pgSQL con filtros opcionales: **desde la 6ª llamada en la misma conexión** Postgres pasa a un plan genérico que no puede descartar ramas. PostgREST reutiliza conexiones: casi todas las llamadas iban por ahí | 70 ms → 800 ms (la de producción: 650–1.300 ms siempre) | arreglado |
| 4 | Historial ▸ ventas de una prenda y ficha de clienta sin índice (`venta_items.variante_id`, `ventas.cliente_id`) | 555.790 → 624 bloques; 2.591 → 3 | arreglado |
| 5 | `registrar_cambio` bloqueaba el stock en el orden en que llegan las prendas; una venta de las mismas dos las bloquea por id → **bloqueo mutuo reproducido** con dos sesiones (`deadlock detected` dentro de `registrar_cambio`) | uno de los dos se cancela | arreglado |
| 6 | 37 políticas de 31 tablas (todo el catálogo) evaluaban `auth.role()` fila por fila | dentro del ruido | arreglado (higiene) |
| 7 | **Vender descarga el catálogo entero** (todas las variantes con foto, talla, color y códigos) y **`fn_stock_por_sede_json`** (todas las prendas × todas las sedes) en cada apertura; también Apartados, Cambios y Existencias | con 24.000 variantes: ~1 s y 6 MB el catálogo; 3,9 s y 19 MB el stock de la red | **decisión pendiente** |
| 8 | `fn_resumen_variantes` (Inventario ▸ Resumen) recalcula todo el catálogo por todas las sedes desde el libro de movimientos y devuelve todo de una vez | 9,8 s y 29 MB con un año: la pantalla falla (límite de 8 s) | **decisión pendiente** |
| 9 | Producción corre en el cómputo más chico de Supabase (256 MB de `shared_buffers`, 60 conexiones, 1 proceso paralelo); el Docker local tiene 10 núcleos | la capacidad real en producción es varias veces menor que la medida aquí | **decisión pendiente** |

Lo que ya estaba bien y se confirmó con 50 a la vez: **ninguna venta de más ni stock negativo** (la prenda más vendida se
agotó y las ventas siguientes se rechazaron con «Stock insuficiente»), ningún bloqueo mutuo entre ventas, el candado de
cada venta es por prenda y sede (dos cajas de la misma tienda no se esperan si venden prendas distintas),
`fn_vencer_separaciones` usa `skip locked` (no traba), `cerrar_conteo` y `crear_devolucion` ya bloquean en orden, y
las funciones de permiso (`fn_es_lider`, `fn_ubicacion_actual_persona`) tardan 0,3 ms en caliente.

## Decisión (lo arreglado, migración `20260924180000`)

1. **`fn_ventas_del_dia`**: «hoy» como rango de `created_at` (usa `ventas_ubicacion_fecha_idx`) y quién pregunta en una
   CTE `materialized`. Mismo resultado (md5) como líder y como integrante; trabajo de la integrante: 24 %.
2. **`fn_productos`**: cifras por producto agrupadas una vez; sin filtro de stock, la página se elige primero y las cifras
   se calculan solo para esos productos; `plan_cache_mode = force_custom_plan`. Mismo resultado (md5) en 10
   combinaciones de filtros × 2 perfiles; 2–6 % del trabajo.
3. **`registrar_cambio`**: `fn_bloquear_en_orden(ubicación, [devuelta, nueva])` tras leer la caja, igual que
   `registrar_venta`. Parche sobre la definición viva (el patrón de ADR-0188/0190), con ancla única y marca: re-pegable.
4. **Políticas**: `auth.role()/uid()/jwt()` → `(select …)`, una vez por consulta.
5. **Índices** `venta_items(variante_id)` y `ventas(cliente_id) where cliente_id is not null`.

**Regla nueva:** una función PL/pgSQL de lectura con filtros opcionales (`p_x is null or …`) que se llama muchas veces
desde la web lleva `set plan_cache_mode = force_custom_plan`; y una CTE que calcula quién pregunta (`fn_es_lider()`…)
va `as materialized`. Se comprobó que `fn_movimientos`, `fn_totales_historial_ventas`, `fn_resumen_caja`,
`buscar_clienta` y `fn_conteos_resumen` no se degradan tras la 5ª llamada.

## Resultado (antes → después, misma sesión, intercalado)

| A la vez | Operaciones por segundo | «Ventas de hoy» p50 | Existencias p95 | Pasaron los 8 s |
|---|---|---|---|---|
| 15 | 23 → 141 | 3,0 s → 0,2 s | 3,1 s → 0,5 s | 0 → 0 |
| 30 | 23 → 115 | 6,4 s → 0,6 s | 4,3 s → 0,9 s | 3 → 0 |
| 50 | 26–28 → 110 | 8,0 s → 1,1 s | 8,1 s → 1,7 s | 209 → 0 |

Cobrar (p50) quedó entre 20 y 74 ms. «Ventas de hoy» sube de corrida en corrida porque la prueba acumula miles de
ventas «de hoy» por tienda (un día real tiene ~60): es un techo, no el caso normal. Las ventas rechazadas en las últimas
corridas son «Stock insuficiente» de las prendas más vendidas, ya agotadas: el comportamiento correcto.

## Alternativas descartadas

- **Medir en producción o en una rama de Supabase.** Producción: escribiría ventas falsas y frenaría las tiendas (Felipe
  eligió local). Una rama cuesta por hora y, vacía como producción, tampoco tendría el volumen.
- **Índice trigram para la búsqueda de Existencias.** `fn_productos_buscar` compara con `ilike '%texto%'` en seis
  columnas unidas por OR y joins: un índice no la cubre sin reescribirla; hoy son ~130 ms con 24.000 variantes y ya no
  genera tiempos agotados. Principio 5.
- **Pasar `fn_productos` a SQL dinámico (`return query execute`)** para evitar el plan genérico: mismo efecto que
  `plan_cache_mode`, pero más código y sin el control de tipos del cuerpo.

## Lo que queda (pendiente, en BACKLOG)

1. **Decisión de Felipe — cómo Vender conoce el catálogo y el stock de la red** (#7). Hoy escala con el tamaño del
   catálogo, no con las personas. Con ~1.300 variantes es invisible; con ~5.000 el catálogo ya no entra en la caché de
   Vercel (lo dice `lib/catalogo-v2.ts`) y cada apertura lo lee entero. Opciones: guardarlo en el navegador y pedir solo
   lo que cambió (`fn_catalogo_version` ya existe), o buscar en la base mientras se escribe/escanea; y el «¿dónde más
   hay?» pedirlo por prenda al mirarla, no la red entera. Toca Vender, Apartados, Cambios y Existencias: más de un módulo.
2. **Decisión de Felipe — Inventario ▸ Resumen** (#8): paginarlo o precalcularlo (una tabla que se actualiza con cada
   movimiento). Hoy falla con un año de datos de 24.000 variantes; con el catálogo real (~1.300) tarda ~0,5 s.
3. **Decisión de Felipe — tamaño del cómputo de producción** (#9): con 50 personas a la vez y el catálogo creciendo, el
   plan más chico se queda corto antes que el código. Subirlo es cambiar el plan de Supabase (dinero).
4. **Local compartido desalineado**: las 45 funciones que difieren de producción siguen así en la base `postgres` del
   local (el arreglo —aplicar las definiciones de producción— necesita el OK de Felipe: la usan otras sesiones). Mientras
   tanto, 44 de los 70 fallos de las pruebas SQL en local son esta deriva, no bugs (ver BITACORA 2026-09-24).
5. **Producción casi vacía**: 3 productos, 12 variantes, 0 ventas; `pg_stat_statements` muestra
   `delete from ventas where id::text like $1` (5 llamadas, 35.000 filas). Parece una limpieza de datos de prueba de otra
   sesión; no está en BACKLOG ni en BITACORA. Confirmar con Felipe.

## Cómo se verificó

- `pnpm pruebas:lecturas-rapidas-y-cambio` → **17/17** en una copia de producción con la migración; en la copia SIN la
  migración fallan justo los 4 casos que corrige (entre ellos el bloqueo mutuo cambio × venta, reproducido).
- La migración se pegó dos veces sobre una copia igual a producción: la segunda no cambia nada; una sola firma por
  función; permisos intactos.
- `pnpm carga:preparar` + `pnpm carga:correr 15 30 50` para repetir la prueba (ver `scripts/carga/carga.mjs`).
- Web: 24.363 pruebas en verde (no cambia).
