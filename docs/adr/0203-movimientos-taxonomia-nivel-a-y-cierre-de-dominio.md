# ADR-0203 — Movimientos auditado, taxonomía Nivel A/B, y cierre del dominio de Inventario (Felipe, 2026-09-24)

**Fecha:** 2026-09-24 · **Estado:** aplicado (fusionado en el PR #397; sus 2 migraciones, `20260924010700` y `20260924030000`, están en
producción — verificado por efectos en la base el 2026-09-25; la línea anterior decía «nada aplicado a producción») ·
**Amplía:** [ADR-0202](0202-fuente-unica-de-ledger-y-contrato-de-calidad.md) — antes de dar el dominio por cerrado,
Felipe pidió auditar la pantalla Movimientos (que YA existe y consume la misma tabla) y corregir dos puntos que
esa auditoría encontró.

## Contexto

Felipe advirtió: "no asumas que la UI de Movimientos es la fuente de verdad" y pidió inspeccionar de dónde saca
sus datos, cómo clasifica movimientos, y si hay lógica reutilizable que el ledger nuevo debería aprovechar — antes
de dar por cerrada la arquitectura. La auditoría encontró un bug latente real (nunca disparado hoy, pero ya
aplicado en producción el gatillo que lo habría causado) y una taxonomía que, con un ajuste, sí queda coherente.

## 1. Movimientos: de dónde sale, y qué ya hace bien

`Inventario > Movimientos` (`apps/web/app/(app)/inventario/movimientos/page.tsx`) lee de `retail.fn_movimientos`
(`supabase/migrations/20260919155000_movimientos_referencias_y_busqueda.sql:183-422`) — la MISMA tabla
`retail.movimientos` que usa `fn_ledger_puntos`, sin vista intermedia. Ya clasifica "interno" (piso↔almacén,
misma sede) con una condición **estructural**, no un texto: `tipo = 'traslado' and ubicacion_id =
ubicacion_destino_id` (línea 299). Esto es correcto y no se tocó.

## 2. El hallazgo: dos condiciones para "es interno", nunca garantizadas iguales

`fn_ledger_puntos` (antes de esta corrección) decidía `esMovimientoInterno` comparando el texto
`motivo = 'movimiento_interno'` — un string que solo `retail.mover_interno()` garantiza por convención (motivo
literal, mismo parámetro de ubicación repetido), no por ningún CHECK ni trigger de la base. Auditando el
historial completo de migraciones que insertan `tipo='traslado'`, encontré un contraejemplo **real, ya aplicado
en producción**: `activacion-piso-almacen-produccion.sql` (2026-09-14) inserta `tipo='traslado'`,
`ubicacion_id=ubicacion_destino_id` (mismo criterio estructural que "interno"), pero `motivo='activacion_piso_almacen'`
— no `'movimiento_interno'`. El propio código de la app ya tuvo que modelar esto: `apps/web/lib/movimientos-reglas.ts:133`
mantiene una LISTA `interno: ["movimiento_interno", "activacion_piso_almacen"]`, reconociendo tácitamente que un
solo valor de motivo no alcanza.

**Por qué no rompió ningún número hasta ahora:** esa migración concreta tocó sububicaciones que no son
`piso_venta`, así que nunca llegó a evaluarse `esMovimientoInterno` para esas filas. Pero nada en la base impide
que una inserción manual futura, con la misma forma, sí toque `piso_venta` — y ahí sí rompería el reloj de
exposición en silencio (trataría un regreso desde almacén como stock nuevo, reiniciando el reloj en vez de
pausar/reanudar — exactamente lo contrario de la decisión ya cerrada de Felipe).

**DECIDÍ:** crear `retail.fn_es_traslado_interno(tipo, ubicacion_id, ubicacion_destino_id)` — la MISMA condición
estructural que ya usaba Movimientos — y hacer que `fn_ledger_puntos` la use en vez de comparar `motivo`. Es
Nivel A del dominio (hecho estructural: "¿qué pasó?"), hermana de `fn_es_venta_de_stock` (Nivel B, interpretación
comercial: "¿qué significa?"). Migración `supabase/migrations/20260924030000_ledger_fuente_unica.sql` (editada in
situ: la primera versión de este archivo nunca salió de esta sesión ni se aplicó a producción).

**DESCARTÉ** tocar `fn_movimientos`/la UI de Movimientos — ya hacía lo correcto; no había nada que arreglar ahí.

**SE ROMPE SI:** una futura inserción manual (fuera de `mover_interno()`) usa `tipo='traslado'` con
`ubicacion_id=ubicacion_destino_id` pero pretende que NO sea un regreso real desde almacén (por ejemplo, una
corrección administrativa que reubica stock sin que haya estado expuesto antes) — con la condición estructural,
esa fila SIEMPRE se leería como pausa/reanudación. No se conoce ningún caso real así hoy; si aparece, es una
decisión de negocio nueva que hay que preguntar, no asumir.

## 3. Taxonomía Nivel A / Nivel B, tal como queda

**Nivel A — hecho de inventario** (qué pasó, sin interpretación comercial): la `categoria` de 5 valores en
`fn_movimientos` (entrada/salida/interno/ajuste/transferencia) y, ahora, `retail.fn_es_traslado_interno`
(reutilizada por el ledger). **Nivel B — interpretación comercial** (qué significa para la demanda): `retail.
fn_es_venta_de_stock` y `demanda_base.clase` (venta/devolución/liquidación dañada), en `fn_ledger_puntos`/
`fn_resumen_comparacion`. Las dos capas viven en archivos distintos a propósito — Movimientos nunca necesitó
saber "es venta comercial", y el ledger nunca necesitó las 5 categorías completas de Movimientos, solo piso/total/
venta/interno.

**Hallazgo aparte, no corregido hoy (fuera del alcance que Felipe marcó — "no rediseñes Movimientos"):**
`apps/web/lib/movimientos-reglas.ts:409-414` define `etiquetaActividad`, una TERCERA regla de clasificación
(por presencia de objetos enlazados, no por `motivo` ni por `fn_es_venta_de_stock`) que **no usa ningún
componente de pantalla** — código muerto, verificado con grep. Se dejó como chip de sesión aparte: si alguien la
conecta en el futuro sin saber que ya hay dos reglas activas y distintas, quedarían tres criterios divergentes.

## 4. `actual` no es una segunda fuente de verdad — demostrado con números

`actual` es una lectura DIRECTA de `stock` (piso/total de HOY), usada como ancla para caminar hacia atrás — nunca
para reconstruir un momento histórico por su cuenta. Ejemplo real, construido y verificado
(`scripts/pruebas/fn_ledger_fuente_unica.mjs`, caso 4):

```
Movimientos: entrada 20 (día 0) · venta 5 (día 5) · entrada 30 (día 20)
actual (stock hoy)        = 45        (20 − 5 + 30)

fn_ledger_timeline (piso), intervalos reconstruidos:
  [día 0 exacto, +1h)   nivel 0
  [+1h, día 5)          nivel 20
  [día 5, día 20)       nivel 15
  [día 20, hoy)         nivel 45

fn_resumen_comparacion, período A = [día 0, día 15):
  a_stock_inicio = 0    (ANTES de que entrara nada — el ledger, no `actual`)
  a_stock_cierre = 15   (20 − 5, el día 20 todavía no había pasado)
período B = [día 15, hoy]:
  b_stock_inicio = 15   (= a_stock_cierre, sin discontinuidad)
  b_stock_cierre = 45   (= actual — B es el único período que llega hasta hoy)
```

`a_stock_cierre` (15) ≠ `actual` (45): si `fn_resumen_comparacion` estuviera leyendo `actual` para cualquier
fecha, ese número saldría 45, no 15. La igualdad `b_stock_cierre = actual` es la prueba de que `actual` SÍ es la
ancla correcta cuando la ventana llega hasta hoy — no una coincidencia, es la definición de ancla funcionando bien.

## 5. Cruce Ledger ↔ Movimientos — verificado, no solo argumentado

Escenario con recepción, dos ciclos piso↔almacén, venta, devolución y ajuste (`fn_ledger_fuente_unica.mjs`, caso 5):
`retail.fn_movimientos` ve **7 filas** (recepción, las 3 piernas de traslado interno, venta, devolución, ajuste) y
suma sus propios `delta` a **14**; `fn_ledger_puntos` (bucket total) reduce a **4 puntos** — pero los 3 que
"faltan" son EXACTAMENTE las 3 piernas de traslado interno, que Movimientos YA reporta con `delta=0` cada una
(no mueven el total, ni para Movimientos ni para el ledger). La suma coincide **exacta**: 14 = 14. Ningún
movimiento visible en Movimientos queda ignorado por el ledger; nada que use el ledger es inexistente en
Movimientos; la diferencia de conteo es legítima y está explicada, no es una omisión.

## 6. Drill-down Análisis → Movimientos: posible en concepto, no construido

Los datos son compatibles: cada fila de `fn_resumen_comparacion` ya trae `variante_id` + la sede + el rango de
fechas que la generó — exactamente lo que se necesitaría para acotar Movimientos a esos mismos movimientos. Lo
que falta: `fn_movimientos` no acepta un `p_variante_id` (solo `p_producto_id`, que trae TODAS las variantes del
producto, o `p_busqueda` de texto libre) — habría que agregarlo, y agregar el enlace en la UI de Análisis. **No se
construyó hoy** (Felipe lo pidió explícitamente aparte) — se deja anotado en BACKLOG. La arquitectura actual no
DESTRUYE esa trazabilidad: los datos crudos ya la permiten, falta el parámetro de acceso, nada más.

## 7. Contrato de calidad: matriz real, corregido un caso de "estimado" inventado

Auditando estado por estado (no asumiendo que las 7 métricas deban tener los 3 estados), encontré que
`calidadDeExposicion` declaraba `estimado` cuando la muestra era corta frente al período — pero
`diasConStockPiso` SIEMPRE se calcula de la misma forma exacta (suma de intervalos reconstruidos), sin ninguna
técnica sustituta: "muestra limitada" es una advertencia de confianza estadística, no una aproximación de
método. Es exactamente el error que Felipe pidió evitar ("no inventes estimado solo por completar la
taxonomía"). **Corregido:** `calidadDeExposicion(diasConStockPiso)` ahora es de 2 estados (exacto/no_disponible);
`muestraLimitada` sigue existiendo como su propio booleano (ya se mostraba como el punto ámbar en la celda de
Ritmo), fuera de este contrato.

**Matriz real, verificada contra el código de cada adaptador (`inventario-calidad.ts`):**

| Métrica | Estados reales | reasonCodes posibles | Condición |
|---|---|---|---|
| Exposición | exacto, no_disponible | HISTORIAL_INCOMPLETO | no_disponible solo si no hay NINGÚN intervalo de piso reconstruido |
| Ritmo observado | exacto, estimado, no_disponible | EXPOSICION_INSUFICIENTE, HISTORIAL_INCOMPLETO | no_disponible: poco/ningún historial; estimado: el denominador cae a días de calendario porque el ledger no cuadra (sustituye el método, no solo baja la confianza) |
| Sell-through de exposición | exacto, estimado, no_disponible | EXPOSICION_INSUFICIENTE, TRAZABILIDAD_INSUFICIENTE | no_disponible: ninguna cohorte maduró; estimado: hubo un ciclo piso↔almacén (aproximación por cantidad) |
| Rotación piso | exacto, no_disponible | SIN_INVENTARIO, HISTORIAL_INCOMPLETO | NUNCA estimado (unidades vendidas ÷ promedio, sin paso intermedio que sustituir) |
| Rotación total | exacto, no_disponible | SIN_INVENTARIO, HISTORIAL_INCOMPLETO | igual que piso |
| Sin venta | exacto, no_disponible | HISTORIAL_INCOMPLETO | reconstrucción SQL directa, siempre exacta cuando hay intervalo |
| Tendencia | exacto, no_disponible | SIN_BASE_COMPARABLE | nunca "estable" por defecto ni estimado |

**`SIN_COSTO_VERIFICABLE` confirmado aislado** (grep de todo `apps/web/lib`): aparece en UN solo lugar,
`calidadDeRotacionValorizada` (rotación en soles, `rotacion.ts`). `rotacionUnidades()` (Rotación piso/total) no
referencia costo/COGS en ninguna línea de su fórmula — no puede llegar a ese motivo aunque quisiera.

## Verificación

- `scripts/pruebas/fn_ledger_fuente_unica.mjs`, ahora con 6 secciones (estructural, equivalencia cruzada,
  taxonomía estructural del traslado interno, `actual` vs. ledger, cruce con Movimientos, regresión de los 4
  casos previos): **44/44 verificaciones en verde**.
- 24,286 pruebas de TypeScript en verde, typecheck y lint limpios.
- Nada de esto cambia las 11 decisiones comerciales ya cerradas: el fix de `es_interno` corrige la DETECCIÓN de
  un hecho estructural para que coincida más fielmente con la decisión "piso→almacén→piso pausa y continúa" —
  no cambia esa decisión; la corrección de `calidadDeExposicion` no cambia ningún número mostrado (solo el
  estado de calidad que se le adjunta), no reordena ninguna fila ni cambia ninguna cifra.

## Se rompe si

- Alguien reintroduce una comparación por `motivo` para detectar "interno" en un lugar nuevo del código, en vez
  de llamar `retail.fn_es_traslado_interno` — se repite exactamente el riesgo que esta migración cerró.
- Alguien conecta `etiquetaActividad` (movimientos-reglas.ts) a una pantalla sin revisar primero si coincide con
  `etiquetaMovimiento`/`fn_es_venta_de_stock` — quedarían tres criterios activos y divergentes.
