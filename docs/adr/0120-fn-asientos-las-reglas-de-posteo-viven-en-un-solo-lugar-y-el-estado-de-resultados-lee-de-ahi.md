# ADR-0120 — `fn_asientos`: las reglas de posteo viven en un solo lugar y el Estado de Resultados lee de ahí

**Fecha:** 2026-09-19
**Estado:** **CONSTRUIDO** (tarea 4 del plan de finanzas), sobre el modelo que Felipe aprobó en el ADR-0109. Las migraciones
existen en el repo y **aún NO están aplicadas en producción**. Las decisiones de detalle de abajo las tomé yo por defecto
al construir (el ADR-0109 fijó el modelo, no cada regla): están marcadas y Felipe puede objetarlas.
**Afecta:** tablas nuevas `cuentas` y `parametros_tributarios`; funciones `fn_tasa_igv`, `fn_asientos`,
`fn_asientos_descuadrados`, `fn_estado_resultados` (más tres ayudantes internos); pantalla `/finanzas/resultados`; una
llave foránea nueva de `categorias_gasto.cuenta_pcge` hacia `cuentas`. **No toca** ninguna operación de dinero
(`registrar_venta`, `anular_venta`, `aprobar_devolucion`, `registrar_cambio`, caja).
**Migraciones:** `20260918195000_cuentas_y_parametros_tributarios.sql`, `20260918196000_fn_asientos.sql`,
`20260918197000_fn_estado_resultados.sql`. **Dependen de** `20260918193000_gastos.sql` (ADR-0117): hay que aplicarlas después.
**Relacionado:** ADR-0109 (el modelo), ADR-0117 (gastos), ADR-0119 (permisos por defecto: revoke explícito).

## El problema

Felipe quiere ver «¿ganamos este mes?» por sede. El ADR-0109 decidió que los estados salen de un **diario derivado**
(`fn_asientos`) y no de un libro escrito por cada operación. Lo que faltaba era escribir ese diario: qué regla de posteo
tiene cada cosa que pasa en CAYLA, y probar que los números salen bien.

## Decisión

**DECIDÍ:**

1. **Las reglas de posteo viven en una sola función SQL, `retail.fn_asientos(desde, hasta, sede)`**, que LEE las tablas de
   origen y GENERA las líneas debe/haber, cada una con su `origen_tabla` y `origen_id`. No guarda nada. El Estado de
   Resultados (`fn_estado_resultados`) lee **solo** de ahí: no repite ninguna regla. El día que salga el Balance, leerá del
   mismo diario.
2. **Seis reglas en esta tarea:** venta, anulación, devolución, cambio, merma y gasto (tabla abajo). Compras, pagos a
   proveedor, depósitos, abonos de tarjeta, depreciación y Taller quedan para las tareas 5-7, 10 y 12: **mientras no estén,
   este diario alcanza para el Estado de Resultados pero NO para un Balance.**
3. **`cuentas` y `parametros_tributarios` son la única casa** de «qué cuentas existen» y «qué tasa de IGV rige en una fecha».
   La tasa tiene vigencia y solo se agregan filas: un mes pasado no cambia cuando cambia la tasa.

**DESCARTÉ:**
- **Calcular el Estado de Resultados directo sobre `ventas`/`gastos` sin diario** (opción B del ADR-0109): repite la regla de
  cada cifra en cada pantalla, y el Balance y el Flujo de efectivo terminarían con su propia versión de «venta neta».
- **Reglas en TypeScript**: dos implementaciones de una misma regla (pantalla y base) es como nacen números distintos.
- **Valorizar la devolución por `reembolso_monto`**: es un campo libre y puede ser NULL; el ingreso que se revierte es el
  valor de las líneas devueltas.
- **Agregar índices por fecha a `ventas` y `movimientos`**: no hacen falta (medido, abajo) y tocan tablas de dinero.
- **Separar 7011 y 7012 (ventas del Taller)**: exige saber el origen de cada prenda; hoy todas las ventas caen en 7011 y
  la pantalla lo declara.

**SE ROMPE SI:**
1. Alguien agrega un **tipo de operación de dinero nuevo** sin su regla en `fn_asientos`: ese dinero no aparece en ningún
   estado y **nada falla**. La defensa es `fn_asientos_descuadrados` (detecta las que sí tocan una cuenta) y la conciliación
   contra las fuentes de la tarea 6; no detecta una operación que ninguna regla mira.
2. `venta_pagos` no suma lo mismo que las líneas de la venta (nada lo obliga después del insert): el asiento queda
   descuadrado y **la pantalla lo avisa en rojo**. Esta es la primera consulta que Felipe debe correr en producción.
3. Un mes ya cerrado (tarea 8) recibe un gasto o una anulación con fecha de ese mes: sin el bloqueo por período, el mes
   cerrado divergiría de su hash. Hoy no hay cierre: la pantalla lo dice.
4. El contador confirma que una regla es distinta (p. ej. que los faltantes de conteo no van a 659, o que la devolución de
   una prenda dañada se reconoce antes): se cambia en UN lugar (`fn_asientos`) y todas las pantallas se corrigen a la vez.

## Las reglas (una fila por regla; el debe/haber completo está en la migración)

| Regla | Cuándo se asienta | Qué hace |
|---|---|---|
| `venta` | día de la venta (Lima) | cobro por método (101 efectivo · 104 yape/plin/transferencia · 105 tarjeta) contra 7011 + 4011; costo sellado 691 contra 201 |
| `anulacion` | día en que se **anula** | revierte ingreso, IGV y cobro; el costo vuelve a 201 si la prenda es vendible, o pasa a 659 (merma) si no |
| `devolucion` | día de aprobación | revierte ingreso e IGV por el valor de las **líneas** devueltas; el costo vuelve a 201 (la prenda regresó al inventario, aunque sea a cuarentena) |
| `cambio` | día del cambio | la diferencia de precio (o su reversa) y el ajuste de costo entre prenda vieja y nueva |
| `merma_*` | día del movimiento | 659 contra 201, valorizada al costo **de esa fecha** |
| `gasto` | fecha del pago | cuenta de su categoría (+ 4011 si trae IGV) contra 101 (efectivo) o 104 |

## Convenciones que todo lector del diario debe conocer

- **Fecha de Lima**, no la del servidor (UTC): una venta a las 23:30 de Lima del 30-sep es 1-oct para la base. Se prueba con
  la base fijada en UTC.
- **Precios con IGV.** La base es `total − round(total − total/(1+tasa), 2)`: el IGV se redondea primero, igual que
  `registrar_venta` y `desgloseIgv`, para cuadrar al centavo con el comprobante.
- **`costo_unitario = 0` es «sin costo cargado», no «costó cero».** Esas líneas no aportan costo y la pantalla cuenta cuántas
  prendas son y avisa que el margen está inflado. Vale igual para mermas sin valorizar.
- **Reversas en el mes del HECHO**, no en el de la venta original: una devolución de septiembre sobre una venta de agosto
  baja septiembre. Así un mes cerrado no cambia retroactivamente. *(Decisión por defecto; convención contable estándar.)*
- **Sede de la venta original** para anulaciones, devoluciones y cambios (mismo criterio que `fn_resumen_variantes`), no la
  sede donde se procesaron.
- **Un gasto sin sede es «de la empresa»** y solo aparece en el consolidado.

## Decisiones por defecto que Felipe puede objetar

1. **Alcance:** la tarea decía «hasta margen bruto». Incluí los **gastos** y llego a **utilidad operativa**, porque ya
   existen (ADR-0117) y «¿ganamos este mes?» no se responde sin ellos. Quitarlos es ocultar una sección.
2. **Faltantes de conteo cuentan como merma; los sobrantes no.** Es plata que dejó de estar; un sobrante no se reconoce hasta
   que alguien explique de dónde salió. Es una línea aparte (`merma_conteo`) y se ve en «De dónde salen».
3. **Devolver al proveedor NO es merma** (`cuarentena_devuelta_proveedor`): es un reclamo, no una pérdida.
4. **Una anulación con prenda no vendible** mueve el costo de 691 a 659: el margen total no cambia, pero la pérdida se ve
   como merma y no escondida en el costo.
5. **El plan de cuentas tiene 26**, no 25: el manual dice «25» y enumera 26; sembré las 26.
6. **Fletes (609) y depreciación:** no hay fuente. La pantalla muestra «sin registrar», no un cero.

## Números medidos (`scripts/pruebas/estado_resultados_volumen.mjs`, datos simulados con las proporciones del ADR-0109)

Con **51 mil tickets, 85 mil líneas, 100 mil movimientos y 5,4 mil gastos** (tres años):

| Consulta | Sin índices por fecha (producción hoy) | Con índices |
|---|---|---|
| Estado de Resultados de un mes | **168 ms** | 97 ms |
| Diario de un mes (7.224 líneas) | 63 ms | 41 ms |
| Diario de **tres años** (272 mil líneas; el ADR-0109 estimó 300-350 mil) | **1,0 s** | — |

Conclusión: **no se agregan índices**. Umbral para revisarlo: si el Estado de Resultados de un mes pasa de ~1 s con datos
reales. Es una simulación con las proporciones del ADR, **no producción**: `VERIFICAR-VOLUMEN-2026-09-18.sql` da los números reales.

## Verificación hecha (principio 7)

- **Prueba aislada con números calculados a mano** (`node scripts/pruebas/estado_resultados_aislado.mjs`, Postgres efímero
  fijado en UTC, sin Docker): **53 verificaciones** — cada regla, las fronteras de mes en hora de Lima (23:30 del 30-sep
  cuenta en septiembre; 00:10 del 1-oct no; 23:50 del 31-ago no), anulaciones en el mes del hecho, devolución valorada por
  líneas, costo de la fecha, mermas (y lo que NO es merma), gastos (anulados y de otro mes no), el consolidado, los avisos,
  permisos, y que **cambiar la tasa de IGV no mueve un mes pasado**. La suma cobrada del diario coincide con `venta_pagos`.
- **15 mutantes, 15 detectados:** límites en UTC, IGV sin redondear, anulación en el mes de la venta, prenda no vendible
  sin pasar a merma, devolver a proveedor como merma, merma al costo actual, gastos anulados, devolución por
  `reembolso_monto`, devolución pendiente, consolidado sin «De la empresa», sin exigir líder (dos capas), parámetros
  editables, permisos abiertos, cuenta inexistente. **Dos sobrevivieron al principio y enseñaron algo:** una Mac en hora de
  Lima ocultaba el error de zona horaria (ahora la prueba fija UTC), y la defensa en profundidad enmascaraba un chequeo de
  líder (ahora se exige el mensaje de cada capa).
- **Rendimiento medido** (tabla de arriba).
- **13 pruebas de las reglas de pantalla**; `typecheck`, `lint` y la suite completa en verde.
- **Pantalla en el navegador con los mismos números de la prueba SQL**, sin base. Encontré y corregí: el porcentaje con
  guion en vez de signo menos, y «De la empresa» mostrando cinco ceros sin sentido (ahora solo gastos y por qué).
- **Corregí antes de probar** un error de diseño propio: la merma anterior al primer cambio de costo se valorizaba con el
  costo **actual**; ahora usa el costo que regía (`costo_anterior`), y hay un mutante que lo cubre.

**NO verificado:** datos reales; la `fn_es_lider` verdadera; y **la verificación que pidió Felipe** —elegir un mes con
ventas reales y cuadrar contra la suma de cierres de caja—, que solo se puede hacer con producción. Ojo con esa
comparación: `cerrar_caja` **excluye** las ventas anuladas y `getResumenCaja` (TypeScript) **las incluye**; el diario sigue
a `cerrar_caja`. Y los tipos de `packages/database/src/types.ts` están escritos a mano con el formato del generador.

## Hallazgos de datos (no pedidos; afectan qué tan confiables serán las cifras)

1. **La nota de crédito de una devolución ignora el descuento** (`aprobar_devolucion` usa `precio_unitario × cantidad`): sobre
   una línea con descuento, el documento fiscal devuelve más de lo cobrado. El diario usa el valor real de la línea, así que
   contable y fiscal pueden diferir. No lo toqué.
2. **`cambios.diferencia` ignora el descuento original y las campañas de la prenda nueva**; el diario toma la diferencia tal
   cual la cobró la caja.
3. **`venta_pagos` no suma necesariamente las líneas** de su venta; nada lo obliga después del insert. Es el descuadre que
   la pantalla avisa.
4. **Faltantes de traslado** (`cerrar_traslado_con_diferencia`) no dejan un movimiento de baja: no entran como merma.
5. **El costo promedio mezcla bases**: una compra con boleta guarda el costo con IGV y una con factura sin IGV.
6. **`1.18` está escrito a mano en más de doce sitios** (SQL y pantallas). `parametros_tributarios` es su casa nueva, pero
   solo el diario la usa hoy; migrar el resto es trabajo aparte.

## Pendiente

1. **Correr `docs/datos/VERIFICAR-ESTADO-RESULTADOS-2026-09-19.sql` en producción** (solo lectura): confirma que existen las
   columnas y funciones que lee el diario y cuenta los descuadres y las líneas sin costo **antes** de pegar nada.
2. **Aplicar las tres migraciones en producción** (después de `20260918193000_gastos.sql`; ya llevan `retail.`), con ok de Felipe.
3. **Verificar contra un mes real** y contra la suma de cierres de caja (arriba, con la salvedad de las anuladas).
4. **El contador** confirma las reglas de mermas y la cuenta de cada categoría de gasto.
5. Tareas 5-7 y 10 completan el diario (compras, pagos, depósitos, tarjeta, depreciación); la 8 lo congela con el cierre.

## Cómo se deshace

`drop` de las funciones, `cuentas` y `parametros_tributarios`, y de la llave foránea de `categorias_gasto`. Sin pérdida de
dinero: el diario no guarda nada y ninguna operación de dinero se tocó.

## Actualización 2026-09-25 — construido en ADR-0195 F5 (traído del PR #170 a `main`)

Este ADR y el ADR-0109 vivían solo en el PR #170, sin fusionar. En la fase F5 de Finanzas (ADR-0195) se traen tal cual y se
construyen **adaptados a lo que hoy existe en producción**. Lo de arriba queda como historia; manda esto:

- **Migraciones:** las tres del PR #170 (`20260918195000/196000/197000`) **no se usan**. El plan de cuentas y la tasa de IGV
  entraron con F2a (`20260924235000`); el diario, el Estado de resultados y Campañas son **una sola migración nueva,
  `20260925130000_finanzas_diario_y_estado_de_resultados.sql`**.
- **Reglas nuevas en `fn_asientos`** (además de las seis de arriba): separaciones (adelanto a la 122 con el IGV de su boleta
  de anticipo, y su devolución), gastos con comprobante (a la 421), facturas de mercadería, notas de crédito de proveedor,
  pagos y reembolsos de proveedor, activos fijos (alta, depreciación 681 contra 391, baja 655) y la planilla de Dynamic (62
  contra 41). El lado de caja o banco sale de `fn_asiento_cuenta_de_medio`: un solo lugar, para que F3 lo cambie por la
  cuenta sellada.
- **Permisos:** ya no es «solo líder». El líder ve todo y el consolidado; con el módulo «Reportes financieros», su tienda
  (`fn_diario_ubicaciones`). La planilla entra solo si quien mira puede verla en Dynamic (`public.fn_es_admin_o_lider()`).
- **Firma:** `fn_estado_resultados(desde, hasta, ubicación)` en lugar de `(mes)`.
- **Pruebas:** `scripts/pruebas/estado_resultados.mjs` (71 verificaciones en la base local, con ROLLBACK). Porta las del PR
  #170 y mide el volumen con un año de datos.
- Detalle, las reglas de posteo una por una para el contador y lo que queda pendiente: `docs/finanzas/fases/F5.md`.
