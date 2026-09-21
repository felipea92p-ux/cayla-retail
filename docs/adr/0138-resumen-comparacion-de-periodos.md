# ADR-0138 — Análisis de inventario: Desempeño y comparar dos períodos (A contra B)

**Fecha:** 2026-09-19
**Estado:** Implementado en local (rama `claude/resumen-comparacion-periodos`). **La migración
`20260919220000_resumen_comparacion_periodos.sql` NO está aplicada en producción**: hay que aplicarla
ANTES de desplegar el front, o la pestaña «Comparar períodos» cae en el `error.tsx` de la sección (el
Resumen normal no se toca: es otra ruta de código y otra función).
**Amplía a:** ADR-0121 (Resumen v2). **Afecta:** `retail.fn_resumen_comparacion` (nueva),
`lib/resumen-comparacion.ts` (+ `resumen-periodo`/`-armado`/`-formato`/`-filtros`), `ResumenComparacion*.tsx`,
`ResumenCabecera.tsx`, `ResumenActualizado.tsx`, `ResumenControles.tsx`, `ui/Graficos.tsx`, `InventarioNav.tsx`.

## Qué se decidió

- **Dos modos en la misma pantalla** (`?modo=comparar`): el resumen de siempre y la comparación. Dentro de
  la comparación, «Vista general» (¿qué cambió?) y «Detalle por producto» (¿en qué productos y por qué?).
  Período B = el período analizado de siempre; A = «Comparar con», que gana «Otro período…» (fechas a mano).
- **Stock «al cierre»**, no el de hoy: el saldo utilizable al inicio y al cierre de cada período se
  reconstruye del ledger (saldo(t) = saldo de hoy − Σ movimientos posteriores; misma técnica de ADR-0113).
  «Inicio → cierre» **nunca** se usa para deducir ventas: entre uno y otro también hay recepciones,
  devoluciones, traslados y ajustes.
- **Función nueva y aditiva** `fn_resumen_comparacion(sede, A desde/hasta, B desde/hasta)`: por variante,
  ventas/devoluciones, importe y costo de lo vendido (`venta_items.costo_unitario`, el costo de ESE día),
  stock inicio/cierre y días con stock. Solo líder. No decide nada; las reglas viven en TypeScript.
- **Definiciones reutilizadas, sin umbrales nuevos:** velocidad = netas ÷ días con stock; cobertura = stock al
  cierre ÷ velocidad; rotación = COGS del período ÷ inventario promedio a costo, con promedio = (valor
  al inicio + valor al cierre) ÷ 2 (`lib/rotacion.ts`; ver «Corrección: Rotación»). Interpretaciones y señales con
  los umbrales de `inventario-reglas.ts` (3/7/30/60 días, ±25 %). Una variante puede tener varias señales.
- El selector de sede duplicado y «Ingreso sin comprobante» salen de esta pantalla; manda el selector global.

DECIDÍ: función SQL nueva, aditiva, con el stock reconstruido por período.
DESCARTÉ: ampliar `fn_resumen_variantes` (obliga a `drop`+recrear una función ya en producción que usa la
pantalla viva) y llamarla dos veces (no da el stock al cierre de A ni el de B si B no termina hoy).
SE ROMPE SI: el stock de hoy no cuadra con el ledger (alguien escribió `stock` sin movimiento): la fila se
marca `≈` y su velocidad cae a los días del período; o si el costo cambió mucho, porque el inventario se
valora al costo de HOY (lo vendido sí usa el de cada venta).

## Limitaciones conocidas

- Inventario promedio de dos puntos: no ve un pico de stock a mitad del período (haría falta la serie diaria).
- «Posible sobrestock» no mira el sell-through (la RPC no trae las entradas del período).
- Con costos sin verificar (`sin_costo`/`alterado`) el capital pasa a unidades; la rotación de esa variante es N/D y la del total se calcula con las demás (ver «Segunda corrección»).
- Períodos de distinta duración o superpuestos se avisan en pantalla; la rotación no se anualiza.

## Ampliación (2026-09-19): tres responsabilidades, una pantalla cada una

- **Existencias** = «¿qué tengo ahora y cómo está el stock?» (gana la cobertura). **Análisis › Desempeño** =
  «¿cómo se comportó mi inventario durante el período?». **Análisis › Comparar períodos** = «¿qué cambió entre dos
  períodos?». El análisis histórico no mezcla el stock de hoy con métricas del período.
- La pantalla «Resumen de inventario» pasó a **«Análisis de inventario»** (la ruta sigue `/inventario/resumen`).
  Sus pestañas son Desempeño | Comparar períodos; «Comparar con» solo existe en Comparar.
- **Desempeño** (tabla «Comportamiento del inventario»): vendido, ritmo de venta, sell-through, rotación y tendencia
  del PERÍODO. No usa el stock de hoy. Sale de la MISMA función `fn_resumen_comparacion` con el período partido en
  dos mitades (A = 1.ª, B = 2.ª): sumadas dan el período entero, el stock al inicio es el de A y el de cierre el de
  B, y la tendencia es el ritmo de B contra el de A. Cero fórmulas nuevas: `metricasDePeriodo` (ritmo y rotación,
  la de Comparar), `calcularSellThrough` y `calcularTendencia` (las del Resumen de siempre). Constantes nuevas y
  centralizadas en `inventario-reglas.ts`: `TENDENCIA_MIN_UNIDADES = 4` y `DIAS_RITMO_RECIENTE = 30`.
- La función ganó `a_entradas`/`b_entradas` (para el sell-through). Como aún no está en producción se editó la
  migración en su lugar (con `drop function if exists` previo), no se agregó otra.
- **Salió de la pantalla** todo lo que dependía del stock de hoy: las 5 tarjetas de señales, la tabla de
  prioridades con sus acciones, el detalle y el capital en modal y los 3 bloques inferiores. La lógica (motor de
  reposición, curvas rotas, capital) queda en `lib/` con sus pruebas, sin UI.
- **Existencias** muestra «Cubre N d» bajo «Disponible» en las tiendas (`getCoberturaPorVariante`: `fn_resumen_variantes`
  a `DIAS_RITMO_RECIENTE` días + `calcularCobertura`). Es un dato secundario: si falla, «N/D» y un aviso.
- **Acoplamiento nuevo con el despliegue:** Desempeño es la vista por defecto y ahora depende de
  `fn_resumen_comparacion`; sin la migración aplicada en producción, la pantalla entera cae en `error.tsx` (antes solo
  la pestaña Comparar). Aplicar la migración ANTES de desplegar el front.
- Limitaciones: rotación con inventario promedio de dos puntos (una prenda que llega a mitad del período rota «de
  más»); tendencia N/D en períodos de un día o con menos de 4 unidades; el ritmo usa días con stock, no días del período.

## Corrección (2026-09-19): «Rotación» es COGS ÷ inventario promedio a costo, y solo eso

- **Antes:** filas, ranking, orden y «Mayor mejora» mostraban como «Rotación» unidades netas vendidas ÷ unidades
  promedio ((inicio + cierre) ÷ 2); solo el KPI total de Comparar era a costo (y, sin costo verificable, caía a
  unidades). Dos fórmulas con el mismo nombre.
- **Ahora:** UNA fórmula, en `lib/rotacion.ts`, para Desempeño, Comparar (fila, KPI, ranking, orden, «Mayor
  mejora», «Qué cambió») y cualquier total (tienda, categoría, producto, variante):
  `rotación = COGS ÷ inventario promedio a costo`, en soles a costo, sobre EXACTAMENTE las mismas variantes
  (COGS con COGS e inventario con inventario; nunca promedia razones).
- **COGS:** el costo que cada venta guardó ESE día (`venta_items.costo_unitario`, que `registrar_venta` fija con el
  costo de la variante), menos el costo de lo devuelto (el de la línea que se devuelve). La función lo devuelve en
  componentes (`*_costo_ventas`, `*_costo_devoluciones`) para restar sobre el TOTAL al juntar las dos mitades de
  Desempeño. Un costo guardado en 0 es «no había costo»: se cuenta en `*_uds_sin_costo` y el COGS no es confiable.
- **Inventario promedio a costo:** no existe una serie diaria de stock ni de valor, así que rige el **fallback de dos
  puntos**: (valor al inicio + valor al cierre) ÷ 2, con valor = unidades × costo actual verificable (`oficial` o
  `declarado`, la misma regla del «Capital en inventario»). `BaseRotacion.inventarioPromedioTemporal` es el punto de
  sustitución para cuando exista un promedio temporal: la fórmula y las tres pantallas no cambian.
- **N/D, nunca inventado:** ventas sin costo, stock sin costo verificable, historial que no cuadra con el stock de hoy
  (no hay stock al inicio fiable) o inventario promedio de cero. Sin ventas pero con inventario rota 0. (Cómo se
  suma un total con variantes sin dato: ver «Segunda corrección».)
- **Unidades ÷ unidades promedio** se eliminó: nada más la usaba (si algún día hace falta, `rotacionUnidades`).
- **Limitación conocida (sin parche):** con dos puntos, una prenda que recibe stock a mitad del período (inicio 0 →
  cierre 90) queda con promedio 45 sin importar el día que llegó, y su rotación sale más alta de lo real; hay una
  prueba que lo deja escrito. Además el inventario se valora al costo de HOY, no al de la fecha.

## Segunda corrección (2026-09-19): el total se calcula sobre el universo confiable, y A contra B sobre el común

- **Antes:** una sola variante sin dato (sin costo, con el historial inconsistente…) convertía en N/D la rotación de
  TODA la tienda o categoría. En la base local una prenda alcanzaba para dejar el KPI muerto.
- **Variante:** sigue siendo estricta. Sin dato confiable es N/D: no se estima, no se reemplaza por unidades, no se
  imputa un costo ni se usa el precio.
- **Total (tienda, categoría, búsqueda):** `Σ COGS de las variantes válidas ÷ Σ inventario promedio de LAS MISMAS`
  (`rotacionAgregada`). NO es el promedio de las razones de cada variante (una prenda de inventario chico y rotación
  enorme pesaría igual que una de inventario grande). Una variante N/D queda fuera de las DOS sumas —si entrara solo
  el COGS, el cociente mezclaría universos— y el resultado trae `totalVariantes`, `variantesValidas`,
  `variantesExcluidas`, `porcentajeVariantesValidas` y cuántas excluidas hay por cada motivo. Sin ninguna válida, N/D.
- **A contra B:** el universo COMÚN (`rotacionComparada`): las variantes con rotación válida en A **y** en B; A y B se
  calculan sobre esas mismas, y la variación es (B − A) ÷ A solo con A > 0 (con A = 0 es N/D y B se sigue mostrando).
  Si A usara unas variantes y B otras, la diferencia mediría el cambio de universo, no el del inventario.
- **Qué se dice al usuario:** debajo de la cifra, «95 de 100 variantes comparables» (solo si hay exclusiones; con todas
  válidas no hay aviso) y, en el tooltip de la tarjeta, cuántas variantes tenían dato en A, en B y en ambas, y por qué
  quedaron fuera las demás. Es texto secundario: sin alertas ni bloques nuevos. No hay un mínimo de cobertura (p. ej.
  «al menos 80 %»): se decidirá con datos reales; el universo ya viaja completo para poder exigirlo después.
- **Rankings, órdenes y señales:** una variante N/D no entra a «Productos con mayor rotación», «Mayor/Menor rotación»
  ni «Mayor mejora» (va al final, nunca como si valiera 0) y no se marca «Mejoró rotación» sin los dos valores. El
  ranking y el orden «en B» son de UN período: piden dato en B, no en A. Desempeño no tiene total de rotación en
  pantalla; cuando lo tenga usará `rotacionAgregada`.
- **Sin migración:** todo se decide en TypeScript con las columnas que la función ya devuelve; la migración
  `20260919220000` no cambió en esta corrección.

DECIDÍ: razón de sumas sobre las variantes válidas (y las comparables en A y B para el KPI comparativo).
DESCARTÉ: el «total sobre todo o N/D» (una prenda sin costo apaga la cifra de toda la tienda) y el promedio de razones
(pesa igual lo grande que lo chico), porque el primero deja la pantalla sin dato casi siempre y el segundo da un
número que no es la rotación de nadie.
SE ROMPE SI: las excluidas son justo lo más importante (p. ej. el 60 % del inventario sin costo cargado): el KPI se
calcula sobre el 40 % restante y parece confiable aunque no lo sea. Por eso el universo viaja con el resultado y queda
listo para exigir una cobertura mínima cuando haya datos reales.

### Límite conocido 2 (sin parche): el inventario se valora al costo VIGENTE, el COGS al de cada venta

El COGS conserva el costo histórico de la transacción (`venta_items.costo_unitario`); el inventario del inicio y del
cierre se valora con el costo de HOY (`variantes.costo`, la regla del «Capital en inventario»). Si el costo de una
prenda cambió dentro o después del período, numerador y denominador están a precios distintos: un costo que subió
infla el inventario y baja la rotación, y uno que bajó hace lo contrario. Hay una prueba que lo deja escrito
(`rotacion.test.ts`) y el aviso vive en el encabezado de `lib/rotacion.ts`, junto a la lógica.

**Objetivo definitivo (NO implementado):** COGS histórico del período ÷ promedio temporal del valor histórico del
inventario a costo, valorando cada tramo con el costo que regía en ese momento (`costo_historial` lo permite). El
fallback actual, (valor inicial + valor final) ÷ 2, es una aproximación consciente. Puntos de sustitución:
`BaseRotacion.inventarioPromedioTemporal` (el promedio) y `baseRotacionDeVariante` (donde entra el costo). Los
consumidores solo pasan la base y leen el resultado, y los textos de ayuda que describen el método (`AYUDA_ROTACION`,
`TEXTO_VALORACION_ROTACION`, `TEXTO_LIMITACION_PROMEDIO`) viven en `lib/rotacion.ts`. Desempeño combina dos mitades en
`periodoCompleto`: cuando exista el promedio temporal habrá que combinar el de las dos mitades ponderado por días.

## Rediseño visual de Comparar períodos (2026-09-19)

Pedido explícito de Felipe tras ver la tabla de Detalle «dispersa, sin orden»: reordenar la jerarquía de lectura
(A → B primero, después qué cambió globalmente, después cómo se distribuyó, por último qué productos lo explican) y
dar a cada fila un ancla visual (miniatura + color), como ya tenía Existencias.

- **Contexto compacto:** el bloque permanente de presets + «Comparar con» + búsqueda se volvió una línea «A → B ·
  Cambiar períodos»; el configurador completo (el de siempre) se despliega a pedido, para no competir con los KPI.
- **Búsqueda solo en Detalle:** Vista general no filtra productos, los explica; se sacó de ahí. El campo con espera
  de 350 ms que antes duplicaban Desempeño y Comparar se extrajo a `ui/BuscadorDebounced.tsx`.
- **Cobertura fuera de Comparar** (KPI, gráfico y columna): es la pregunta de Existencias («¿cuánto me dura lo que
  tengo?»), no la de Comparar («¿qué cambió?»). El cuarto KPI pasa a ser Sell-through (`sellThroughComparado`, la
  MISMA fórmula de `calcularSellThrough` sobre las variantes con dato en A y en B).
- **«Qué cambió» → «Evolución del ritmo»:** las tres señales de texto (mejoró rotación / riesgo de quiebre / posible
  sobrestock) se reemplazaron por una dona Aceleró / Estable / Desaceleró (`evolucionDelRitmo`, la MISMA cuenta que
  la tendencia de Desempeño — `calcularTendencia` — sin una regla especial nueva para no desalinear las dos
  pantallas), interactiva hacia Detalle con el filtro puesto. El ranking de rotación en texto pasó a barras
  horizontales A/B (`BarrasHorizontalesComparadas`, reusa el lenguaje visual de `ColumnasComparadas`).
- **Distribución de sell-through** reemplaza a la de Cobertura, reusando el mismo gráfico de columnas.
- **Detalle a 6 columnas:** cada celda comparativa es un valor principal + una línea secundaria, no una columna por
  dato; la columna Interpretación (con su badge «Sin datos» repetido) se reemplazó por «Cambio relevante»: UN
  cambio, el más importante de `PRIORIDAD_CAMBIO` (ritmo > rotación > sell-through), en texto con flecha — nunca una
  fila de chips. Sin dato medible es «—»; con dato pero sin cambio, «Sin cambio relevante».
- **Miniatura + color** (`ui/PrendaCelda.tsx:SinFoto`, `ui/MuestraColor.tsx`): el mismo lenguaje que Existencias, al
  lado del nombre. Desempeño y Comparar › Detalle ya traían `colorHex` en sus datos (la RPC lo trae desde ADR-0128):
  cápsula de color real. Movimientos, Traslados › detalle y Conteo › detalle ganaron la miniatura (percha) pero NO
  la cápsula: el color ahí sigue siendo texto porque el hex no viaja hasta esas filas todavía (traerlo es un cambio
  de datos, no de diseño — queda en BACKLOG). Mover y Recibir quedan sin ninguna de las dos: son `<select>` nativos
  del navegador y un `<option>` no admite marcado.

DECIDÍ: reusar `calcularTendencia` tal cual para la dona, sin una excepción para «A vendió cero con evidencia, B
vende» (que hubiera dado «aceleró» sin porcentaje).
DESCARTÉ: esa excepción, porque Desempeño no la tiene y las dos pantallas hubieran dejado de coincidir en el mismo
caso — el «caso especial» quedaría en Comparar y en Desempeño no, dos respuestas para la misma pregunta.
SE ROMPE SI: alguien agrega la excepción a una de las dos pantallas sin la otra — hay que tocar `calcularTendencia`
(o `evolucionDelRitmo`, que la envuelve), no una pantalla sola.

## Fila de períodos: dos píldoras (2026-09-21, diseño de Figma de Felipe)

Sustituye a la línea «A → B · Cambiar períodos» del rediseño de arriba. Felipe editó a mano, en un frame de Figma
capturado del navegador, la fila de contexto de Comparar: dos píldoras «Período A: desde … hasta …» y «Período B:
desde … hasta …» (calendario de 14 px, texto de 13 px medium, fondo tinta/4 %, borde tinta/30, radio 8) más el
selector de Categoría a la derecha. Se implementó con dos correcciones que se acordaron antes de escribir código:
del alto de todo control y con SU rango cada una.

DECIDÍ: píldoras de 36 px (`ALTO_CONTROL`) alineadas con la línea del selector de Categoría, no centradas en la
banda etiqueta+selector; el texto de cada una sale de `textoPildoraPeriodo(letra, rango)` con el rango de SU período; y
cada píldora abre SU configurador —B los presets del período que se analiza, A «comparar con» y sus fechas—.
DESCARTÉ: implementar el frame al pie de la letra. Sus píldoras de 32 px rompían la línea de 36 px que comparten
pestañas, presets y selector; la B llevaba escrito el rango de A (24 jul – 22 ago) mientras los gráficos de abajo
decían 23 ago – 21 sep; y no dibujaba a dónde se cambian los períodos, así que tomarlo tal cual quitaba los presets y
«otro período…». Tampoco un único panel para las dos: tocar «Período B» y ver «comparar con» de A es una sorpresa.
SE ROMPE SI: alguien escribe el texto de una píldora a mano y no por `textoPildoraPeriodo` (vuelve a poder mentir
sobre B), o si dos píldoras + Categoría dejan de caber: por debajo de ~1100 px de ventana la Categoría baja a otra fila
y en celular las píldoras se apilan (verificado sin desborde a 1024 y 390 px).

Estados que el frame no dibuja y se resolvieron con los tokens que ya existen (pendientes de confirmar en Figma):
abierta = borde tinta/60; hover = borde tinta/50; foco = el contorno rojo/60 de los demás controles.

## Anexo 2026-09-21 (más tarde): un solo selector de fechas

Sustituye la parte de la decisión anterior que dice que «cada píldora abre SU configurador» (B los presets, A «comparar
con»): eran dos selectores distintos y Felipe pidió uno solo, con las fechas escritas a mano como forma principal.

DECIDÍ: Período A, Período B y el «Personalizado» de Desempeño abren el mismo `PopoverRango` (`ResumenControles.tsx`):
Desde y Hasta en dd/mm/aaaa ya cargados con el período actual, foco en «Desde», Tab entre los dos, Enter o «Aplicar», el
calendario de `CampoFecha` como ayuda y los errores en línea. Los atajos que cada uno tenía —A: período anterior y mismo
período del año pasado; B: 7, 30, 90 días y este mes— viven DENTRO de ese selector (chips), para no quitar ninguna
función. Aplicar B deja `preset=personalizado&desde&hasta`; aplicar A, `comparar=personalizado&cdesde&chasta`: la URL y el
flujo de comparación son los de siempre.
DESCARTÉ: (a) dejar solo los dos campos: en Comparar se perdía la vuelta a «7 días» o «año anterior» sin editar la URL;
(b) un `<input type="date">` nativo o un componente nuevo: `CampoFecha` ya escribe dd/mm/aaaa con calendario de apoyo, y se
le sumó el modo `estricto` (opt-in) porque volvía en silencio a la última fecha válida —en un rango eso hace que «Aplicar»
use otra fecha que la escrita—; (c) apagar «Aplicar» cuando algo está mal: un botón apagado no dice por qué.
SE ROMPE SI: se usa `estricto` sin pasar `revelarError` al intentar aplicar (el campo no avisa hasta que se sale de él); si
un atajo se ata a un solo período sin pensar en el otro (A y B deben verse y comportarse igual); o si los dos campos van
lado a lado por debajo de ~380 px: a ~120 px cada uno corta «23/08/2026», por eso se apilan.
