# ADR-0606 · Ventas ▸ Reportes: «Ventas del mes» y «Ranking de prendas»

- **Fecha:** 2026-11-03 · **Estado:** construido y probado en local (pruebas de reglas, 46 + 28 casos de Postgres con datos inventados, recorrido de las guías en escritorio y a 375 px, claro y oscuro). Las cinco migraciones `20261103224000` a `20261103235000` **se pegaron en producción el 2026-11-03** con el OK de Felipe, en orden, y se verificaron leyendo la base (existen, son INVOKER y estables, `anon` no ejecuta, el módulo no está en ningún rol).
- **Decide:** Felipe, 2026-11-02/03: «al sistema le falta reportes, como reporte de venta mensual y ranking de prendas que más se venden, con sus filtros». Maqueta aprobada (`docs/maquetas/reportes-ventas-2026-11/`) y lugar elegido: «Apliquemos el reporte de ventas dentro del módulo de ventas». Lista de 7 actividades aprobada («Lo apruebo»).
- **Toca:** ADR-0230 (Historial conectado: el CSV), ADR-0358 (una función, una pieza), ADR-0306 (un módulo es una entrada del menú), ADR-0377 (familias fuera de los motores), ADR-0389 (guías).

## El problema primero

Para saber «cuánto vendimos en octubre contra septiembre» o «qué prendas salen más» había que armarlo a mano: el Historial mira un rango pero no compara, no corta por tienda ni por categoría
y no habla de modelos; Análisis ▸ Qué pedir mira solo hasta 30 días y es una pregunta de inventario; Finanzas es dinero para el contador. El dueño no tenía UN lugar donde ver cómo va el negocio.

## Qué se decidió

| Pieza | Decisión | Dónde |
|---|---|---|
| Lugar y permiso | Séptima entrada de Ventas (excepción nueva al tope de 6, por elección de Felipe) y **módulo propio `reportes_ventas`, delegable, que nace solo para el líder**. Quien lo tiene en su rol ve solo su tienda (lo decide la RLS, no la pantalla). | `20261103224000_reportes_ventas_modulo.sql`, `lib/modulos.ts`, `lib/menu.ts`, `layout.tsx` con `exigirModulo` |
| Qué cuenta como venta | `estado = 'completada'`, sin pruebas, días de Lima. «Vendido» = suma de `venta_items.subtotal`; «devuelto» = reembolso de devoluciones aprobadas, en el día de su aprobación. | las cuatro funciones `fn_reporte_ventas_*` |
| Comparación | El tramo (mes entero, o hasta hoy si está en curso) contra **los mismos días** del mes anterior. Si la primera venta real (2026-09-30) cae dentro del período anterior, **no se compara** y la pantalla lo dice. | `fn_reporte_ventas_mes`, `comparacionDe` |
| Ventas del mes | Cinco cifras, ventas por día contra el promedio del mes pasado, mes a mes (ventana de 12, solo meses con ventas), cómo se pagó, y la tabla cortada por tienda o por categoría. | `fn_reporte_ventas_mes/series/cortes`, `components/reportes-ventas/*` |
| Ranking de prendas | Cara A (tabla), por modelo o por color y talla, por prendas o por soles; filtros de fechas, tienda, categoría, marca, talla, color y búsqueda; comparación, stock que queda y panel de tallas y colores con los mismos filtros. | `fn_reporte_ventas_ranking`, `lib/reportes-ranking*.ts` |
| Categoría de una línea | La del catálogo; si falta, la declarada en caja (`prendas_por_regularizar`), la misma regla del Observatorio. Sin esto, el 38 % de octubre caía en «Sin categoría». | cortes y ranking |
| Descarga | CSV con BOM, coma y punto decimal (el formato del Historial). Ventas del mes baja el corte que se mira; el Ranking baja **todas** las filas filtradas, de a 50, hasta 1.000 (si pasa, 413 y se pide un filtro). Sin costo ni margen. | `reportes/descargar`, `reportes/ranking/descargar`, `lib/reportes-ventas-exportar-reglas.ts` |
| Guías | Una guía interactiva por pantalla (12 y 14 pasos), que solo explica. La guía de foco es `no-aplica`: son reportes de solo lectura, sin formulario. | `lib/guias/pantallas/reportes-ventas.ts` |

## Lo que se descartó

- **«Por vendedor».** Las personas se quedan en Rendimiento (Felipe, 2026-11-03).
- **La vitrina del ranking (cara B).** Solo la tabla.
- **«Vs el año pasado».** Aparece cuando exista ese mes; hoy el ERP vende desde 2026-09-30.
- **Las ventas de la tienda web.** Todavía no están en `retail.ventas`: la versión 1 es de tiendas.
- **`security definer` / `set search_path` en las funciones de lectura.** Las hace ~100 veces más lentas por llamada (lección de Tráfico); son INVOKER y las filtra la RLS.
- **Un archivo cortado «que parece completo».** Peor que ninguno: sobre el tope se niega.

## Lo que nunca debe existir (y quién lo impide)

- **Un ranking que no cuadre con las cifras.** Ranking + «sin registrar» + lo que está fuera de los motores (las bolsas) = cifras de Ventas del mes: lo exigen las pruebas de Postgres, se comprobó en el banco (S/ 410.253 + 9.043 = 419.296, datos inventados) y en producción, leyendo un mes real, en prendas y en soles.
- **Un reporte que vea lo que el rol no ve.** Cada función pregunta `fn_ve_modulo('reportes_ventas')` (42501) y es INVOKER; el `route.ts` de descarga repite la pregunta porque no pasa por el `layout.tsx`.
- **Una tienda ajena por URL.** `alcanceDeReportes` ignora una tienda que la cuenta no puede elegir, igual en pantalla y en descarga.
- **Una familia fuera de los motores contada como mercadería.** El ranking pregunta `fn_categoria_entra_a_motores`; la bolsa sí cuenta en las cifras de dinero (ADR-0377).

## Quedó abierto

- **Darle el módulo a un rol** desde Roles y accesos: hoy solo lo ve el líder.
- **Rendimiento:** Felipe siente que «estorba». La recomendación fue retirarlo del menú conservando las reglas de metas; la decisión sigue abierta y es aparte.
- **`/formidable` con colaboradoras reales** y comparación contra el año anterior, cuando haya datos.
