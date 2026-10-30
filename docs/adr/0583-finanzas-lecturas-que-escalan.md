# ADR-0583 · Finanzas: lecturas que escalan (medir, quitar el trabajo de más y no esperar en fila)

- **Fecha:** 2026-10-30 · **Estado:** construido y probado contra Postgres local (las 984 migraciones con fecha + la siembra; 34 suites de base en
  verde y una nueva). **La migración `20261030170000` NO está pegada en producción:** espera el OK de Felipe (cambia dos funciones que leen 31
  pantallas de varios módulos). La web funciona igual con o sin ella.
- **Decide:** Felipe, 2026-10-30: «el módulo de finanzas está siendo lento… si ahora está lento con poca información, cuando exista mucho más
  será muchísimo más lento, tiene que ser escalable».
- **Toca:** ADR-0198 (diario y cierre de mes), ADR-0433 act. 9 (mes cerrado se queda cerrado), ADR-0560 (CLAURE fuera de las cifras), ADR-0149
  (loader), principio 12 (causa raíz).
- **Número:** la reserva por etiqueta (`pnpm reservar`) no se pudo empujar desde esta sesión (el remoto respondió 403 a la etiqueta); se usó el
  siguiente libre después de `reserva/adr-0582` y `reserva/migracion-20261030151000`.

## El problema primero (medido, no supuesto)

En producción, solo lectura, el 2026-10-30: `pg_stat_statements` y cronómetro dentro de transacciones que se deshicieron, como líder.

| Lectura | Promedio | Máximo | Qué hay adentro |
|---|---|---|---|
| `fn_resumen_finanzas` (Resumen) | 2.274 ms | 7.055 ms | 13 secciones en serie: presupuesto 671, resultados del mes 410, flujo 214, campañas 143… |
| `fn_flujo_caja_proyeccion` | 695 ms | 3.813 ms | — |
| `fn_estado_resultados` | 686 ms | 4.541 ms | el diario vivo del mes (`fn_asientos`, 8.771 líneas): 240 ms |
| `fn_planilla_provision` | 524 ms | 4.439 ms | — |
| `fn_rendimiento_serie` (por tienda) | 508 ms | 2.620 ms | `fn_item_es_de_claure` por línea: 238–335 ms |
| `fn_finanzas_confianza` | 492 ms | 5.686 ms | `fn_costo_estimado_resumen`: 612 ms, casi todo `fn_item_es_de_claure` |

Y eso con **un solo mes de datos** (Finanzas cuenta desde el 2026-10-01: 1.526 ventas, 7.444 movimientos). Tres causas, de mayor a menor:

1. **Una pregunta por línea que hacía el trabajo caro primero.** `fn_item_es_de_claure(línea, sede, fecha)` se evalúa una vez por cada línea de
   venta en 31 funciones (Rendimiento, el medidor de confianza, el Observatorio, Análisis, el Plan de compra, la demanda, Frescura…). Su `exists`
   dejaba al planificador buscar el dueño de la línea (`fn_dueno_de_la_linea`) antes de mirar si la sede es de CLAURE: en TRU y AQP, donde la
   respuesta siempre es «no», costaba ~200 µs por línea. Crece con cada venta, en cada pantalla que la usa.
2. **Cerrar un mes no ahorraba nada.** `fn_diario` rearmaba el diario vivo de TODO el rango y después tiraba lo de los meses cerrados. El Balance
   (`fn_bal_diario`, desde el arranque hasta hoy) recorrería la historia completa en cada lectura: hoy 240 ms por mes, en un año 12 veces eso.
3. **Esperas en fila en la web.** El Resumen esperaba los 2,3 s de `fn_resumen_finanzas` y RECIÉN entonces pedía los sueldos estimados y la línea
   de ventas de cada tienda (dos esperas más, una detrás de otra). Gastos hacía tres rondas de consultas donde bastaban dos; Cuentas y dinero
   esperaba la lista de sedes antes de pedir saldos que no la necesitan.

## Qué se decidió

**En la base (migración `20261030170000`, solo `create or replace function`; sin tablas, políticas ni permisos):**

1. `fn_item_es_de_claure` pregunta lo barato primero con un `CASE` (Postgres garantiza su orden): ¿la sede es de CLAURE y la venta es de desde su
   arranque? Solo si lo es, la misma pregunta de siempre con el dueño de la línea. Medido en producción con la versión nueva en `pg_temp`:
   TRU 335 → 57 ms, AQP 201 → 33 ms, LIM igual (ahí sí hay que preguntar el dueño); `fn_costo_estimado_resumen` 549 → 118 ms;
   `fn_rendimiento_serie` de TRU 813 → 551 ms. Arregla a la vez las 31 lecturas, sin tocarlas.
2. `fn_diario` calcula el primer mes del rango que NO está cerrado entero para lo que se mira (la empresa y cada ubicación del alcance, activa o
   no) y llama a `fn_asientos` solo desde ahí. Un mes cerrado entero cuesta lo que cuesta leer `diario_cerrado` por índice. Es exacto porque el
   diario es aditivo por mes: `cerrar_periodo` congela justamente `fn_asientos(inicio del mes, fin del mes)`.

**En la web (sin migración):**

3. Resumen: los sueldos estimados se piden a la vez que el resumen (`lib/resumen-finanzas.ts`), y la línea de ventas también, con las tiendas
   adivinadas de la URL (`tiendasAdivinadas`); si la base resolvió otras (`mismasTiendas` falla), se piden de nuevo. Nunca se muestra una serie de
   otras tiendas: la apuesta solo se usa si coincide exacta.
4. Gastos: la tercera ronda (fijos de todas las sedes, fijos de hoy, parámetros) entra en la segunda; los fijos del mes se piden una sola vez.
5. Cuentas y dinero: la lista de sedes y los saldos se leen a la vez (`getContextoDinero`).

## Lo que se descartó

- **Guardar las respuestas en caché (Next o Redis) unos segundos.** Son cifras de dinero que dependen de quién mira (`fn_es_lider`, la sede): una
  llave mal armada mostraría la plata de una sede a otra, y un número viejo justo después de registrar un gasto rompe la confianza. Primero se
  quita el trabajo de más; la caché, si hace falta, después y con invalidación explícita.
- **Correr las 13 secciones de `fn_resumen_finanzas` en paralelo desde la web.** Bajaría la espera, pero cada sección sería una conexión más y el
  usuario de la tienda tiene tope de conexiones (ADR-0450). Antes conviene que cada sección sea barata (lo que sigue).
- **Reescribir `fn_asientos`.** Es el corazón contable (principio 1); se tocó solo lo que la rodea.

## Lo que sigue (ordenado por impacto; cada uno pide su OK)

1. **El diario del mes en curso se calcula 3–4 veces por cada carga del Resumen**: en `resultados_mes`, otra vez dentro de `fn_presupuesto_vs_real`
   (671 ms, el bloque más caro), y otra en la página (`getEstadoResultados`). Y la proyección de caja, dos veces (dentro del resumen y en
   `getFlujoProximo`). Propuesta: que `fn_presupuesto_vs_real` reciba el Estado de resultados ya calculado (una función interna que lo acepte) y que
   la página use el flujo que ya trae el resumen cuando mira CAYLA entera.
2. **Cerrar los meses.** Desde esta migración un mes cerrado no cuesta nada en el Balance ni en los reportes de varios meses; abierto, sí.
3. **El diario persistido** (la solución de fondo para el volumen que viene): escribir cada asiento al registrarse la operación, en una tabla con
   índice por fecha, en vez de reconstruirlo desde 15 tablas en cada lectura. Es un cambio del núcleo contable y de varios módulos: decisión de
   Felipe, con su propio ADR.
4. `fn_rendimiento_serie` sigue en ~550 ms por tienda: el reparto de metas del mes entero (`fn_metas_por_dia` → `fn_reparto_meta`) es lo que queda.

## Cómo se verifica

- `pnpm pruebas:finanzas-lecturas-que-escalan` (nueva, 13 casos): el diario nuevo es el de antes fila por fila (mes cerrado, rango que cruza un mes
  cerrado y uno abierto, CAYLA entera cerrada a medias y entera, tras una deriva), y con el rango cerrado entero el diario vivo **ni se llama** (se
  reemplaza `fn_asientos` por una que falla); `fn_item_es_de_claure` es la de antes en cada línea × sede × fecha, con CLAURE activa, inactiva y sin
  arranque.
- Las suites de siempre, con la migración aplicada: Balance (69), cierre de mes (124), Estado de resultados (86), resumen de Finanzas (68),
  presupuesto (78), flujo (82), confianza (20), mes cerrado (22), alcance (32), impuestos, observatorio, rendimiento y las 18 de CLAURE.
- En producción, antes de pegar: el mismo resultado fila por fila del diario nuevo contra el actual (EXCEPT ALL en los dos sentidos = 0) para
  CAYLA entera y para una sede.
- Después de pegar: `pg_stat_statements` de `fn_resumen_finanzas`, `fn_finanzas_confianza`, `fn_rendimiento_serie` y `fn_observatorio`; el promedio
  debe bajar (ver la tabla de arriba).
