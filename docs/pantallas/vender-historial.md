# Pantalla — Historial de ventas (`/vender/historial`) — TRABAJO EN CURSO

> Modo: completo (**incompleto: falta el SQL de producción, los puntajes y las 12 tareas**) · Fecha: 2026-09-21 · Rol/sede: líder, vista «Todas las tiendas» (el encabezado global mostraba «Tienda TRU») · Datos: capturas reales + código; **sin SQL de producción todavía**
> SHA analizado: `553c0ff7` (origin/main, 2026-09-21) — si `page.tsx`, `lib/ventas-historial*.ts` o los componentes `HistorialVentas*`/`FiltrosHistorialVentas` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/vender/historial/page.tsx` · `components/FiltrosHistorialVentas.tsx` · `components/HistorialVentasLista.tsx` · `components/HistorialVentasPulso.tsx` · `components/Paginacion.tsx` (`PaginacionCursor`) · `components/DetalleVentaModal.tsx` · `lib/ventas-historial.ts` · `lib/ventas-historial-reglas.ts` · `lib/comprobantes-reglas.ts` · tablas `ventas`, `venta_items`, `venta_pagos`, `comprobantes`, `productos`, `variantes`, `producto_fotos` · RPC `fn_nombres_personas`
> Otra sesión tocándola: no como tarea propia. La rama `claude/colaboradores-rediseno` toca una línea de `vender/historial/page.tsx` (el filtro de vendedor). Rediseños vecinos en vuelo: Caja, Facturación (ADR-0124).

## Cómo continuar este trabajo en otra cuenta

Este archivo es el traspaso. En la otra cuenta: abrir el repo en la rama `claude/auditoria-pantalla-historial-cc906a` y pedir «continúa `/pantalla` sobre `docs/pantallas/vender-historial.md`». Pasos que faltan, en orden:

1. **Felipe corre el SQL de la sección 4 en producción** (SQL Editor del proyecto cayla-dynamic) y pega los resultados. Si prefiere seguir sin datos reales, decir «sin SQL»: se marca todo lo que quede sin verificar.
2. Clasificar cada resultado como **hueco** o **está bien**, con evidencia.
3. Puntuar las 6 dimensiones (0–10), calcular «Cumple su finalidad» y «Relevancia».
4. Escribir las 12 tareas (una debe ser «Replantear», si aplica la estrategia alternativa), con dónde / por qué / cómo se verifica / esfuerzo.
5. Completar «Líneas propuestas para BACKLOG.md» (Felipe aprueba antes de anexarlas; **no editar `docs/BACKLOG.md` sin su OK**).
6. Regla madre de la skill: solo analizar y proponer, no tocar código, BACKLOG ni migraciones.

Antes de continuar: `git fetch origin` y comparar los archivos de la pantalla contra `553c0ff7` (`git diff --stat 553c0ff7 origin/main -- apps/web/lib/ventas-historial* apps/web/components/HistorialVentas* apps/web/components/FiltrosHistorialVentas.tsx`) para saber si el análisis venció. Las tres capturas originales no viajan en el repo; las describe la sección 2.

## 1 · Finalidad declarada
"Esta pantalla existe para ser el libro de todas las ventas registradas —de cualquier fecha y de todas las tiendas— donde se encuentra una venta concreta, se mide el pulso de un período y se llega al detalle; es de solo lectura: una venta se corrige con el proceso (anular, cambio, devolución), nunca tocando la fila."
Fuente: `docs/adr/0147-historial-de-ventas-en-ventas-sin-funcion-nueva.md` y `docs/BACKLOG.md` (sección «Historial de ventas»), no la captura. Coinciden docs y pantalla en lo esencial. Diferencia: el comentario de cabecera de `page.tsx:22-25` dice que Cambios y Devoluciones «eligen una prenda para actuar», pero desde el historial no hay camino directo a ellos (ver H6).
Nota: `docs/datos/modulos/07-ventas-y-caja.md` avisa que describe V1 (revisión 2026-09-12); no se cita como vigente. Mandan el código y el volcado de producción.

## 2 · Capturas analizadas (3; sin datos personales en este archivo)
1. Vista completa arriba: cabecera «Historial», tarjeta S/ 5,487.10 · 17 ventas, chips 7/30/90 días/Personalizado (30 activo), botón Filtros, línea de tiempo (Hoy, Sábado 19…), panel lateral «Ventas por día».
2. Parte baja: ventas del 14–16 de setiembre con «BLU-001», «CHO-001» como título y cuadros de foto vacíos; pie «Registro transparente»; el panel lateral se queda fijo.
3. Barra de filtros abierta (Todas las tiendas / Todos los vendedores / Todos los pagos / Todas las ventas / Con o sin comprobante) con el desplegable de comprobante tapando el chip de una fila.

## 3 · Hallazgos preliminares (sin puntuar todavía)

Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` · `[inferido]` · `[no verificable]`.

### Lo más grave (posible daño a dinero o a la lectura correcta de cifras)

**H1 · El tope de 1000 ventas puede no avisar nunca.** `[código ventas-historial.ts:138,146]` pide `limit(1001)` y marca `parcial = crudas.length > 1000`. `[código supabase/config.toml:21]` fija `max_rows = 1000` en local: PostgREST devolvería como máximo 1000 filas y `parcial` jamás sería verdadero, con lo que los totales saldrían truncados en silencio, justo lo que el comentario de `ventas-historial-reglas.ts:23-24` dice evitar. `[no verificable]` el `max_rows` de producción: lo resuelve la consulta E1. Hoy no molesta (17 ventas) `[visto]`.

**H2 · El chip «PENDIENTE DE ENVIAR» aparece en las 17 boletas, incluso en las del 14 de setiembre.** `[visto]` Origen: `ESTADO_ETIQUETA.pendiente` `[código comprobantes-reglas.ts:99-106]`: comprobante con serie y número asignados que aún no se transmitió a SUNAT. El proveedor es Lucode/apisunat, no Nubefact `[código lib/lucode.ts:1-25]`. La fila no distingue «recién emitido» de «lleva días sin enviar», y `pendiente` y `enviado` se pintan igual (ámbar, `HistorialVentasLista.tsx:37-38`). Dos lecturas posibles: (a) alarma real —S/ 5,487 sin transmitir a SUNAT—; (b) el envío aún no está conectado y el chip es ruido. `[no verificable]` cuál; la consulta E2 lo dice. Es el punto de mayor consecuencia fiscal de la pantalla.

**H3 · El título de la venta muestra el código, no el nombre.** `[visto]` «BLU-001», «CHO-001». `[código ventas-historial.ts:44, ventas-historial-reglas.ts:149]` toma `productos.referencia`. La columna `productos.descripcion` (`0002_esquema.sql:38`) no está en el `select`. El comentario de `ventas-historial-reglas.ts:158` promete nombres tipo «Blusa Emma». El modal de detalle tiene el mismo problema (`venta-detalle-reglas.ts:77`). Las ventas nuevas sí muestran «Casaca Emilia» `[visto]`: puede ser que `referencia` sea el nombre en unos productos y el código en otros; E5 lo cuenta.

### Contexto y cifras

**H4 · El encabezado global dice «TIENDA TRU» y la página «TODAS LAS TIENDAS».** `[visto]` `page.tsx:47-51` calcula el alcance por su cuenta y no usa el selector global. Un líder no sabe si mira una sede o todas.

**H5 · «Por día» divide entre los días del rango, no entre los días con venta.** `[visto + cálculo]` 5,487.10 ÷ 30 = 182.90 (la cifra mostrada); las ventas empiezan el 14 de setiembre (~8 días), así que el promedio por día vendido ronda S/ 686 y el gráfico queda casi plano. `[código HistorialVentasPulso.tsx:145]` `resumen.total / max(1, dias.length)`. Además el divisor cambia sin aviso: pasa a «solo días con venta» si el rango supera 400 días y a semanas por encima de 120 (`ventas-historial-reglas.ts:300`, `Pulso.tsx:54`). Decisión de negocio de Felipe: cuál divisor es el correcto.

**H6 · No hay camino desde una venta hacia Cambio, Devolución, Facturación o Caja.** `[código DetalleVentaModal.tsx:157-172]` la única acción real es imprimir ticket/A4. Tampoco hay exportar. El escenario «clienta que devuelve a los 8 días» obliga a salir de la pantalla y buscar la prenda otra vez en Cambios/Devoluciones.

**H7 · No hay búsqueda** por boleta, clienta o prenda. `[visto]` y el ADR-0147 lo admite (`buscarVentas` existe en `ventas-v2.ts`, hoy interna). Con volumen, la colaboradora recorre día por día.

**H8 · El total de la venta y «Cómo se pagó» salen de tablas distintas.** `[código ventas-historial.ts:49-51]` total de `venta_items.subtotal`, pagos de `venta_pagos.monto`. En las capturas suman exacto (3,059.80 + 1,542.30 + 367.00 + 300.00 + 218.00 = 5,487.10 `[visto]`), pero si el vuelto o un pago se guardaran de otra forma las cifras dejarían de cuadrar. E4 lo verifica.

### Rendimiento, seguridad y pruebas

**H9 · `ventas` no tiene índices por `created_at`, `ubicacion_id` ni `usuario_id`** `[código migraciones]` (solo `venta_items(venta_id)`, `venta_pagos(venta_id)`, `comprobantes(venta_id, ubicacion_id, estado)`), con RLS que evalúa `fn_puede_operar_ubicacion` por fila. Aceptable a 17 ventas; con volumen habría que indexar. Necesita número: B1/B2 dan el ritmo real y A3 confirma los índices de producción.

**H10 · Pruebas: solo unitarias** `[código lib/ventas-historial-reglas.test.ts]`, sobre funciones puras. Sin prueba del tope ni del cursor con datos, ni de los componentes, ni e2e. El BACKLOG dice que falta «verlo con clics reales» (líder e integrante, una anulada de verdad).

**H11 · RLS y permisos.** `[código 0004_rls.sql:103, 0003_funciones.sql:54]` `ventas_select` usa `fn_puede_operar_ubicacion` (líder ve todo, integrante solo su tienda). `venta_items`/`venta_pagos` heredan con `exists`. `comprobantes_select` = líder o quien opera la ubicación. No hay política de UPDATE/DELETE en `ventas`; `anular_venta` (RPC) cambia el estado. `[no verificable]` en producción hasta correr D1/D3.

### Estética y accesibilidad
- Chips de período de 10 px con `py-1` (~24 px de alto) y desplegables `h-9` (36 px): por debajo de 44 px táctiles para tablet de mostrador. `[código FiltrosHistorialVentas.tsx:21]`
- `--color-rojo` aparece en hover y foco de muchas piezas; su comentario dice «máx. 2 por pantalla» (`globals.css:17`). `[inferido]` no medido.
- Texto de 10–11 px en `tinta/50–60` (pie del gráfico, metadatos, nota «Registro transparente» `page.tsx:126`): contraste probablemente bajo frente a ADR-0012. `[no verificable]` sin medir.
- El gráfico solo responde a `onPointerMove` (sin teclado) y el bloque del día va `aria-hidden` (`Pulso.tsx:82`); `PaginacionCursor` sin `<nav>`/`aria-label`.
- Botón invisible `absolute inset-0` cubre la fila: no hay pista visual de que se abre un detalle `[visto: sin chevron]`.
- Botón «Filtros» esconde la barra un clic más; con filtros activos abre solo (`FiltrosHistorialVentas.tsx:66-67`).

### Lo que está bien y no se toca
- Línea de tiempo por día y hoja de papel por día, coherente con Cambios, Devoluciones y Caja. `[visto]`
- El total de cada día viene de todo el rango, no de la página. `[ADR-0147 + código Lista.tsx:77-83]`
- Cursor `(created_at, id)`, estable con empates, sin `count` aparte. `[código ventas-historial.ts:107,109]`
- Días de Lima: intervalo `[desde, hasta+1)` con `-05:00` y agrupación con `Intl` en `America/Lima`. `[código reglas.ts:89,219-223]`
- Lista y totales comparten la misma consulta base (`consulta()`); sin N+1: una consulta grande de lista, una de totales y un RPC por lote de vendedores.
- Solo lectura y «una venta no se borra»; la anulada sigue tachada y no suma. `[ADR-0147 + reglas.ts:256-259]`
- Filtro por pago con alias `pago_filtro!inner` (no recorta las líneas de pago mostradas) y nota de crédito que no cuenta como comprobante de la venta.
- Accesibilidad ya resuelta: `aria-pressed` en períodos, `aria-expanded`/`aria-controls` en Filtros, `aria-label` por fila, `role="img"` con resumen en el SVG, foco visible.

## 4 · Consulta SQL para producción (solo lectura, sin datos personales)

Pegar en el SQL Editor del proyecto cayla-dynamic (schema `retail`), un bloque a la vez, y pegar de vuelta el resultado. Si una columna falla, A1 da los nombres reales.

```sql
-- A1. Columnas
select table_name, ordinal_position, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'retail'
  and table_name in ('ventas','venta_items','venta_pagos','comprobantes','productos','producto_fotos')
order by table_name, ordinal_position;

-- A3. Índices
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'retail' and tablename in ('ventas','venta_items','venta_pagos','comprobantes')
order by 1, 2;

-- B1. Volumen y ritmo
select 'ventas' as tabla, count(*) as filas,
       count(*) filter (where created_at > now() - interval '30 days') as ultimos_30_dias,
       min(created_at) as primera, max(created_at) as ultima
from retail.ventas
union all select 'comprobantes', count(*), count(*) filter (where created_at > now() - interval '30 days'), min(created_at), max(created_at) from retail.comprobantes;

-- B2. Ventas por día (hora de Lima) y sede, últimos 30 días
select (v.created_at at time zone 'America/Lima')::date as dia, u.nombre as sede, count(*) as ventas
from retail.ventas v join retail.ubicaciones u on u.id = v.ubicacion_id
where v.created_at > now() - interval '30 days'
group by 1, 2 order by 1 desc, 2;

-- D1. Políticas RLS
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'retail' and tablename in ('ventas','venta_items','venta_pagos','comprobantes')
order by 1, 2;

-- D3. Funciones que toca la pantalla (firma y si son security definer)
select p.proname, pg_get_function_identity_arguments(p.oid) as firma, p.prosecdef, p.proconfig
from pg_proc p
where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('fn_nombres_personas','fn_puede_operar_ubicacion','fn_es_lider','anular_venta')
order by 1, 2;

-- E1. ¿Cuál es el tope de filas que devuelve la API? (si es 1000, el aviso de "acota el rango" nunca salta)
select rolname, rolconfig from pg_roles where rolname = 'authenticator';

-- E2. Estado real de los comprobantes, y cuántos llevan días "pendiente"
select estado, tipo, count(*) as n, min(created_at) as el_mas_viejo,
       count(*) filter (where created_at < now() - interval '1 day') as con_mas_de_1_dia
from retail.comprobantes
group by 1, 2 order by 3 desc;

-- E3. Ventas sin comprobante, sin vendedor, o anuladas
select count(*) filter (where not exists (select 1 from retail.comprobantes c where c.venta_id = v.id)) as sin_comprobante,
       count(*) filter (where v.usuario_id is null) as sin_vendedor,
       count(*) filter (where v.estado = 'anulada') as anuladas,
       count(*) as total
from retail.ventas v;

-- E4. ¿El total de la venta coincide con lo pagado? (debería salir vacío)
select v.id, v.created_at::date as dia,
       (select coalesce(sum(subtotal),0) from retail.venta_items i where i.venta_id = v.id) as por_items,
       (select coalesce(sum(monto),0)    from retail.venta_pagos p where p.venta_id = v.id) as por_pagos
from retail.ventas v
where (select coalesce(sum(subtotal),0) from retail.venta_items i where i.venta_id = v.id)
   <> (select coalesce(sum(monto),0)    from retail.venta_pagos p where p.venta_id = v.id)
order by v.created_at desc limit 20;

-- E5. Prendas vendidas: ¿el producto tiene descripción (nombre legible) y foto por color?
select count(*) as lineas_vendidas,
       count(*) filter (where pr.descripcion is null or pr.descripcion = '') as producto_sin_descripcion,
       count(*) filter (where not exists (
         select 1 from retail.producto_fotos f where f.producto_id = pr.id and f.color_codigo = va.color_codigo)) as sin_foto_del_color
from retail.venta_items vi
join retail.variantes va on va.id = vi.variante_id
join retail.productos pr on pr.id = va.producto_id;
```

## 5 · Tareas candidatas (borrador, sin ordenar ni puntuar)

No son las 12 finales: solo lo que ya salió del código y las capturas, para no perderlo. Se ordenan y se completan tras el SQL.

- Corregir el título de la venta: usar el nombre del producto (`descripcion`) con `referencia` como respaldo (H3).
- Corregir/verificar el aviso de tope de 1000 (`max_rows`); si no avisa, cambiar la detección o pasar a una RPC de agregados (H1). Requiere OK de Felipe si toca esquema.
- Aclarar el chip de comprobante: distinguir «pendiente hace X días» de «recién emitido» y `pendiente` de `enviado` (H2).
- Alinear el alcance de la pantalla con el selector global de tienda, o quitar la confusión de etiquetas (H4).
- Definir con Felipe el divisor de «Por día» y mostrar «por día vendido» cuando el ERP es joven (H5).
- Conectar cada venta con Cambio, Devolución y comprobante desde el detalle (H6).
- Búsqueda por boleta / clienta / prenda usando `buscarVentas` (H7).
- Cuadrar total de venta con pagos y decidir qué pasa con el vuelto (H8, según E4).
- Índices en `ventas` (`created_at, id`; `ubicacion_id`) cuando B1/B2 muestren volumen (H9).
- Pruebas de integración del tope y del cursor, y recorrido con clics reales (líder e integrante, con una anulada de verdad) (H10).
- Objetivos táctiles de 44 px, contraste de textos chicos y teclado en el gráfico (estética).
- Exportar a CSV para líder/contabilidad. `bajo valor / opcional` hasta que se pida.

## 6 · Estrategia alternativa (por evaluar)
Idea aún sin desarrollar, decide Felipe: en vez de un historial solo de lectura que obliga a salir para actuar, una pantalla de «ventas» con acciones en la fila (buscar → abrir → cambiar / devolver / reimprimir / ver comprobante). Ganas: una colaboradora resuelve una devolución sin cambiar de pantalla. Pagas: la unidad «venta» empieza a mezclarse con Cambios y Devoluciones, y se pierde la regla actual de «solo lectura». Completar con Ganas/Pagas reales tras el SQL.

## 7 · Fuera de esta pantalla (borrador)
Si H2 resulta real, **hay comprobantes sin transmitir a SUNAT desde el 14 de setiembre**. Es un tema fiscal de Facturación, no de esta pantalla: el historial solo lo deja a la vista.

## 8 · Líneas propuestas para BACKLOG.md
Pendientes de escribir cuando estén las 12 tareas finales. Formato: `- [ ] [pantalla:vender-historial] #n Título — esfuerzo`. Felipe aprueba antes de anexarlas.

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo (en curso, sin puntuar) | pendiente | pendiente | — (primer análisis) |
