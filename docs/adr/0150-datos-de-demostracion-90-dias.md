# ADR-0150 — Datos de demostración: 90 días de historia sintética, cargados con un generador SQL desechable

- **Fecha:** 2026-09-21
- **Estado:** En curso — Fases 1 (catálogo), 2 (demanda) y 3 (inventario inicial y abastecimiento) ensayadas con `ROLLBACK` (la 3, en una
  base local con datos de la forma de producción); fases 4-7 pendientes. **Nada está escrito en producción.**
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

## Qué falta (fases 4-7) y lo que se decidirá con Felipe

Fase 4 ventas, caja y comprobantes (las ventas reales con sus pagos, las cajas por día y los comprobantes `aceptado` con series demo) ·
fase 5 postventa, gastos y producción del Taller · fase 6 `stock` derivado y cierre · fase 7 ensayo completo y prueba de reversibilidad
(`verificar-90-dias.sql`, `deshacer-90-dias.sql`, `docs/demo-90-dias/QUE-MIRAR.md`).

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
