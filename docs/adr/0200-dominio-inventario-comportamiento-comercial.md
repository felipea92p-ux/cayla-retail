# ADR-0200 — Dominio de Inventario: comportamiento comercial reconstruido sobre la definición canónica de Felipe

**Fecha:** 2026-09-24 · **Estado:** aplicado (fusionado en el PR #397; sus 2 migraciones, `20260924010700` y `20260924030000`, están en
producción — verificado por efectos en la base el 2026-09-25; la línea anterior decía «nada aplicado a producción») ·
**Sucede a:** [ADR-0199](0199-comportamiento-comercial-piso-vs-almacen.md) — no lo reemplaza en la bitácora, lo **corrige**:
0179 fue la primera versión, escrita ANTES de recibir la definición canónica de Felipe. Una auditoría de 8 hallazgos
independientes (2026-09-24, self-encargada) encontró que esa primera versión contradecía el modelo en sus dos puntos
más importantes — el reloj de exposición se reiniciaba en vez de pausar/reanudar, y la rotación estaba en soles en
vez de en unidades — además de un bug real, ya vivo en producción, no introducido por 0179. Este documento es la
autoridad vigente; 0179 queda como registro histórico de qué se intentó primero y por qué no alcanzaba.

## Por qué existe este ADR aparte

Felipe fue explícito: *"lo implementado anteriormente NO tiene prioridad por el hecho de existir... si hace falta
crear una nueva implementación de dominio y retirar la anterior de esta pantalla, hazlo"*. Antes de tocar código se
corrió una auditoría de dominio (8 agentes independientes, cada uno comparando una capa del código real contra el
modelo canónico, con cita exacta de archivo:línea) — no para planificar, sino para no confiar en mi propio trabajo
de hace unas horas. La auditoría completa vive en el journal de esa sesión; este ADR resume sus hallazgos que
importan y documenta la reconstrucción que resultó.

## 1. Un bug real en producción, encontrado de paso (no introducido hoy)

Cuando una sede separa piso/almacén, un movimiento cuyo `sububicacion_id` no resuelve a un tipo conocido quedaba en
CERO tanto en el bucket de piso como en el bucket TOTAL de `efectos_clase` — el total también, no solo el piso. La
migración de activación piso/almacén **ya aplicada en producción el 2026-09-14** insertó, con ese patrón exacto
(`sububicacion_id = NULL` en el origen), 711 unidades entre AQP (288) y TRU (423) — por el defecto, el bucket total
quedó inflado en esa cantidad para cualquier ventana de análisis que incluya esa fecha (hasta ~2028-09-14). Esto
afecta también columnas YA existentes desde ADR-0138 (`a_stock_inicio`/`a_stock_cierre`), no solo las nuevas de hoy:
Comparar períodos en producción, hoy, muestra un stock total inflado para AQP/TRU en cualquier ventana que cruce esa
fecha. **Corregido en la lógica local** (no en los datos — el fix no necesita backfill, corrige la reconstrucción,
no lo insertado). **Aplicar esta corrección a producción es una decisión de Felipe, no tomada aquí.**

También se corrigió una afirmación falsa del propio ADR-0199: atribuía los N/D de Tienda Lima al 55% de movimientos
sin `sububicacion_id` — verificado empíricamente contra la base local, esos movimientos son 100% del Taller (que no
separa piso/almacén) y 0% de Lima/Trujillo. La causa real es exposición insuficiente (muestra limitada), no datos
faltantes.

## 2. Qué lógica anterior se conservó

- `rotacion.ts` completo, sin una línea tocada: sigue siendo la única fuente de la rotación CONTABLE (COGS ÷
  inventario a costo) para el KPI de arriba, el ranking «Top rotación» y la columna «Rotación» de Comparar-Detalle.
  Felipe lo pidió explícitamente: *"esa puede ser una rotación contable válida para otra finalidad. No la destruyas
  si es usada correctamente en otro contexto"*.
- `resumen-reglas.ts` (`calcularVelocidad`, `calcularSellThrough`, `calcularTendencia`): la auditoría confirmó que
  YA conformaban con el modelo nuevo — Ritmo observado ya dividía por días con stock EN PISO, Tendencia ya
  distinguía «sin exposición» de «exposición completa sin ventas» (nunca «estable» por accidente). Cero cambios.
  Hay un test explícito para esto (`resumen-desempeno.test.ts`, «Caso H»).
  «Sin venta»/exposición sin vender de `fn_resumen_comparacion` (`exposicion_sin_venta`, SQL): YA sumaba
  intervalos crudos de piso (nunca cohortes), así que YA era pausa/reanuda-correcto desde el primer día — el
  reinicio del reloj vivía SOLO en el módulo de cohortes de sell-through, no acá.
- La conservación de CANTIDAD del piso→almacén→piso (nunca contar 14 cuando son 10): el mecanismo que resta de
  `cantidadInicial` en una salida sin venta seguía correcto y se conservó tal cual, ahora combinado con el reloj
  de exposición corregido.
- `esSobrestockTotal`, `ritmoMuestraLimitada`, `tuvoQuiebreEnPiso`: sin cambios de fórmula (solo ahora reciben
  insumos en unidades en vez de mezclados con soles).
- Toda la reconstrucción SQL pesada (intervalos, días con stock, promedios ponderados por tiempo): se mantiene la
  arquitectura (SQL para la reconstrucción del ledger, TypeScript para la secuencia/semántica comercial — sección
  24 del pedido), con las correcciones puntuales descritas abajo.

## 3. Qué lógica anterior se reemplazó, y por qué

| Qué | Antes (0179) | Ahora | Por qué |
|---|---|---|---|
| Reloj de exposición | `armarCohortes` abría una cohorte NUEVA (reloj en 0) cada vez que una cantidad volvía al piso | El reloj se PAUSA al salir a almacén y CONTINÚA al volver — nunca se reinicia | Contradecía la sección 5 del pedido textualmente; confirmado con los 3 tests numéricos (casos J, K) que antes daban el número equivocado |
| Rotación piso/total | `calcularRotacion` de `rotacion.ts`: COGS (soles) ÷ inventario a costo | `rotacionUnidades`: unidades vendidas ÷ unidades promedio — nunca costo | Sección 14: *"Nunca: moneda / unidades"*. El propio ADR-0199 admitía la fórmula contable en su texto |
| Promedio de piso | Área ÷ TODOS los días del período (diluido) | Área ÷ SOLO los días con stock en piso | Sección 15: diluir con días sin piso castiga dos veces la poca exposición (ya lo dice «muestra limitada») |
| Bucket «total» ante sub_tipo NULL | Contaba 0 (mismo defecto que «piso») | Cuenta el movimiento igual (nunca depende de resolver piso/almacén) | Sección 17: el total debe poder reconstruirse aunque la separación puntual no se sepa — y es el bug de producción de la sección 1 |
| «Es venta» | Definida dos veces, con criterios levemente distintos, en la misma función SQL | Una función `retail.fn_es_venta_de_stock`, reutilizada en los dos lugares | Sección 24 / integridad conceptual: dos definiciones de la misma regla de negocio pueden desalinearse sin que ningún test lo note |
| Liquidación de prenda dañada | Excluida de «Vendido»/COGS (`motivo='cuarentena_liquidada'` no matcheaba ninguna clase) | Cuenta como venta, siempre | Felipe ya lo había ordenado el 2026-09-17 («totalmente»); ninguna versión anterior lo cumplía — bug preexistente, no introducido hoy |
| Lectura del período (Desempeño) | 10 reglas propias, sin corresponder 1:1 con ninguna definición dada | Las 7 categorías canónicas A–G, con el texto EXACTO del pedido | Sección 22: la auditoría encontró textos y hasta condiciones de disparo distintas a lo pedido en 5 de 7 categorías |
| «Cambió el ritmo» en Lectura | Repetía literalmente lo que ya dice la columna Tendencia (contradecía su propio comentario de cabecera) | Retirada de Lectura; Tendencia sigue siendo la única columna que habla de aceleración/desaceleración | El propio código se contradecía a sí mismo (comentario vs. implementación) — hallazgo de la auditoría |

Los tests que protegían la fórmula vieja (rotación en soles disfrazada de «piso», el reset del reloj) se
**reemplazaron junto con la lógica**, no se conservaron como red de seguridad — tal como pidió Felipe explícitamente
en la sección 1.

## 4. Archivos nuevos que representan la capa de dominio reutilizable

- **`apps/web/lib/inventario-exposicion.ts`** (nuevo — renombrado desde `resumen-exposicion.ts`, reescrito por
  completo). Prefijo `inventario-`, no `resumen-`, a propósito: la auditoría confirmó que ese es el patrón real del
  repo para «dominio de Inventario reutilizable» (`inventario-reglas.ts`, `movimientos-reglas.ts`, ambos con el
  mismo prefijo y la misma separación reglas-puras/servidor). Contiene:
  - `EventoPiso` (tipo, ahora con `esMovimientoInterno`) — antes vivía en `resumen-comparacion.ts` (acoplado a la
    comparación de dos períodos); ahora es del dominio, y `resumen-comparacion.ts` lo re-exporta para no romper a
    los 5 archivos que ya lo importaban de ahí.
  - `armarCohortes`/`Cohorte`/`sellThroughExposicion`: el reloj de exposición con pausa/reanudación.
  - `rotacionUnidades`/`RotacionUnidades`/`MotivoSinRotacionUnidades`: la rotación en unidades, con su propio tipo
    (nunca el `Rotacion` de `rotacion.ts`, que es en soles).
  - `ritmoMuestraLimitada`, `esSobrestockTotal`, `tuvoQuiebreEnPiso`: sin cambios de fórmula, movidos aquí.
- **`apps/web/lib/inventario-exposicion.test.ts`** (nuevo, reescrito por completo — 24 pruebas).

No se creó una carpeta `lib/inventario/`: la auditoría confirmó que NINGÚN dominio del repo usa subcarpetas (16
dominios, todos archivo plano con prefijo) — crear una habría sido la única cosa realmente nueva de convención, y
no hacía falta.

**Pendiente, señalado por la propia auditoría, no resuelto hoy (fuera del alcance de esta tarea):** no existe
todavía una primitiva compartida `fn_ledger_stock(variante, ubicación, sububicación, desde, hasta)` que Existencias,
Movimientos y Análisis puedan consultar sin reimplementar cada una su propia reconstrucción del ledger — Análisis
sigue teniendo la suya, independiente de `fn_movimientos` (Movimientos) y del snapshot `stock` (Existencias). Es una
oportunidad real de unificación, correctamente fuera del alcance de "arreglar Análisis hoy".

## 5. Contrato de datos SQL ↔ dominio

`retail.fn_resumen_comparacion` (misma firma, mismas columnas existentes intactas) agrega, sin romper nada:
`a/b_piso_promedio`, `a/b_total_promedio` (unidades, ponderados por tiempo — piso ahora SOLO sobre días con stock;
total sobre todo el período), `ultima_venta_en`, `piso_expuesto_desde_ultima_venta_dias`, `piso_eventos` (jsonb:
`{ts, delta, esVenta, esMovimientoInterno}[]`). Nueva función auxiliar `retail.fn_es_venta_de_stock(tipo, motivo,
cambio_id, venta_item_id, venta_estado)` — la única fuente de «es venta», reutilizada en dos CTEs de la misma
función (antes, dos definiciones separadas). La reconstrucción pesada del ledger (intervalos, promedios) vive
enteramente en SQL; el FIFO de cohortes, la clasificación de quiebre y la rotación en unidades viven enteramente en
TypeScript — sin ninguna fórmula duplicada entre los dos lados (verificado por la auditoría, único hallazgo de
duplicación fue el de «es venta», ya corregido).

## 6. Fórmulas definitivas

- **Vendido** = `ventasNetas` (ventas − devoluciones), sin ajuste por exposición.
- **Exposición** (el reloj) = suma de intervalos de piso CERRADOS (`segundosAcumulados`) más el tramo ABIERTO
  actual si sigue expuesta; se PAUSA (no se pierde) mientras está en almacén y CONTINÚA al volver.
- **Ritmo observado** = `ventasNetas ÷ días con stock en PISO` (sin cambio — `calcularVelocidad`).
- **Sell-through de exposición** = `Σ vendido de cohortes MADURAS ÷ Σ tamaño de esas cohortes`; madurez = 7 días de
  exposición ACUMULADA (con pausas) o venta total, lo que ocurra primero.
- **Inventario promedio de piso** = `Σ(stock_piso × duración) ÷ Σ(duración de los intervalos con stock_piso > 0)`
  — nunca diluido con los días sin piso.
- **Inventario promedio total** = `Σ((stock_piso+stock_almacén) × duración) ÷ duración TOTAL del período` — aquí sí
  importa todo el período.
- **Rotación piso** = `unidadesVendidas ÷ inventarioPromedioDePiso` (unidades, nunca soles).
- **Rotación total** = `unidadesVendidas ÷ inventarioPromedioTotal` (unidades, nunca soles).
- **Sin venta** = intervalos de piso con stock desde la última venta (o desde el inicio de la ventana reconstruida
  si nunca vendió) hasta ahora — ya era pausa/reanuda-correcto (mecanismo de intervalos crudo en SQL).
- **Tendencia** = `calcularTendencia` sobre el Ritmo OBSERVADO (no ventas brutas) de cada mitad — sin cambio.

## 7. Cómo funciona el reloj piso → almacén → piso

`armarCohortes` (`inventario-exposicion.ts`) mantiene cohortes con `{ts, cantidadInicial, cantidadRestante,
segundosAcumulados, abiertaDesde}`. `abiertaDesde` no nulo = expuesta ahora, su reloj corre; nulo = pausada, su
reloj está congelado en `segundosAcumulados`. La señal que decide si una entrada es un REGRESO (reanuda una
cohorte pausada, FIFO más vieja primero) o stock GENUINAMENTE NUEVO (abre cohorte con reloj en 0) es
`esMovimientoInterno`, calculada en SQL desde `motivo = 'movimiento_interno'` — el único camino real piso↔almacén
(`mover_interno()`). Una cohorte puede tener SOLO PARTE de su cantidad pausada/reanudada: en ese caso se divide en
dos objetos que heredan la misma historia (`ts`, `segundosAcumulados`), y si ya tenía ventas parciales antes de
pausarse, `cantidadInicial` se reparte proporcionalmente entre las dos mitades (una aproximación documentada: no
hay forma de saber cuáles unidades exactas se vendieron antes de cuáles se pausaron, con stock fungible).

## 8. Qué ocurre cuando no existe trazabilidad suficiente

`mover_interno()` (el único camino piso↔almacén) no lleva `lote_id` ni ningún identificador de línea — confirmado
por la auditoría: **preservar exposición EXACTA por unidad física es imposible** con el modelo de datos actual
(stock fungible por variante, sin serial). La política de arriba es una aproximación DETERMINISTA por CANTIDAD, no
por identidad física, y así queda documentada — nunca se presenta como exactitud que no existe. `SellThroughExposicion.estimado` (booleano, nuevo) es `true` apenas la ventana de eventos incluye algún
`esMovimientoInterno` — la señal explícita de «esto pasó por la política de aproximación», visible para quien
consuma el resultado sin tener que inspeccionar los eventos crudos.

## 9. Confirmación: las rotaciones nuevas son dimensionalmente unidades/unidades

`rotacionUnidades(unidadesVendidas: number, unidadesPromedio: number | null): RotacionUnidades` no recibe ni toca
costo en ningún punto — ni como parámetro, ni importado de `rotacion.ts`. Probado explícitamente (caso M,
`resumen-comparacion.test.ts`): con un costo histórico de venta (100/u) deliberadamente distinto del costo vigente
(40/u), `rotacionPisoUnidades`/`rotacionTotalUnidades` no se mueven ni un decimal — si estuvieran calculando en
soles por accidente, ese desfase las habría delatado.

## 10. Qué ocurre con la rotación contable (COGS) existente

Sin cambios, sin romperse, sin mezclarse. `rotacion.ts` sigue siendo la fuente de `MetricasPeriodo.rotacion`/
`baseRotacion` (soles) — el KPI «Rotación» de arriba (Desempeño y Comparar), el ranking «Top rotación» y la columna
«Rotación» de Comparar-Detalle siguen usándola exactamente igual (probado: caso N, con costo histórico ≠ vigente,
`rotacion` y `rotacionTotalUnidades` dan números distintos a propósito, confirmando que son dos métricas separadas
que conviven).

## 11. Ventas sin piso: confirmado que no son posibles, con evidencia exacta

`registrar_venta` resuelve la sububicación UNA sola vez con `fn_sububicacion_por_defecto(ubicacion_id, 'venta')`
(siempre `piso_venta`) y la usa para TODO el carrito — no existe parámetro para overridearla. `fn_aplicar_movimiento`
valida el stock disponible exactamente en esa sububicación: si el piso tiene 0, la venta falla con «Stock
insuficiente», nunca cae en silencio a almacén. `registrar_cambio` y la entrega de separaciones siguen el mismo
patrón. El único camino que permite fijar otra sububicación (`apartar_stock`, `p_sububicacion_id`) solo mueve una
reserva, nunca escribe `motivo='venta'` — la venta real posterior siempre vuelve a pasar por `registrar_venta`
(piso). Confirmado con cita de archivo:línea en la auditoría de dominio.

## 12. Por qué Rotación total puede calcularse sin `sububicacion_id`, y Rotación piso no

`baseRotacionPiso`/`rotacionPisoUnidades` dependen de `d.pisoPromedio`, que solo existe cuando el movimiento
resolvió a `piso_venta`. `rotacionTotalUnidades` depende de `d.totalPromedio`, que (tras la corrección de la
sección 1) cuenta CUALQUIER movimiento que no sea cuarentena, resuelva o no a piso/almacén específicamente. Por
construcción: sin `sububicacion_id` resuelta, «Rotación piso» es N/D (`motivo: "sin_inventario"`) mientras «Rotación
total» sigue siendo calculable — probado explícitamente (caso O).

## 13. N/D exacto de cada métrica

- **Ritmo observado**: N/D si la exposición en piso es < `MIN_DIAS_CON_STOCK_VELOCIDAD` (3 días).
- **Sell-through de exposición**: `pct: null` si ninguna cohorte maduró todavía (nunca 0% inventado).
- **Rotación piso/total**: `calculable: false, motivo: "sin_inventario"` si el promedio no es positivo (nunca tuvo
  ese inventario, o el ledger no cuadra).
- **Sin venta**: N/D si no hay historial suficiente para reconstruir ningún intervalo de piso.
- **Tendencia**: N/D si cualquiera de las dos mitades no tiene exposición suficiente — nunca «estable» por defecto.
- **Lectura del período**: G explícito («No hay historial suficiente para una lectura fiable») cuando NADA de lo
  anterior es calculable — ya no es una celda vacía sin explicar.

## 14. Tests nuevos/modificados

- `inventario-exposicion.test.ts` (nuevo, 24 pruebas): cohortes con pausa/reanudación, casos E, F, J, K, Q (con y
  sin venta posterior), N/D, `rotacionUnidades`, `ritmoMuestraLimitada`, `esSobrestockTotal`, `tuvoQuiebreEnPiso`.
- `resumen-comparacion.test.ts` (+4 pruebas): casos M, N, O, y N/D sin ledger consistente para las rotaciones en
  unidades.
- `resumen-desempeno.test.ts`, `resumen-lectura.test.ts`: reescritos donde protegían la fórmula vieja (rotación en
  soles disfrazada, reset del reloj), con las 7 categorías A–G probadas explícitamente contra el texto exacto del
  pedido, incluida la frontera C vs. D (exposición suficiente vs. limitada) y G (datos insuficientes).

## 15. Resultado completo de tests

**24,267 pruebas, 118 archivos, 0 fallas.** Typecheck limpio. Lint limpio (`eslint .` sobre todo `apps/web`, cero
avisos).

## 16. Verificación local

SQL: la corrección del bucket total se verificó con `psql` contra la base local — con el fix, un evento
`sub_tipo=NULL` (origen) + `almacen_tienda` (destino) neta exactamente 0 en el bucket total (antes, +cantidad
fantasma). El promedio de piso no diluido se verificó: una variante sin exposición en el período A ahora da
`a_piso_promedio: NULL` en vez de un número diluido a casi cero. En el navegador (Tienda Lima, sesión real de
Felipe, servidor local puerto 3020): las 9 columnas de la tabla renderizan con los tooltips actualizados
(«EN UNIDADES», nunca «COGS»), Rotación piso y Rotación total muestran números coherentes en unidades, y la
Lectura del período muestra el texto EXACTO de Felipe para F («La reposición reciente aún no tuvo exposición
suficiente para evaluarse») y D («Hay inventario disponible, pero poca exposición en piso; revisar reposición»,
con el tooltip mostrando la comparación estática «0 de 30 días»). Comparar períodos se probó aparte y sigue
funcionando exactamente igual (deliberadamente no tocado). Sin errores de consola ni de red actuales (los únicos
errores vistos fueron residuales de un estado intermedio del hot-reload durante la edición, confirmado stale por
timestamp y por la carga exitosa posterior).

## 17. Migraciones/RPC locales

Un solo archivo, editado en el lugar (no se creó una segunda migración, ya que la primera nunca se aplicó a
producción): `supabase/migrations/20260924010700_analisis_comercial_piso_almacen.sql`. Aplicada y probada
exclusivamente en el Postgres LOCAL (Docker de este worktree). Nueva función `retail.fn_es_venta_de_stock`.
`fn_resumen_comparacion` recreada (mismo patrón `drop` + `create or replace` que ya usaba la migración original,
porque Postgres no permite cambiar el tipo de retorno con un simple `create or replace`).

## 18. Qué queda pendiente para otras ventanas de Inventario

- La primitiva compartida de reconstrucción de ledger (sección 4, arriba) — Existencias y Movimientos siguen con
  su propio camino, sin colisión pero sin reutilizar tampoco.
- `lecturaComparacion` (Comparar períodos) sigue en el set de reglas anterior a propósito — no tiene piso/almacén
  por variante en su propio tipo (`AnalisisComparacion`) todavía. Extenderla con las mismas 7 categorías es un
  paso del mismo tamaño que este, preparado pero no ejecutado.
- El KPI/dona/filtro «Sell-through» de la cabecera de Desempeño sigue con la fórmula clásica (ventas ÷ todo el
  inventario) — Felipe pidió explícitamente NO unificar automáticamente (sección 27): "si ambas son útiles,
  mantén ambas con nombres inequívocos". Quedan así, deliberadamente.
- La corrección del bucket total (sección 1) no se aplicó a producción — decisión de Felipe, pendiente.
- Categorías «A. Saludable» y «C. Estancamiento» combinan señales con umbrales existentes reutilizados
  (`LECTURA_ROTA_LENTO_PCT`, `LECTURA_ROTA_LENTO_MIN_UNIDADES`, `LECTURA_SIN_VENTAS_DIAS_MIN`) — no se inventó
  ningún umbral nuevo, pero la combinación exacta es una interpretación razonada de la sección 19/22 del pedido,
  no una especificación numérica exacta de Felipe: si al verlo con datos reales la combinación no se siente
  correcta, es el punto más fácil de ajustar sin tocar el resto del dominio.

## 19. Confirmación explícita

Nada se aplicó a Supabase remoto/producción. No hay commits, no hay push, no hay PR, no hay merge — `git status`
en todo momento muestra solo cambios sin confirmar en el árbol de trabajo de este worktree. Ningún otro módulo,
pantalla o RPC fuera de lo descrito en este documento fue tocado.
