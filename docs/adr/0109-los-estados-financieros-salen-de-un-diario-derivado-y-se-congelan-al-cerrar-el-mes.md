# ADR-0109 — Los estados financieros salen de un diario derivado, y se congelan al cerrar el mes

**Fecha:** 2026-09-18
**Estado:** **APROBADO por Felipe el 2026-09-18** (opción C), con tres decisiones de negocio
que están más abajo. No hay código ni migración todavía: este documento fija el modelo; las
tareas 4-10 del plan de finanzas se construyen encima.
**Afecta:** un módulo nuevo `finanzas` en `retail`. No toca ninguna tabla ni RPC de dinero
existente.
**Reemplaza en la práctica:** la decisión C1 de `docs/MANUAL-CONTABLE-CAYLA.md` §7 ("tablas
`cuentas` + `asientos` y las 14 reglas de posteo automático dentro de cada operación"), escrita
en V1 y nunca construida en V2.

## La pregunta

Felipe quiere ver su Estado de Resultados y su Balance. ¿Los números salen de un **libro de
asientos que cada operación va escribiendo** (partida doble persistida), o se **calculan al
consultar** sobre las tablas de ventas, compras y caja que ya existen?

## Decisiones de Felipe (2026-09-18)

1. **Modelo:** opción C, diario derivado que se congela al cerrar.
2. **Yape y Plin llegan al banco al instante.** Entran directo a la cuenta 104 Banco, sin pasar
   por 105. Lo mismo se aplica a `transferencia`. Solo la **tarjeta** queda pendiente en 105
   hasta que el banco la abona. Efectivo va a 101 Caja. Consecuencia: la regla 3 del manual
   (abono del POS al banco) solo concierne a la tarjeta, y como no hay fuente para ese abono,
   se agrega una tabla pequeña de abonos de tarjeta (tarea 7).
3. **El cierre de mes es por unidad de negocio y también uno consolidado global.** Cada unidad
   cierra el suyo y además existe un cierre global de todo CAYLA.

**Lo que asumo de la respuesta 3, para que Felipe lo corrija si no es así:** "unidad de negocio"
= una `ubicacion` (Tienda Trujillo, Tienda Arequipa, Tienda Lima y el Taller). El cierre global
exige que **todas** las unidades activas del mes estén cerradas antes de poder cerrarse, y
reabrir una unidad reabre también el global de ese mes.

**CONFIRMADO por Felipe (2026-09-18):** las dos suposiciones son correctas — unidad de negocio = cada tienda y el
Taller, y el cierre consolidado exige que todas las unidades ya estén cerradas.

**Consecuencia de la respuesta 3 (sigue sin confirmar):** un Estado de Resultados por unidad
está completo (ventas, costo, mermas y gastos llevan la sede). Pero un **Balance por unidad
solo puede ser parcial**: el banco (104), el IGV (4011), el capital (50) y la deuda a
proveedores (421) pertenecen a la empresa, no a una tienda. Por eso el Balance completo vive
solo en el cierre consolidado; el de una unidad muestra únicamente lo atribuible a ella (su
caja, su inventario, sus activos fijos). Si Felipe espera un Balance completo por tienda, hay
que decidir cómo repartir banco y capital, y eso es una decisión contable, no técnica.

## Contexto (verificado, con su fuente)

- **En V2 no hay contabilidad.** `retail` no tiene tablas `cuentas`, `asientos`, `periodos`,
  `gastos` ni de banco. Solo sobrevivió `activos_fijos`. V1 sí construyó un motor de doble
  partida (`registrar_asiento`, PCGE, depreciación) y el corte a V2 del 2026-09-12 lo borró.
  Queda `apps/web/lib/registro-contable.ts`, un motor TypeScript que arma líneas debe/haber
  para una función que ya no existe: código huérfano, salvo la regla de que el crédito de IGV
  solo existe con factura.
- **La obligación viene.** `docs/ESTUDIO-CONTABILIDAD.md` §3: CAYLA vendió S/646,650 en 2026
  hasta julio (SINATRA), proyectado ≈ S/1,190,000/año = **72% del umbral de 300 UIT**. Al
  cruzarlo el Régimen MYPE Tributario exige Libro Diario y Libro Mayor electrónicos (PLE).
  *Sin verificar: régimen, valor de la UIT y umbral — lo confirma el contador.*
- **La ventana es barata hoy.** `docs/datos/15-COMO-OPERA-CAYLA.md` (2026-09-12): producción
  tenía "28 movimientos y 2 ventas". Cambiar los flujos de dinero cuesta poco mientras no haya
  historia que migrar. *Hay que refrescar ese dato — ver la consulta de volumen.*
- **El costo de lo vendido ya se sella.** `venta_items.costo_unitario` guarda el costo del día.
  El argumento del manual (§4②) para justificar un libro mayor ya no es necesario para eso.
- **Las fuentes existen casi todas.** `ventas`/`venta_items`/`venta_pagos` (métodos: efectivo,
  tarjeta, yape, plin, transferencia), `compras` (con `igv`, `fecha_emision`), `compra_pagos`
  (con `fecha` y `metodo`), `caja_movimientos`, `activos_fijos`, `costo_historial`,
  `prendas_danadas`, `comprobantes`. **Faltan:** gastos generales, abonos de tarjeta al banco,
  flete de compra, capital y saldos iniciales.
- **`movimientos` no guarda valor.** Una merma o un ajuste de inventario se valoriza buscando el
  costo vigente en esa fecha en `costo_historial`. Es posible, pero es una búsqueda por fecha.

## Números (Jeff Dean: sin número no hay decisión)

**Supuestos declarados, a reemplazar con `docs/datos/VERIFICAR-VOLUMEN-2026-09-18.sql`:**
ticket S/100, 1,8 líneas por ticket, crecimiento 39% anual (el escenario del propio estudio).

| Concepto | Cuenta | Resultado |
|---|---|---|
| Ventas año 1 / 2 / 3 | 1,19 M → 1,65 M → 2,30 M | **≈ S/5,1 M en 3 años** |
| Tickets en 3 años | 5,1 M / S/100 | **≈ 51 mil** (rango 34 mil a 73 mil con ticket de S/150 a S/70) |
| Líneas de venta | 51 mil × 1,8 | ≈ 92 mil |
| Líneas de diario por ticket | venta (≈3,3) + costo (2) | ≈ 5,3 |
| **Líneas de diario en 3 años** | 51 mil × 5,3 + compras, pagos, gastos, depósitos | **≈ 300–350 mil filas ≈ 100 MB con índices** |
| Escrituras en hora pico | 3 tiendas × ~10 tickets/h × 2 asientos | **≈ 1 por minuto** (10 por minuto si Navidad multiplica por 10) |

**Conclusión de los números:** ni el tamaño ni la concurrencia deciden esto. Cualquiera de las
tres opciones cabe holgada en un Postgres pequeño. Decide la **corrección** y la **obligación
legal**, no el rendimiento. Un detalle sí importa: **el saldo de una cuenta NO se guarda, se
suma.** Guardar un saldo corrido obligaría a que las 3 tiendas se bloqueen entre sí sobre la
misma fila de "Caja" en cada venta.

## Las tres opciones

**A. Libro de asientos persistido.** Cada operación (`registrar_venta`, `anular_venta`,
`aprobar_devolucion`, `registrar_cambio`, `registrar_compra`, pagos, movimientos de caja,
cierre de producción, liquidación de dañadas…) escribe sus asientos dentro de su propia
transacción.
- *Ganas:* es el estándar; auditoría completa; los libros PLE salen directo.
- *Pagas:* toca ~10 flujos de dinero que ya tuvieron 3 casos de drift documentado; **duplica cada
  hecho** (existe en `venta_items` y otra vez en el asiento) y esas dos copias pueden divergir en
  silencio, sin que ninguna operación falle: una regla de posteo olvidada da un balance mal, no
  un error. Además hay que rellenar la historia.

**B. Modelo de lectura.** Los estados se calculan al consultar sobre las tablas existentes.
- *Ganas:* cero cambios a los flujos de dinero; una sola fuente de verdad; se construye en
  semanas.
- *Pagas:* **nada se congela.** Editar una compra de marzo cambia el Estado de Resultados de
  marzo que ya se le mandó al contador. No hay Libro Diario para SUNAT. Y el Balance "cuadra"
  solo si el capital es el residual (Activo − Pasivo): eso es un tapón, no una comprobación.

**C. Diario derivado con cierre que congela (elegida).** Las reglas de posteo viven en UN
solo lugar de la base, en `retail.fn_asientos(desde, hasta, ubicacion)`, que **genera** las
líneas debe/haber leyendo las tablas de origen (cada línea trae de qué fila salió). Los estados
se calculan sobre ese diario. Al **cerrar el mes**, ese diario se materializa en tablas
inmutables (`asientos`, `asiento_lineas`) con un hash, y el período queda bloqueado.
- *Ganas:* una sola fuente de verdad (las operaciones); reglas centralizadas y probables una a
  una; no se toca ningún flujo de dinero; los meses cerrados son un libro real inmutable — el
  que exigirá PLE; y el camino a A queda abierto sin rehacer pantallas.
- *Pagas:* dos cosas que mantener (las reglas y el cierre); un mes abierto puede cambiar hasta
  que se cierra (es lo esperado); reabrir un mes necesita un proceso con motivo; y la partida
  doble se impone al leer y al cerrar, no al escribir cada operación.

## Decisión

**DECIDÍ: la opción C.** Un diario derivado por `fn_asientos`, estados calculados sobre él, y
cierre mensual que lo materializa de forma inmutable, por unidad de negocio y consolidado.

**DESCARTÉ:**
- **A ahora**, porque cambia ~10 flujos de dinero para resolver una obligación que aún no rige,
  a cambio de una segunda copia de cada hecho que puede divergir sin avisar. Si el contador
  confirma que el Libro Mayor rige ya, A se vuelve la ruta — y C no se pierde: las tablas
  `asientos` del cierre son las mismas.
- **B puro**, porque no congela nada y su comprobación de cuadre es un tapón. Un Estado de
  Resultados que cambia solo después de enviarlo no es un estado, es una opinión.
- **Reglas en TypeScript** (el diseño de `registro-contable.ts`). Dos implementaciones de la
  misma regla (una en pantalla, otra al guardar) es cómo nacen números distintos en dos
  pantallas. La regla vive en SQL, donde la ven todas las pantallas y se prueba con ROLLBACK.

**SE ROMPE SI:**
1. El contador confirma que CAYLA **ya** debe llevar Libro Diario y Mayor electrónicos este
   año: entonces hay que materializar el diario mes a mes hacia atrás desde el arranque, no
   solo al cerrar.
2. Alguien registra o edita, con fecha de un mes ya cerrado, una compra, un pago o un gasto
   (son los que llevan fecha escrita a mano): sin el bloqueo por período, el mes cerrado
   diverge de su hash. El bloqueo es parte de la decisión, no un extra.
3. Se suma un tipo de operación nuevo sin su regla en `fn_asientos`: ese dinero no aparece en
   ningún estado y **nada falla**. Por eso la prueba de conciliación de abajo no es opcional.
4. Una unidad cierra su mes y después se registra algo con fecha de ese mes en otra unidad que
   aún está abierta: el consolidado no puede cerrarse hasta que todas cierren, por diseño; pero
   una traslación entre unidades a fin de mes puede dejar un descuadre entre ellas si una cierra
   antes de que la otra reciba. Los traslados no llevan asiento (regla 14 del manual), así que
   no afecta el diario, pero sí la lectura de inventario por unidad al cierre.

## Estados imposibles (Lamport: qué NUNCA debe existir, y quién lo impide)

| Estado imposible | Se impide con |
|---|---|
| Un asiento cuyo debe ≠ haber | constraint diferido en `asiento_lineas` al cerrar |
| Una línea con debe y haber a la vez, o con monto negativo | `check` en la tabla |
| Una línea a una cuenta que no existe o está archivada | FK a `cuentas` |
| Un mes cerrado que se puede modificar | `revoke` de UPDATE/DELETE + trigger (patrón de `movimientos`, ADR-0042/0055) |
| Una compra, un pago o un gasto con fecha en un mes cerrado | trigger que rechaza la fecha |
| Dos cierres de la misma unidad en el mismo mes | `unique (periodo, ubicacion_id)` + advisory lock |
| Dos cierres consolidados del mismo mes | `unique` parcial sobre `periodo` cuando `ubicacion_id is null` |
| Un cierre consolidado con alguna unidad activa sin cerrar | verificación dentro de `cerrar_periodo` + `check` en la reapertura |
| Un mes cerrado sin su hash | `check` en `periodos` |
| Reabrir un mes sin motivo ni responsable | columnas `not null` en la reapertura |
| Reabrir una unidad sin reabrir el consolidado que la contiene | `cerrar_periodo`/`reabrir_periodo` en una sola transacción |
| Capital inventado para que el Balance cuadre | el capital es una ENTRADA (`saldos_iniciales`), nunca un residual |

## La comprobación que da sentido al cuadre

Con el capital como entrada, "Activo = Pasivo + Patrimonio" deja de ser tautología. Pero la
prueba fuerte es comparar **dos cálculos independientes**, que solo coinciden si las reglas están
completas: la cuenta 101 Caja contra la suma de `caja_movimientos`; la 201 Mercaderías contra
`stock × costo`; la 421 Facturas por pagar contra `compras.total − pagos`; la 4011 contra los
comprobantes. `fn_conciliacion_contable` corre esas comparaciones y **la pantalla no dibuja el
Balance si no coinciden**, mostrando la diferencia (mismo principio que `exigir()`: un número
falso es peor que ninguno).

## Contratos (Liskov: qué promete y qué asume)

- **`fn_asientos(desde, hasta, ubicacion)`** *promete:* líneas debe/haber, cada asiento cuadrado
  por construcción, con `origen_tabla` y `origen_id`; con `ubicacion` nula devuelve el
  consolidado. *Asume:* que las tablas de origen tienen la fecha y el costo correctos; no las
  modifica jamás.
- **`cerrar_periodo(mes, ubicacion)`** *promete:* todo o nada — o el mes queda materializado,
  con hash y bloqueado, o no cambia nada. Con `ubicacion` nula cierra el consolidado y exige que
  todas las unidades ya estén cerradas. *Asume:* que `fn_conciliacion_contable` pasó, y que quien
  llama es líder.
- **Estados** (`fn_estado_resultados`, `fn_balance_general`, `fn_flujo_efectivo`) *prometen:*
  leer solo de `fn_asientos` o de meses cerrados. *Asumen:* nada más.

## Todo o nada (Gray)

Las operaciones de dinero **no cambian de frontera**: seguirán siendo una sola transacción y no
escriben nada contable. La única transacción nueva es `cerrar_periodo`: bloquea el mes de esa
unidad, materializa N líneas, calcula el hash, marca el período y confirma, o revierte todo. El
cierre consolidado es otra transacción que verifica que todas las unidades estén cerradas y
materializa el consolidado. Concurrencia: dos líderes cerrando el mismo mes de la misma unidad
chocan contra `unique (periodo, ubicacion_id)`; el segundo recibe un mensaje claro, no un
estado a medias.

## Qué pasa si Lucode/SUNAT está caído (Vogels)

La contabilidad reconoce la venta cuando **ocurre**, no cuando SUNAT la acepta. Se degrada así:
el Estado de Resultados sigue mostrando la venta; el comprobante queda `pendiente` y visible
para reintento (ya funciona así, `emitir_comprobante` reserva sin transmitir). No se pierde
ningún dato. Lo que sí se agrega es un indicador de **conciliación fiscal**: ventas sin
comprobante aceptado, para que una caída larga se vea y no se acumule en silencio. Una nota de
crédito o una anulación revierten el ingreso por el hecho (`ventas.estado`, devolución
aprobada), no por el estado de transmisión.

## Lo que el manual contable no cubre y V2 ya tiene

El manual dice de sus 14 reglas que "no hay una décimo-quinta escondida". En V2 hay al menos
siete casos más que necesitan regla propia, porque V2 tiene flujos que V1 no tenía:

1. **Depreciación** (P-18, decidida "construirla"; el manual decía "sin depreciación").
2. **Anulación de venta** (`anular_venta`): revierte ingreso, IGV y costo.
3. **Devolución aprobada** (`aprobar_devolucion`): revierte la venta; la mercadería vuelve a 201
   si es vendible, o va a merma 659 si vuelve dañada; el reembolso sale de la caja o del banco.
4. **Cambio con diferencia** (`registrar_cambio`).
5. **Liquidación de prenda dañada como venta** (`liquidar_prenda_danada`).
6. **Devolución a proveedor** (`devolver_proveedor`): baja el inventario y la deuda 421.
7. **Insumos del Taller** (compra de tela y avíos, y su consumo al cortar): una clase de activo
   que el plan de 25 cuentas no tiene.

## Qué se construye (y en qué tarea)

| Pieza | Tarea |
|---|---|
| `cuentas` (25, archivables) · `parametros_tributarios` (IGV 18% con vigencia; hoy está fija en 4 archivos del cliente) | 4 |
| `fn_asientos` con las reglas de ventas (Yape/Plin/transferencia → 104, tarjeta → 105, efectivo → 101), costo, merma y anulaciones | 4 |
| `gastos` (categoría cerrada, sede, comprobante, método) y campo de flete en `compras` | 5 |
| `saldos_iniciales` (capital y saldos de apertura, una sola vez, líder) · `fn_balance_general` · `fn_conciliacion_contable` | 6 |
| Abonos de tarjeta al banco (regla 3, hoy sin fuente) · `fn_flujo_efectivo` | 7 |
| `periodos` (con `ubicacion_id` nulo para el consolidado) · `asientos` · `asiento_lineas` · `cerrar_periodo` · `reabrir_periodo` · bloqueos por fecha | 8 |
| IGV mensual desde la cuenta 4011 | 9 |
| Regla de depreciación sobre `activos_fijos` | 10 |

## Preguntas abiertas

1. **Contador:** ¿régimen tributario de CAYLA, valor de la UIT que aplica, y si el Libro Diario
   electrónico ya es obligatorio este año? Es lo único que puede cambiar la decisión.
2. **Felipe:** ¿cuáles son los saldos de apertura (caja, banco, inventario, deuda) y de qué fecha
   se cortan? Sin eso el Balance no arranca.
3. **Felipe:** las dos suposiciones de la decisión 3 quedaron CONFIRMADAS (2026-09-18). Sigue pendiente confirmar la
   consecuencia: el Balance completo solo existe en el consolidado.
4. **Números reales:** correr `VERIFICAR-VOLUMEN-2026-09-18.sql` en producción para reemplazar
   los supuestos de arriba.

## Sin verificar todavía

- El rendimiento de `fn_asientos` sobre 3 años de historia no se midió; los supuestos dicen que
  cabe, y los meses cerrados se leen de tablas materializadas, no se recalculan. Se mide en la
  tarea 4 con datos simulados antes de dar el estado por bueno.
- La cifra "72% del umbral" viene del estudio del 2026-07-19 y del SINATRA; no de producción.
