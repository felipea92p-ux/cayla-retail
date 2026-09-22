# ADR-0150 — Datos de demostración: 90 días de historia sintética, cargados con un generador SQL desechable

## Traspaso a otra sesión o cuenta (léelo primero, actualizado 2026-09-22)

- **Rama:** `claude/inject-3-month-data-eae360`, ya subida a `origin` (antes solo vivía en un worktree local). `git fetch` y
  `git checkout claude/inject-3-month-data-eae360` para retomarla. Está **224 commits detrás de `main`** — normal para una
  rama de trabajo que no se ha fusionado; no hace falta ponerla al día para seguir escribiendo el generador, solo para el
  día en que se abra el PR final.
- **Estado real:** Fases 1-4 completas, ensayadas y comprometidas. Fase 5 (postventa/gastos/Taller):
  investigación terminada (7 agentes en paralelo + síntesis, ver abajo) y **5 de 8 piezas ya escritas y probadas**: 5.1
  (serie de Nota de Crédito), el parche a la Fase 4 (4.6b, selección de anulaciones), 5.2 (anulaciones completas), 5.3
  (cambios de talla, 172) y 5.9 (cierre financiero único de cajas, al final de la fase: lee las tablas reales, así que cubre
  las secciones que se escriban antes de él sin tocarlo). **Fase 6 (stock derivado) también escrita.** Faltan:
  devoluciones+NC, conteos, cuarentena, gastos+proformas y producción del Taller — todas se escriben ENTRE 5.3 y 5.9.
- **Las 7 recetas verificadas NO viven solo en este ADR** (aquí hay un resumen ejecutivo) — el detalle completo, palabra por
  palabra contra producción en vivo, está en dos archivos nuevos que hay que leer ANTES de escribir el resto de la Fase 5:
  - `docs/demo-90-dias/fase-5-recetas-verificadas.md` — las 7 recetas completas (devoluciones+NC, cambios, anulaciones,
    conteos+cuarentena, gastos+proformas, producción-infra, producción-órdenes) + la síntesis cruzada íntegra. Esto existía
    solo en el resultado de un `Workflow` (carpeta temporal de la sesión que lo corrió) — si no se hubiera volcado a un
    archivo del repo, se habría perdido al cerrar esa sesión.
  - `docs/demo-90-dias/fase-5-produccion-taller-verificado.md` — el esquema exacto (columnas/constraints) de las 10 tablas
    de Producción y el cuerpo verbatim de sus 8 RPC reales (`abrir_produccion`, `registrar_comprobante_produccion`,
    `recibir_comprobante_produccion`, `cerrar_produccion`, `registrar_consumo_insumo`,
    `fn_recalcular_costo_insumos_produccion`, `set_etapa_produccion`, `fn_recalcular_costo_variante`), verificado
    directamente (no por agente) porque las dos recetas de Producción se contradecían en un punto real (ver hallazgo 4 de
    la síntesis) y hacía falta la fuente primaria para resolverlo.
- **Antes de escribir una sola línea más:** el drift cambia rápido en este repo (otras sesiones aplicaron ~10 migraciones
  en la hora previa a esta investigación) — repetir el chequeo de `supabase_migrations.schema_migrations` por nombre/fecha
  contra las tablas que se van a tocar, no asumir que lo verificado el 2026-09-22 sigue vigente si pasó más de un día.
- **Arnés local:** `scripts/demo/local/fixtures-produccion-simulada.sql` + el generador completo, contra
  `docker exec -i supabase_db_cayla-retail psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At` (contenedor Docker local de
  Supabase — confirmar que existe con `docker ps` antes; si no, `.env.local` y el stub de migraciones también faltan en un
  worktree nuevo, ver la memoria del proyecto). Correr el archivo completo (no hace falta escala reducida, ya corre en
  minutos) y revisar que termine en `ROLLBACK` sin ningún `ERROR`.
- **Reglas que no se negocian** (ver también CLAUDE.md): nunca `DELETE`/`UPDATE` sobre `movimientos` ni apagar sus
  triggers; jamás un comprobante `pendiente`/`rechazado`; **no tocar `series_comprobantes` salvo la excepción de NC01/NC02
  ya hecha en 5.1** (Felipe ya la autorizó, no pedir de nuevo); no llamar `recalcular_stock()` global; el `COMMIT` final en
  producción lo pega Felipe, nadie más.

---

- **Fecha:** 2026-09-21
- **Estado:** En curso — Fases 1 (catálogo), 2 (demanda), 3 (inventario inicial y abastecimiento) y 4 (ventas, caja y comprobantes)
  ensayadas con `ROLLBACK` (3 y 4, en una base local con datos de la forma de producción); fases 5-7 pendientes. **Nada está escrito
  en producción.**
  **Numeración provisional:** verificar en refs remotas antes de subir (los números de ADR chocan entre sesiones paralelas).
- **Decide:** Felipe (volumen ×3, personas reales como autoras, carga desechable, isotipo como imagen, él pega el `COMMIT`).
  Arquitectura: este documento.
- **Toca:** solo datos. **No cambia el esquema ni `apps/web`.** Archivos: `scripts/demo/sembrar-90-dias.sql` (y, en las fases
  siguientes, `verificar-90-dias.sql`, `deshacer-90-dias.sql` y `docs/demo-90-dias/QUE-MIRAR.md`).

## Contexto — el problema

Producción aún no tiene uso real: 45 productos, 17 ventas de prueba, 480 movimientos. Con ese volumen no se puede ver cómo se
comportan Análisis, Compras, Caja, Movimientos ni el rendimiento, ni comprobar que el stock cuadra después de meses de
operación. Hay que probar la integración en un entorno de verdad, con tres meses de historia coherente.

## Decisión

**Un generador determinista en SQL, dentro de una sola transacción, con `INSERT` directo y fechas históricas explícitas.**
Ninguna RPC de escritura acepta fecha (`registrar_venta`, `abrir_caja`, `cerrar_caja`… sellan `now()`), y `movimientos` es
inmutable: una fecha mal puesta no se corrige. Llamar las RPC dejaría todo «hoy», quemaría correlativos reales (B004, F004) y
exigiría suplantar usuarios. Un generador por conjuntos dentro de la base produce ~90.000 filas en segundos y se ensaya con
`ROLLBACK` sobre el esquema real.

Reglas que lo gobiernan:

1. **Marcado:** todo id sembrado empieza en `5eed` (`overlay(md5('seed:'||tabla||':'||clave) placing '5eed' from 1 for 4)`),
   así se filtra, se verifica y se deshace sin tocar lo real.
2. **Determinista:** misma semilla, mismos datos. Las elecciones se hacen con un hash del id del producto, no con `random()`
   suelto (ver «Lo que enseñó la Fase 1»).
3. **Nada se apaga:** los triggers corren en la carga (solo `INSERT`). Apagar el candado de `movimientos` queda solo para
   *deshacer*, con OK explícito ese día.
4. **Comprobantes:** jamás `pendiente` ni `rechazado` (el botón «Transmitir» los mandaría a SUNAT). Series demo, `aceptado`,
   entorno `sandbox`. **No se toca `series_comprobantes`.**
5. **Los chequeos abortan la transacción** (`RAISE EXCEPTION`) antes del final: un `COMMIT` con datos que no cuadran no existe.
6. **Ensayo y definitivo son el mismo archivo.** La última línea es `ROLLBACK;`; Felipe la cambia por `COMMIT;` y antepone
   `set search_path to retail, public;` al pegarlo en el SQL Editor de producción.
7. **Quién es «líder»:** `retail.colaboradores.rol = 'lider'` (no el rol de `public.personas`). Los triggers de alta miran
   `auth.uid()`; el script fija `request.jwt.claim.sub` al `auth_user_id` de un líder para que el catálogo quede aprobado.
8. **Quién firma:** los 9 líderes (sin sede) y los colaboradores de `colaboradores.ubicacion_asignada_id` (TRU 11, AQP 2, Taller 3).

## Fase 1 — catálogo (ensayada)

220 productos, 1.261 variantes, 441 fotos, 126 vínculos a 3 campañas. Reparto por categoría con cantidades fijas (Polos+Tops 22 %,
complementos 21 %, blusas 9 %), bandas de precio por categoría terminadas en `.90`, costo 38-48 %, 67 marcas (concentradas: 19, 16 y 13
prendas en las tres mayores), 31 colores, 180 de Otoño-Invierno y 40 de Primavera-Verano, códigos únicos y en orden cronológico.
Las tres campañas reales (Fiestas Patrias, Día Internacional del Gato y del Perro) ya existen sin descuento; **no se tocan**: las
demo son nuevas y llevan «(demo)» en el nombre. El SKU manual queda vacío (el trigger asigna código y código de barras).

## Fase 2 — demanda (ensayada)

Solo tablas temporales: no escribe en ninguna tabla real. Decide **cuánto se vende, dónde, cuándo y qué**; de ahí saldrán el
abastecimiento (fase 3, para que el stock no pueda quedar negativo) y las ventas con sus pagos, cajas y comprobantes (fase 4).
Resultado del ensayo con volumen completo: **7.003 boletas, 11.004 prendas (1,57 por boleta), S/ 962.230** (S/ 137 por boleta;
el plan decía ≈ S/ 900.000: +7 %, dentro de «≈»). Reparto TRU 68,2 % · AQP 26,9 % · LIM 4,9 % (LIM crece de 0,3 a 1,7 a lo largo de
la ventana). Julio 94 boletas al día y el resto 69-71; pico el 29 de julio (142); hora fuerte 16-20; 5,9 % de líneas con descuento
manual, 214 con campaña; 1.066 de 1.261 variantes vendidas (las demás quedan para las anomalías de stock); 24 productos sin venta
en 30 días y 13 en 60 (A8).

Diseño que las fases siguientes heredan:

- **Sorteo por épocas.** Cada vez que nace o deja de venderse una prenda empieza una época (9 en el ensayo); por tienda y época hay
  una tabla de pesos acumulados y cada línea sortea su variante con un solo cruce. Así ninguna línea cae en una prenda que ese día no
  existía (una colección nueva no vende antes de nacer) y no hay que rechazar-y-repetir.
- **Peso de una variante** = Zipf por producto (exponente 0,7) × baratura (`(100/precio)^1,3`, calibrado con el total) × gusto propio
  de cada tienda × talla (M rota más que XS/XXL) × color (negro y blanco lideran).
- **El último día es un turno cerrado:** sus boletas llegan solo hasta `now() − 15 min` y su volumen se prorratea por la fracción
  de día transcurrida; la fecha «hoy» es la de **Lima**, no la de UTC (`current_date` daba otro día pasadas las 19:00).
- **Reglas de `registrar_venta` respetadas en la demanda:** la campaña vigente es obligatoria y con el monto exacto; el descuento
  manual nunca pasa de 35 %, exige argumento sobre 20 % y no baja del costo. Los 592 tickets con descuento manual necesitarán
  autora líder en la fase 4 (`registrar_venta` pide líder o código de descuento).
- **Salidas para la fase 3:** `tmp_lineas` (por ticket, variante y fecha), `tmp_tickets` (con `seq` por tienda, en orden de hora, para
  el correlativo de boleta) y `tmp_producto_vida` (desde/hasta de cada prenda).

## Fase 3 — inventario inicial y abastecimiento (ensayada en local)

**Demanda primero.** De las ventas de la Fase 2 se deriva todo lo que tuvo que llegar para poder venderlas, así el stock no queda
negativo por construcción (principios 2 y 4). Resultado del ensayo (base local con la forma de producción, semilla fija): **157
compras** (S/ 425 mil sin IGV; el plan decía 370-460 mil), **~13.200 movimientos** (recepción 3,4 mil, carga inicial 1,6 mil, salida y
entrada de traslados 0,8 mil cada una, subidas al piso 6,4 mil; con las ~11 mil ventas de la Fase 4 suman ≈ 24 mil, el plan decía
25 mil), **52 traslados**, 104 envíos y 313 lotes, 489 líneas de compra con 893 repartos por tienda. Sin factura 32 % (R-07 pide más de
30), 82 % de los pagos por transferencia (R-02 pide más de 75), 2 pagos en efectivo de S/ 2.000 o más (R-09: como mucho 2).

Cómo se decide qué llega y cuándo (`scripts/demo/sembrar-90-dias.sql`, secciones 3.1-3.7):

- **Cubrir hasta la siguiente llegada.** Cada proveedor tiene su calendario de compras (1 + 0,2·productos + 0,2, espaciadas en la ventana;
  llegan de 1 a 10 días después, nunca en domingo). Cada variante recibe, en cada llegada, la demanda que tendrá hasta la siguiente
  (lo que llega el día X se sube al piso desde la mañana de X+1) más un colchón de 0-15 %; al final quedan 5-25 % de lo vendido, al
  menos 1 unidad. La colección Primavera-Verano se compra y se recibe el día de alta (no puede llegar después de su primera venta).
- **Simulación día a día** (`tmp_est`): sube del almacén al piso con la regla de la tienda (piso ≤ 7 → subir 7 días de venta, mínimo 6;
  `inventario-reglas.ts`), descuenta las ventas y suma las llegadas. Si un día algo no alcanza, **se detiene con el detalle** (variante,
  tienda, saldos): es un error del plan de compras, no algo que se tape. Esta simulación ya cazó un fallo real (una compra de la colección
  nueva que caía en domingo se movía al lunes y llegaba después de su primera venta).
- **Lima se surte desde el Taller**, como dice ADR-0071/0097: olas martes y viernes (y el día de alta de la colección nueva), que salen por
  la mañana y llegan el mismo día (Taller y LIM están en Lima); cada ola cubre las ventas hasta la siguiente. El Taller arranca con
  lo que después despacha más un colchón. LIM no lleva reparto de compras: es una decisión (la compra «real» de LIM en la práctica
  llega por el Taller).
- **Traslados a TRU y AQP** (10 y 10, de 2-5 líneas): no cubren demanda, solo suman stock; ~10 % llega con 1-2 unidades de menos y un
  líder cierra la diferencia al día siguiente. Además, los estados que la pantalla debe mostrar: **A2** (uno en tránsito hace 9 días con
  la fecha estimada vencida y dos en tránsito a tiempo) y **A3** (recibido con diferencia, sin cerrar y sin movimiento de entrada).
- **Escenarios de Compras:** **A4** (cinco facturas a crédito con los vencimientos exactos: 1 vencida hace más de 30 días, 2 vencidas
  hace 8-30, 2 por vencer en ≤ 7; una con pago parcial) y **A5** (una factura con recepción parcial, un faltante cerrado por dañado y su nota
  de crédito). Cinco compras recientes quedan sin recibir (dos con la fecha estimada ya vencida) y una está anulada.
- **Anomalías de stock:** A6 (8 pares de TRU con el piso en 0 y stock en el almacén), A7 (6 variantes de las más vendidas agotadas del todo
  en las 3 tiendas), ~2,5 % de pares agotados con demanda, A8 (15 prendas viejas que dejaron de venderse: 6 hace 60+ días y 9 hace 30+) y
  A14 (una prenda descontinuada con stock).

Decisiones que tomé sin preguntar (con la razón):

1. **Una línea de compra por producto**, no por variante, como la pantalla de Recibir; las recepciones sí son por variante y se ligan a su
   línea. Ninguna pantalla lee `compra_items.variante_id`.
2. **Envío = una guía por tienda y día; lote = un proveedor dentro del envío.** Los lotes sueltos («Ingreso sin comprobante») no se
   siembran: son la excepción y nunca se han usado en producción.
3. **Sin `costo_historial` y sin tocar `variantes.costo`.** El costo de cada línea es el costo declarado de la prenda, así el estado de costo
   queda «declarado» y no hay ningún `UPDATE` de variantes (que escribiría en `historial_producto_cambios`, inmutable, con la fecha de hoy).
   La cadena oficial de costos necesita el ledger completo y va, si Felipe la quiere, en la Fase 6.
4. **Nota de crédito por `INSERT` directo** (la función `fn_insertar_nota_credito_compra` deja `created_at = now()` en una tabla inmutable) y
   con motivo «devolución»: el motivo «faltante» exige una compra resuelta y la de A5 no lo está.
5. **Quién firma:** compras, pagos y notas de crédito solo un líder; recepciones y subidas, un colaborador de esa tienda o un líder; LIM solo
   líderes; y **nadie firma antes de haber ingresado** (`personas.fecha_ingreso`: al inicio de la ventana solo 3 de 9 líderes, 9 de 11 en TRU
   y 2 de 3 en el Taller son elegibles). `carga_inicial` sin usuario, como las 219 reales.
6. **Regla de subida al piso de la tienda**, no «justo antes de vender»: con lo segundo el piso estaría en 0 casi siempre y cobertura, rotación
   y días con stock saldrían degenerados en Análisis.
7. **Fase 1:** solo proveedores activos (16 de 220 productos habían quedado con el único proveedor inactivo), horas de alta explícitas en Lima
   (no las de la sesión) y `random()` reemplazado por hashes. **La demanda de la Fase 2 cambió un poco** (la colección nueva vende siempre desde
   el día siguiente a su alta): en el ensayo local sale ≈ S/ 949 mil (en producción el ensayo anterior dio S/ 962.230).
8. **Determinista.** Mismo `cayla_seed.ahora` y misma semilla dan la misma huella en las 7 tablas principales (comprobado con UTC, UTC y
   America/Lima). Sin fijar `ahora`, el último día (que llega hasta hace 15 minutos) cambia con la hora de la carga, y es a propósito.

**Cómo se ensaya sin pegar 120 KB en cada llamada:** `scripts/demo/local/fixtures-produccion-simulada.sql` crea, dentro de la misma
transacción, datos que imitan la forma de producción (ubicaciones, 9 líderes y 16 colaboradores con sus fechas de ingreso, 72 proveedores)
sobre la base local de Docker, y el generador termina en `ROLLBACK`. La estructura de 34 de las 35 tablas que toca el generador es idéntica
a la de producción (columnas, restricciones y triggers; la que difiere, `colaboradores`, trae en local una migración nueva que producción
aún no tiene y el generador no usa) y 22 de las 23 funciones de las que depende también (la otra solo difiere en un comentario).
**Falta el ensayo contra producción** con el archivo completo (114 KB; ver «Qué falta»).

**No se siembra en la Fase 3:** lotes sueltos, `costo_historial`, `compra_reasignaciones`, saldo a favor de proveedores
(`proveedor_creditos`), `pago_grupo_id`, `envio_extras`/regalos y adjuntos de compra (los archivos no existen en Storage).

## Lo que enseñó la Fase 3

- **Un `ROLLBACK` no ejercita los constraint triggers diferidos** (el reparto de una compra entre tiendas): el ensayo pasa y el `COMMIT` real
  puede fallar. El generador fuerza `SET CONSTRAINTS ALL IMMEDIATE` justo después de insertar los repartos y de nuevo al final.
- **`ceil(cobertura × 1,06)` duplica las cantidades chicas** (`ceil(1 × 1,06) = 2`): con eso el sobrante salía en 90 % en vez de 10-35 %.
  Ahora la cobertura va exacta y solo el colchón se redondea.
- **La huella de un ensayo tiene que excluir lo que el propio ensayo inventa.** Las dos corridas «iguales» diferían porque el archivo de
  datos de prueba creaba ubicaciones con uuid al azar y los ids de lotes y movimientos se arman con ellos.
- **El plan de compras debe estar hecho antes de la simulación, no después:** las llegadas de A5 se agregaron tarde y la simulación no las
  veía. Se mueve el bloque, no se parcha el chequeo.

## Fase 4 — ventas, caja y comprobantes (ensayada en local)

Convierte la demanda de la Fase 2 (`tmp_tickets`/`tmp_lineas`) en ventas reales. Resultado del primer ensayo, sin necesitar
recalibración: **6.995 ventas** por S/ 932.430, **267 cajas** (3 tiendas × ~89 días con caja abierta ese día — el primer día de la
ventana algunas tiendas todavía no habían abierto a la hora del corte), **6.658 comprobantes** (6.421 boletas + 237 facturas, 3,6 %;
34,4 % de las boletas con DNI). Medios de pago: efectivo 47,2 %, yape 24,2 %, plin 13,9 %, tarjeta 10,4 %, transferencia 4,3 % —
los cinco dentro de 1 punto del objetivo. Los 9 chequeos internos pasaron a la primera.

- **Cajas antes que ventas.** `ventas.caja_id` es una FK real: hubo que insertar `cajas` antes de `ventas` (el primer intento falló
  con `ventas_caja_id_fkey`). Una caja por tienda y día de la ventana, apertura S/ 150, la abre un colaborador o un líder y la
  **cierra siempre un líder** (candado D-13, confirmado aplicado en producción). Fórmula de cierre idéntica a `cerrar_caja()`:
  apertura + efectivo de sus ventas (sin ingresos/egresos ni cambios todavía — eso es la Fase 5).
- **LIM no tiene ninguna serie de comprobantes.** Es un hueco real de producción, no algo que este seed deba tapar:
  `registrar_venta` acepta `p_tipo_comprobante = NULL` (una venta válida sin emitir boleta/factura), así que las 337 ventas de LIM
  quedan así — un chequeo nuevo (`% comprobantes en LIM`) aborta si alguna vez alguien intentara sembrar uno ahí por error.
- **El correlativo de cada comprobante sale de `fn_reservar_numero_serie()` real**, llamada en un bucle PL/pgSQL en orden
  cronológico (mismo patrón que `fn_aplicar_movimiento` en un ensayo). A diferencia del `setval()` de la Fase 3, esto es una
  `UPDATE` normal sobre una fila de `series_comprobantes` — sí es transaccional, un `ROLLBACK` la deshace sin dejar rastro.
- **`estado='aceptado'` y `entorno_transmision='sandbox'` desde el `INSERT`,** nunca `pendiente` (el default de la columna). El
  generador nunca llama a `emitir_comprobante()` como RPC viva.
- **Autoría:** líder si el ticket lleva algún descuento manual (`registrar_venta` exige líder o código de descuento; aquí no se
  siembra ningún código), cualquier colaborador de esa tienda en el resto — reusa `pg_temp.firmante()` de la Fase 3.
- **A1** (caja con faltante −S/ 38,50 en TRU y con sobrante +S/ 12 en AQP): dos cajas puntuales con `monto_cierre_real` distinto del
  sistema; un chequeo exige que sean exactamente esas dos y ninguna otra.
- **Verificado que no repite el gotcha de la Fase 3:** ninguna de las 6 tablas que toca esta fase (`ventas`, `venta_items`,
  `venta_pagos`, `cajas`, `caja_movimientos`, `comprobantes`) tiene un trigger `DEFERRABLE`, así que no hay ningún candado
  diferido que un ensayo con `ROLLBACK` esté dejando de ejercitar.

## Investigación de la Fase 5 y primer parche (2026-09-22)

Antes de escribir una sola línea, 7 agentes en paralelo (uno por subsistema de postventa/gastos/Taller: devoluciones+NC, cambios,
anulaciones, conteos+cuarentena, gastos+proformas, producción-infraestructura, producción-órdenes) verificaron cada tabla/trigger/RPC
**contra producción en vivo, hoy**, no contra el texto del plan (verificado la última vez el 2026-09-21 — un día alcanza para que
otra sesión lo desactualice). Una síntesis final cruzó los 7 hallazgos entre sí. Resultado completo (7 recetas + riesgos cruzados)
en el journal del workflow; acá solo lo que cambió el diseño:

1. **[Bloqueante, resuelto con Felipe]** `series_comprobantes` no tenía ninguna fila `tipo='nota_credito'` para TRU/AQP —
   `aprobar_devolucion()` llama a `fn_reservar_numero_serie(ubicacion_id, 'nota_credito')` y esa función aborta sin una serie
   activa, así que casi todas las ~140 devoluciones planeadas (95 % son TRU/AQP con comprobante `aceptado`) tumbarían la
   transacción entera en la primera. **Felipe decidió (2026-09-22) que el propio script la registre**: NC01 (TRU), NC02 (AQP) —
   única excepción autorizada a la regla «no tocar `series_comprobantes`» de este ADR, y solo para este caso puntual. Sección 5.1.
2. **[Drift no listado en el plan]** `anular_venta()` fue reescrita hoy mismo por otra sesión (migración
   `comprobantes_cola_de_reintento`): ya no pone el comprobante en `anulado`, y **aborta si el comprobante de la venta ya está
   `enviado`/`aceptado`** — exactamente el estado de las 6.995 ventas que la Fase 4 ya sembró (todas `aceptado`, sin excepción).
   Sin esto, las ~50 «anulaciones» del plan no representarían ningún estado que la app real pudiera producir hoy (principio 2:
   cero estados inconsistentes). Arreglo: se parcheó la Fase 4 YA COMPROMETIDA (sección 4.6b, nueva) para elegir ~50 ventas de
   TRU/AQP de forma determinista (`pg_temp.h('anular:'||ticket_id) < 0.0075`, con margen real antes de que cierre su caja) y
   4.7 les da `no_emitido` (con `motivo_no_emitido`/`marcado_no_emitido_por`/`_at`) en vez de `aceptado` — nunca pasan por
   `aceptado`, tal como en la vida real un líder anula antes de que se transmita. Un chequeo nuevo (4b) confirma que los
   comprobantes `no_emitido` son EXACTAMENTE esas ventas, ni más ni menos. Ensayado en Docker local: 54 elegidas (35-65
   esperadas), los 9 chequeos originales de la Fase 4 siguen en verde, `ROLLBACK` limpio.
3. **[Conflicto entre dos recetas, resuelto por la síntesis]** El agente de «producción-infraestructura» diseñó `insumo_lotes`
   como INSERT directo sin trazabilidad (`comprobante_item_id`/`recepcion_id` en NULL); el de «producción-órdenes» descubrió en
   vivo que esas mismas columnas son FK reales a `comprobantes_produccion_items`/`_recepciones`, y que los lotes que las ~30 OP
   consumen por FIFO SÍ deben venir de un comprobante de producción real. Se fusionan en un solo bloque de Fase 5, un solo autor,
   orden estricto: `proveedores_produccion → insumos → comprobantes_produccion(+items) → comprobantes_produccion_recepciones →
   insumo_lotes (con FK reales) → movimientos_insumo compra → producciones → movimientos_insumo consumo (FIFO) →
   cerrar_produccion`, con un chequeo final `v_insumo_saldos.fisico < 0` = 0 filas.
4. **[Riesgo cruzado, a resolver al escribir el resto]** Anulaciones, Cambios y Devoluciones seleccionan sobre el mismo pool de
   ~7.000 ventas — sin partición por hash triple-excluyente (`NOT EXISTS` cruzado entre las tres, no solo contra Anulaciones),
   un mismo `venta_item` podría terminar con dos historias contradictorias. Gastos, Cambios y Devoluciones tocan las MISMAS
   cajas que la Fase 4 ya cerró (reembolsos, diferencia de cambio, egresos de gasto) — un solo «cierre financiero» al final de
   la Fase 5 debe recalcular `monto_cierre_sistema`/`monto_cierre_real` con la fórmula completa de `cerrar_caja()`, no cada
   sub-área por separado. Ninguno de los dos está resuelto todavía en código — queda para cuando se escriban esas secciones.

Lo que ya envejeció del plan original y no se siguió al pie de la letra: el patrón de RUC de 11 dígitos que el plan decía
«reutilizar de la Fase 3» solo existe en el fixture local de pruebas, no en el generador real (la Fase 3 lee RUCs de proveedores
ya existentes, nunca genera uno nuevo) — la receta de producción-infraestructura genera el suyo con `pg_temp.h()`, determinista,
en vez de asumir un patrón que no estaba ahí.

## Revisión adversarial de la Fase 3 (2026-09-22)

Tres lentes (estados imposibles, pantallas, riesgo para producción viva) revisaron el generador; cada hallazgo lo intentó refutar un
escéptico independiente antes de darlo por bueno. Cuatro hallazgos sobrevivieron; uno («falta ensayar el archivo completo contra
producción») se descartó porque ya estaba anotado en «Qué falta» — no era un defecto nuevo.

1. **[Bloqueante, corregido] `transferencias.numero` no sincronizaba la secuencia real.** El generador calcula el número a mano
   (`max(numero) + row_number()`) para que el correlativo siga el orden cronológico, no el de inserción — pero un `INSERT` con valor
   explícito nunca llama a `nextval()`. Sin corrección, el primer «Iniciar traslado» real después del `COMMIT` habría pedido el mismo
   número que una fila sembrada, con `unique_violation` en cadena hasta que la secuencia alcanzara el máximo sembrado. **Arreglo:** un
   `setval()` condicionado a un parámetro `cayla_seed.definitivo` que Felipe fija aparte del `COMMIT`, nunca durante un ensayo — porque
   `setval()` **no es transaccional** (comprobado en local: sobrevive a un `ROLLBACK`, a diferencia de todo `INSERT` del script). Verificado
   con tres corridas: por defecto la secuencia no se mueve (aunque el archivo cambie), con el parámetro activado se mueve *aunque termine en
   `ROLLBACK`* (por diseño: confirma que el parámetro y el `COMMIT` deben ir siempre juntos), y una tercera corrida por defecto confirma que
   el parámetro no queda pegado entre conexiones.
2. **[Alto, corregido] El segundo `SET CONSTRAINTS ALL IMMEDIATE` no revisaba nada.** El candado «ninguna tienda recibe o cierra más de lo
   asignado» lo pone `recibir_compras()` con un `RAISE` propio sobre `movimientos`/`compra_item_cierres`, no el trigger diferido de reparto
   (que solo se dispara si se toca `compra_items`/`compra_item_destinos`, y la Fase 3 no vuelve a tocarlas después del primer flush). El
   segundo flush era, en la práctica, un no-op. **Arreglo:** chequeo (13) nuevo que replica esa regla en SQL contra `compra_item_destinos`.
3. **[Alto, documentado] `codigos_correlativos` queda bajo lock de fila durante toda la corrida.** `fn_siguiente_correlativo` hace un
   `UPSERT ... RETURNING`, que mantiene el lock de esa fila hasta el `COMMIT`/`ROLLBACK` de **toda la transacción**, no solo de la Fase 1.
   Las 12 categorías que la Fase 1 usa (BLU, TOP, POL, CMP, VES, JEA, PAN, SHO, CAS, FAL, BLZ, GEN) ya tienen fila hoy en producción. Mientras
   dure la corrida definitiva (las 7 fases en una sola transacción, por diseño — regla 6 de este ADR), dar de alta un producto real en
   cualquiera de esas categorías queda bloqueado. La revisión corrigió además un dato del hallazgo original: el rol `authenticated` (el que
   usa la app real vía PostgREST) tiene `statement_timeout` de **8 segundos**, no los 2 minutos del rol `postgres` del MCP — la ventana de
   riesgo es mucho más chica de lo que parecía. No es un defecto de código: es un aviso para la ventana tranquila (ya pedida en «Qué falta»).
4. **[Alto, documentado] Falta `deshacer-90-dias.sql`, y no es trivial.** `movimientos`, `compra_item_cierres` y `compra_notas_credito` son
   inmutables (`RAISE EXCEPTION` en `UPDATE`/`DELETE`); deshacer exige desactivar esos 3 triggers, y hay un ciclo real de FK
   (`movimientos.transferencia_item_id` ↔ `transferencia_items.movimiento_id`, y lo mismo con `transferencia_recepciones`) que obliga a
   anular esas columnas con `UPDATE` **antes** de poder borrar — ese `UPDATE` también lo bloquea `movimientos_inmutables` (dispara en
   `UPDATE`, no solo en `DELETE`). Y `codigos_correlativos.ultimo` no se puede restar a ciegas (no lleva marca `5eed`; si alguien da de alta
   un producto real en esa categoría entre la siembra y el deshacer, restar dejaría el contador mal): hay que recalcularlo desde el código
   más alto de las filas NO-`5eed` de cada prefijo. Sigue como trabajo de la Fase 7 (ya estaba en «Qué falta»), con esta receta.

## Revisor de «pantallas» de la Fase 3 (2026-09-22, completado tras un choque de infraestructura)

Corrió las 19 funciones que alimentan Compras/Recibir/Traslados/Análisis contra lo sembrado (con un `stock` agregado a mano, como
haría la Fase 6). Dos hallazgos:

1. **[Alto — bug real de la aplicación, no del generador] `notas_credito_tablero()` y `compras_nota_pendiente()` muestran el mismo
   dinero dos veces.** A5 (recepción parcial) cierra 6 unidades dañadas con una nota de crédito `motivo='devolucion'` — correcto:
   `fn_insertar_nota_credito_compra` solo exige la compra resuelta cuando el motivo es `'faltante'`, así que un líder real puede
   hacer exactamente esto hoy. El bug: ambas funciones filtran «¿esta compra ya tiene ALGUNA nota con motivo `faltante`?» en vez de
   «¿este cierre concreto ya tiene alguna nota?» — así que un cierre ya resuelto con otro motivo (`devolucion`/`descuento`/`otro`)
   sigue apareciendo como «pendiente, faltante S/ 474,43» para siempre. Reproducido dos veces contra las definiciones vivas
   (`compras_nota_pendiente`: `not exists (... and n.motivo = 'faltante')`; `notas_credito_tablero` hace lo mismo dentro de su CTE
   `f`). **No es un defecto de la Fase 3**: es una regla de negocio implementada mal que esta siembra fue la primera en ejercitar,
   con datos reales de compras a esta escala. Queda en `docs/BACKLOG.md` como bug de producto — el arreglo (comparar por
   `cierre_id`, no por `compra_id` + motivo) es una migración aparte, con el OK de Felipe, no algo que este generador deba
   rodear cambiando cómo siembra A5 (eso escondería el bug real).

   **Corregido 2026-09-22, antes de empezar la Fase 5** (Felipe pidió cerrarlo primero): migración
   `20260922151800_notas_credito_pendiente_por_cierre.sql`, reproducida y verificada en Docker local (repro con nota
   `devolucion` → antes 2 filas, después 1; regresión con un cierre sin nota → sigue pendiente, sin cambio) y pegada en
   producción por MCP, confirmada en vivo por la huella de la definición. Producción no tenía ningún caso real duplicado
   todavía — el bug llevaba tiempo latente porque casi todas las notas reales son de motivo `faltante`; esta siembra iba a
   ser la primera en activarlo con datos reales. Detalle en `docs/BITACORA.md` (2026-09-22, «Doble conteo de notas de
   crédito de compras»).
2. **[Medio, ya cubierto por diseño] Si alguna vez se comprueba «solo Fase 1-3» en producción sin la Fase 4**, `fn_resumen_variantes`
   sale con `ledger_consistente=false` en 70-87 % de las filas y «Pedir a proveedor» en cero, porque las ventas de la Fase 2 siguen
   siendo virtuales hasta que la Fase 4 las convierte en movimientos reales. Confirmado y medido, pero es justo lo que la regla 6 de
   este ADR ya existe para evitar (COMMIT único de las 7 fases juntas). Con la Fase 4 ya escrita esto deja de ser un riesgo real del
   plan; queda anotado por si alguna vez se prueba un COMMIT parcial fuera de la corrida definitiva.

## Lo que enseñó la Fase 1 (para no repetirlo en las fases siguientes)

- **Un subselect que no depende de la fila se evalúa una sola vez.** `cross join lateral (… order by random() limit 1)` dio la
  misma marca a las 220 prendas y `colores` dio los mismos dos colores. Los conteos pasaban; solo un diagnóstico de variedad
  lo mostró. Por eso ahora hay un chequeo de variedad (≥ 10 marcas, ≥ 15 colores) y toda elección depende de un hash del id.
- **El orden de inserción es el orden de los correlativos:** el trigger de variantes asigna `codigo` en el orden en que entra
  cada fila. El `INSERT … SELECT` lleva `ORDER BY` por fecha de alta y un chequeo verifica que no haya inversiones.
- **`retail.etiquetas` tiene clave única por nombre normalizado** (`fn_clave_texto`): una campaña demo con el nombre de una real
  aborta. Las reales ya traían las mismas tres fechas.
- **`referencia` es el nombre del producto** en la pantalla actual (los datos viejos la usan como código); se sigue la convención de
  la pantalla.

## Qué falta (fase 5 en curso, fases 6-7) y lo que se decidirá con Felipe

De la Fase 5 (postventa, gastos y producción del Taller) ya están escritas y ensayadas: 5.1 (serie de NC), la selección de
anulaciones (4.6b, parche a la Fase 4), 5.2 (anulaciones: 54 ventas, 76 líneas, 60 reingresan al piso) y 5.9 (cierre
financiero único de cajas con la fórmula completa de `cerrar_caja()`, preservando A1). Falta escribir, entre 5.2 y 5.9:
cambios, devoluciones+NC, conteos, cuarentena, gastos+proformas y producción del Taller (infra+órdenes en un solo bloque).
Luego fase 6 `stock` derivado y cierre · fase 7
ensayo completo y prueba de reversibilidad (`verificar-90-dias.sql`, `deshacer-90-dias.sql`, `docs/demo-90-dias/QUE-MIRAR.md`).

**Decidido por Felipe (2026-09-21):** la cantidad (≈ S/ 962 mil) sirve, y la ventana termina el día en que se pegue el `COMMIT`, que
será el mismo día en que se termine de armar (el script toma «hoy» de la base; se puede fijar con `cayla_seed.ahora`).
**Pendiente antes del `COMMIT`:** una hora tranquila (hay pruebas en producción en vivo), confirmar en Supabase (Database → Backups) que hay
una copia de ese día, y el **ensayo contra producción con el archivo completo**. El archivo pesa ya 114 KB y va a crecer; si el MCP no lo
acepta, el ensayo lo pega Felipe en el SQL Editor con `ROLLBACK`, o se parte por fases con estado intermedio (ver el riesgo 5 del plan).
Los ensayos de cada fase se hacen en local con el arnés (arriba) y se completan con el de producción.

## Consecuencias

- Mientras exista la carga, hay ventas con nombres de colaboradoras reales (rankings por vendedora). Operar devoluciones o el botón
  «Anular» sobre boletas sembradas llamaría a Lucode sandbox: no usarlo.
- «Hoy» envejece: las pantallas de «hoy» solo ven el día Lima actual. Para refrescar se re-siembra (`deshacer` + `sembrar`).
- La base de producción es también la de Dynamic: ensayos pequeños primero, carga completa fuera de horario.
