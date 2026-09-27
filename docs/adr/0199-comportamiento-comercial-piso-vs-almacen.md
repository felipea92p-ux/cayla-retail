# ADR-0199 — Comportamiento comercial de variantes: piso vs. almacén en Análisis de inventario

**Fecha:** 2026-09-24 · **Estado:** aplicado (fusionado en el PR #397; sus 2 migraciones, `20260924010700` y `20260924030000`, están en
producción — verificado por efectos en la base el 2026-09-25; la línea anterior decía «nada aplicado a producción») ·
**Amplía:** ADR-0138 (Análisis de inventario), ADR-0171 (lectura por reglas) · **Migración:**
`20260924010700_analisis_comercial_piso_almacen.sql` — aplicada en producción y **superada por `20260924030000`**
(ADR-0202): **no volver a pegarla sola**. Borra y recrea `fn_resumen_comparacion` sin las columnas de stock actual ni
`fn_ledger_puntos`, y la pantalla de Análisis que ya las lee se rompe.

## Contexto

Felipe pidió separar, en la tabla «Comportamiento del inventario» (Inventario ▸ Análisis ▸ Desempeño), dos preguntas que
antes se contestaban con las mismas cifras:

- **A) Comportamiento comercial** — cómo responde una variante donde una clienta realmente puede comprarla: el **piso**.
- **B) Gestión del inventario total** — cuánto se mueve todo lo que la tienda posee, esté expuesto o no: **piso + almacén**.

Mezclarlas produce lecturas falsas: un producto que agota el piso en dos días mientras 40 unidades duermen en almacén se
veía, con la rotación de siempre, como «rota poco». Una variante recién repuesta el último día del período diluía su
sell-through como si llevara todo el período sin venderse. Un traslado interno piso→almacén→piso podía leerse como una
venta. Y «sin ventas» se medía en días de calendario, no en los días en que la prenda realmente estuvo en el piso.

## Decisión

1. **`Vendido`** sigue siendo unidades netas del período, sin ajuste por exposición — es un conteo, no una tasa.
2. **`Ritmo observado`** (antes «Ritmo de venta»): la MISMA fórmula de siempre (`calcularVelocidad`, ventas netas ÷ días
   con stock en piso) — no era necesario reinventarla, ya dividía por piso. Se le agregó un aviso de **muestra
   limitada** (`ritmoMuestraLimitada`, `RITMO_MUESTRA_LIMITADA_FRACCION = 0.5`) cuando la exposición del período es
   menos de la mitad del período mismo, y el tooltip siempre dice «N de M días en piso» (`textoExposicionDias`).
3. **`Sell-through de exposición`** (antes «Sell-through», que era ventas ÷ todo el inventario): NUEVO módulo puro,
   `lib/resumen-exposicion.ts`, con cohortes FIFO sobre la secuencia de movimientos de piso. Una cohorte madura a los
   `SELL_THROUGH_EXPOSURE_WINDOW_DAYS = 7` días de exposición, o antes si se vende por completo; solo las cohortes
   maduras entran al %, las demás quedan como «N pendientes» aparte, sin diluir ni inflar nada.
4. **`Rotación piso`** y **`Rotación total`** (antes una sola «Rotación», que ya era la de piso+almacén — se renombra a
   «total» y se agrega la de piso): la misma fórmula de `rotacion.ts` (COGS ÷ inventario promedio a costo), alimentada
   con dos inventarios promedio distintos, ambos ponderados por TIEMPO (no por dos puntos).
5. **`Sin venta`**: tiempo EXPUESTO en piso sin una venta, no días de calendario — «Vendió hoy» / «1 día» / «N días
   expuesto» / «Nunca vendió». Se reconstruye en el mismo RPC que ya reconstruye piso/almacén.
6. **`Tendencia`**: sin cambios de fórmula — ya comparaba ritmos observados (piso) por mitad, así que ya heredaba
   automáticamente la corrección de exposición. Se blindó con una prueba explícita (antes no existía un caso que lo
   probara: ver «Cómo se verificó»).
7. **`Lectura del período`**: el motor de 7 reglas (ADR-0171) crece a 10, con 5 escenarios nuevos que se detallan abajo,
   además de un refuerzo de exposición en las dos reglas que ya existían («Se agotó», «Sin ventas con stock»).

### Consecuencia de diseño que decidí yo (no de negocio)

**El KPI, la dona y el filtro «Sell-through» de la cabecera de la pantalla (arriba de la tabla) NO se tocaron: siguen
midiendo el sell-through CLÁSICO** (ventas ÷ todo el inventario del período). Solo la fila de la tabla —lo que Felipe
pidió explícitamente, con nombre de columna incluido— pasó a exposición. Quedan dos números de nombre parecido en la
misma pantalla con fórmulas distintas: el filtro se relabeló a «Sell-through (total)» con un tooltip que lo explica, para
que nadie confunda uno con otro, pero **la inconsistencia conceptual sigue ahí**. Unificarlos (llevar KPI/dona/filtro/
orden también a exposición) es un cambio del mismo tamaño que este, con su propia agregación (Σ vendido-maduro ÷ Σ
disponible-maduro de todas las variantes) — lo dejo como decisión pendiente de Felipe, no lo decidí por mi cuenta porque
es una ampliación de alcance más allá de lo pedido, no una corrección.

## Las 5 reglas nuevas de `lecturaDesempeno` (y las 2 reforzadas), en su orden real

Antes que nada: `Estimada` (sin cambios). Después, en este orden:

1. **Reposición reciente** (nueva) — TODO el piso de hoy son cohortes sin madurar (`disponibleMaduro === 0 &&
   pendienteMadurez > 0`): no hay base para juzgar, ni bien ni mal, todavía.
2. **Agotamiento** (reforzada) — vendió y cerró en 0; si además la exposición fue corta (`muestraLimitada`), el detalle
   dice que el ritmo observado pudo quedar corto frente a la demanda real (no se presenta como demanda plena).
3. **Estancamiento** (reforzada, antes «Sin ventas con stock») — el umbral de 14 días (`LECTURA_SIN_VENTAS_DIAS_MIN`,
   sin cambiar) ahora se mide en días EXPUESTOS EN PISO, no días de calendario. Una variante con 30 días de período
   pero solo 2 en piso ya no se marca como estancada — es la corrección directa del caso «almacén con poca exposición».
4. **Problema de reposición** (nueva) — vende a buen ritmo (`ritmo > 0`, sin muestra limitada) pero el piso llegó a 0
   en algún momento del período reconstruido y luego repuso (`tuvoQuiebreEnPiso`, nueva función: nivel acumulado de
   `pisoEventos` que toca cero y luego vuelve a subir). Distinta del cierre agotado de HOY, que ya cubre la regla 2.
5. **Cambió el ritmo** — sin cambios (ya comparaba ritmos observados).
6. **Buen producto + sobrestock** (nueva) — `esSobrestockTotal`: la rotación total cae bajo la mitad
   (`SOBRESTOCK_ROTACION_TOTAL_VS_PISO = 0.5`) de la rotación en piso — vende bien lo expuesto, pero la mayor parte del
   inventario duerme en almacén.
7. **Saludable / vendió casi todo** — misma regla de siempre (≥ 80 %), ahora sobre el sell-through DE EXPOSICIÓN.
8. **Rota lento** — misma regla de siempre (< 15 % con 20+ u. al cierre), sobre exposición, y ahora exige
   `!muestraLimitada`: no se afirma «lento» con poca evidencia.
9. **Sin cambio relevante** — sin cambios.

`lecturaComparacion` (Comparar períodos) se dejó **deliberadamente** en el set de reglas anterior: su tipo
(`AnalisisComparacion`) no lleva todavía piso/almacén por variante. Extenderla es un paso simétrico a este, aparte.

## Fórmulas exactas

- **Ritmo observado** = `ventasNetas ÷ díasConStockEnPiso` (sin cambio; `calcularVelocidad`, `resumen-reglas.ts`).
- **Sell-through de exposición** = `Σ vendido de cohortes maduras ÷ Σ tamaño de cohortes maduras`, cohortes FIFO sobre
  `pisoEventos`, madurez = 7 días de exposición O venta total, lo primero que ocurra (`resumen-exposicion.ts`).
- **Rotación piso** = `COGS del período ÷ inventario promedio de PISO ponderado por tiempo` (misma `calcularRotacion`
  de `rotacion.ts`, alimentada con `BaseRotacion.inventarioPromedioTemporal` derivado de `piso_promedio`).
- **Rotación total** = `COGS del período ÷ inventario promedio de PISO+ALMACÉN ponderado por tiempo` (antes era de dos
  puntos `(inicio+cierre)/2`; sigue siendo la misma columna «Rotación» de siempre, solo mejor promediada).
- **Sin venta** = suma de intervalos con `stock_piso > 0` desde la última venta (o desde el inicio de la ventana
  reconstruida, si nunca vendió) hasta ahora — reconstruida en SQL, igual que «días con stock».
- **Tendencia** = `calcularTendencia` sobre el ritmo observado (piso) de cada mitad — sin cambio de fórmula.

## Fuente real de datos

Todo sale de UNA sola función, `retail.fn_resumen_comparacion` (la misma que ya alimentaba Desempeño y Comparar
períodos), extendida con columnas nuevas — nunca una función paralela ni un cálculo duplicado en el frontend:

- `a/b_piso_promedio`, `a/b_total_promedio`: promedio ponderado por tiempo (área bajo la curva del nivel de stock,
  dividida entre los días calendario de esa mitad), reconstruido con el mismo patrón de `dias_con_stock` que ya existía
  (`efectos` → `efectos_clase` → `mov_par` → `s_inicio` → `puntos` → `intervalos`), clonado para el balde «utilizable»
  (piso+almacén) además del balde «en venta» (piso) que ya existía.
- `ultima_venta_en`, `piso_expuesto_desde_ultima_venta_dias`: derivados de `demanda_filas` (la clasificación de venta
  que YA existía, reutilizada — no una nueva) y de los mismos intervalos de piso.
- `piso_eventos` (jsonb): la secuencia `{ts, delta, esVenta}` de cada movimiento que entra o sale del piso, en la
  ventana completa reconstruida (no acotada a A o B). Es el único dato nuevo que se interpreta en TypeScript en vez de
  en SQL — ver la sección siguiente.

## Cómo se reconstruyen los intervalos de exposición

En SQL: la ventana completa (no solo el período elegido) se reconstruye movimiento a movimiento, clasificando cada uno
como entrada o salida de PISO según su `sububicacion_id`/`sububicacion_destino_id`, y acumulando el nivel resultante
como una serie de intervalos `[inicio, fin, nivel]` — el mismo mecanismo que ya calculaba `dias_con_stock`, generalizado
para exponer también los eventos discretos (no solo su duración agregada) como `piso_eventos`.

En TypeScript (`resumen-exposicion.ts`, puro y testeado): `armarCohortes` interpreta esa secuencia como cohortes FIFO —
la cohorte más vieja es el saldo con que arrancó la ventana; cada entrada real abre una cohorte nueva; cada salida
consume las más viejas primero. Esto es intencional: reconstruir la SECUENCIA (qué cohorte maduró cuándo) es un
problema de orden, no de agregación, y hacerlo en SQL habría significado una función recursiva mucho más costosa para
un beneficio que TypeScript da gratis y con pruebas unitarias baratas.

## Cómo se resuelve una reposición reciente (caso F del pedido)

Una cohorte que no lleva `SELL_THROUGH_EXPOSURE_WINDOW_DAYS` días expuesta Y no se vendió del todo queda en
`pendienteMadurez`, fuera del numerador y del denominador del %. Si TODAS las cohortes de una variante están en ese
estado, la regla «Reposición reciente» toma prioridad sobre cualquier otra lectura — nunca se dice «rota lento» ni
«saludable» de una variante que literalmente acaba de recibir stock. Verificado con datos reales locales (ver abajo):
una reposición del 23/09 en Tienda Lima se lee exactamente así, con la fecha de hoy como referencia.

## Cómo se evita el doble conteo piso → almacén → piso (caso G del pedido)

Se agregó una clasificación `esVenta` a cada evento (reutilizando el mismo criterio de «venta» que ya usa
`demanda_filas`: `tipo='salida' AND (cambio_id IS NOT NULL OR (motivo='venta' AND …))`). En `armarCohortes`, una salida
que NO es venta (traslado, ajuste, `mover_interno`) resta también de `cantidadInicial` de la cohorte, no solo de lo
que queda — esas unidades nunca existieron para el sell-through de ESA cohorte. Si vuelven al piso más tarde, arman
una cohorte nueva con su propio reloj de madurez. Resultado: la suma de `disponibleMaduro + pendienteMadurez` de todas
las cohortes siempre es igual al total de unidades que en algún momento fueron una entrada NETA al piso — nunca más.
Probado explícitamente en `resumen-exposicion.test.ts` (10 → sale 4 sin vender → vuelven 4 → el disponible-maduro es
10, no 14).

## Qué pasa cuando la trazabilidad no alcanza

- El 55 % de los `movimientos` locales (96 de 174, todos del lote semilla del 2026-09-22) no tienen
  `sububicacion_id`: para esas variantes, piso/almacén no se puede separar con certeza y el sistema devuelve N/D en
  vez de aproximar — se confirmó viendo la pantalla real: la mayoría de filas de Tienda Lima hoy muestran «Ritmo
  observado» y «Sell-through» en N/D con el tooltip «muestra limitada», no un número fabricado.
- `Rotación piso` distingue explícitamente `calculable: false` con `motivo: sin_inventario` («nunca tuvo piso, no es
  un error») de `calculable: true, veces: 0` («tuvo piso, no rotó nada») — visto en datos reales: una variante mostró
  «N/D: no hubo inventario promedio en el período» en piso mientras su rotación total daba «0.00x», la lectura
  correcta cuando el poco stock que existe está todo en almacén.
- Cuando una salida de piso no encuentra cohorte previa que consumir (ledger que no cuadra), `armarCohortes` no
  inventa una cohorte negativa: consume lo que hay y descarta el resto en silencio, dejando el % con menos evidencia
  en vez de un número roto.

## Lo que NO cambió

- La estructura de `fn_resumen_comparacion` (mismo nombre, mismos parámetros, todas las columnas originales
  intactas) — Comparar períodos y su tabla de detalle (`ResumenComparacionDetalle.tsx`) siguen funcionando exactamente
  igual, sin tocar una línea.
- `rotacion.ts`, `resumen-reglas.ts` (`calcularVelocidad`, `calcularSellThrough`, `calcularTendencia`) — ninguna
  fórmula existente se modificó; solo se les dio un segundo insumo (piso además de total) donde ya existía el punto
  de extensión (`BaseRotacion.inventarioPromedioTemporal`).
- Filtros, orden, paginación, búsqueda, selección de sede y período de toda la pantalla — nada de esto cambió de
  comportamiento (verificado por la suite de pruebas existente, que sigue en verde sin modificar sus aserciones sobre
  estos mecanismos).

## Cómo se verificó

- **24,256 pruebas unitarias en verde** (117 → 118 archivos; +26 pruebas nuevas), typecheck y lint limpios.
- `resumen-exposicion.test.ts` (17 pruebas): cohortes FIFO, sell-through de exposición en los casos E (agotamiento:
  una cohorte vendida del todo madura de inmediato), F (reposición último día no diluye) y G (piso→almacén→piso, con
  y sin venta posterior real), `ritmoMuestraLimitada`, `esSobrestockTotal`, `tuvoQuiebreEnPiso`.
- `resumen-desempeno.test.ts` (+4 pruebas): `muestraLimitada`, `sobrestockTotal`, `sellThroughExposicion` viajando
  desde `pisoEventos`, y el **caso H** (tendencia sin base comparable): una mitad sin exposición en piso da N/D,
  nunca «Aceleró» — no existía una prueba que fijara esto explícitamente antes, aunque el código ya lo hacía bien.
- `resumen-lectura.test.ts` (+5 pruebas): las 5 reglas nuevas, incluido el caso I (días sin venta falsos por
  confundir calendario con exposición: 30 días de período con solo 5 en piso ya NO se marca «sin ventas»).
- **Verificado en el navegador contra Supabase local real** (Tienda Lima, sesión de Felipe): las 9 columnas
  renderizan, los tooltips muestran las fórmulas y el motivo de cada N/D, y una reposición real del 23/09 se lee
  como «Reposición reciente: sin exposición suficiente todavía» — el comportamiento diseñado, no un caso sintético.
  Comparar períodos se probó aparte y sigue intacto. Sin errores de consola ni de red (200/304 en todo).

## Se rompe si

- Se agrega una regla de lectura nueva directamente en `ResumenComportamiento.tsx` en vez de en
  `resumen-lectura.ts`: la tabla y las pruebas dejarían de decir lo mismo (mismo riesgo que señalaba ADR-0171).
- Se usa `x.sellThrough` (el clásico) en una columna de la tabla, o `x.sellThroughExposicion` en el KPI/dona/filtro de
  arriba: son dos números deliberadamente distintos con nombre parecido — mezclarlos produce una pantalla que se
  contradice a sí misma.
- Se olvida propagar `esVenta` al construir `piso_eventos` en una futura migración: sin esa clasificación, cualquier
  traslado interno piso↔almacén se contaría como venta en el sell-through de exposición.

## Explícitamente NO tocado en este trabajo

Nada se aplicó a Supabase remoto/producción, no hay commits, no hay push, no hay PR, no hay merge. La migración vive
solo en el Postgres local (Docker) de este worktree y en el archivo del repo, sin aplicar a `cayla-dynamic`. Ningún
otro módulo, pantalla o RPC fuera del alcance descrito arriba fue modificado.
