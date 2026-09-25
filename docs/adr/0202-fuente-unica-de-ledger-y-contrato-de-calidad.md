# ADR-0202 — Fuente única del ledger de piso/almacén/total y contrato de calidad en el dominio (Felipe, 2026-09-24)

**Fecha:** 2026-09-24 · **Estado:** propuesto (implementado y verificado LOCAL; nada aplicado a producción/remoto) ·
**Amplía:** [ADR-0201](0201-seis-decisiones-dominio-inventario.md) — cierra los dos puntos arquitectónicos que Felipe
dejó explícitamente pendientes tras aprobar conceptualmente las seis decisiones de negocio de ese ADR.

## Contexto

Felipe aprobó la lógica de negocio de ADR-0201 sin cambios, pero señaló dos huecos arquitectónicos antes de dar
por cerrado el dominio: (1) `fn_ledger_puntos`... digo, `fn_ledger_timeline` y `fn_resumen_comparacion` seguían
siendo DOS reconstrucciones independientes del mismo ledger, aunque dieran el mismo número; (2) el contrato de
calidad (exacto/estimado/no_disponible) existía como módulo pero solo se llamaba desde 2 de las 7 celdas de la
tabla, nunca desde el dominio. Pidió las dos cosas resueltas HOY, sin volver esto N+1 y sin romper ninguna de
las 11 decisiones ya cerradas.

## 1. Única fuente de verdad: `retail.fn_ledger_puntos`

**DECIDÍ:** extraer la reconstrucción completa del ledger (saldo inicial desde `stock` real, clasificación por
bucket piso/total, nivel acumulado punto a punto) a una función SQL nueva, `retail.fn_ledger_puntos(p_ubicacion_id,
p_desde, p_variante_ids default null)`, y hacer que `fn_resumen_comparacion` y `fn_ledger_timeline` la llamen —
ninguna de las dos vuelve a decidir por su cuenta qué es un delta, a qué bucket pertenece un movimiento o cuál es
el saldo de partida. `fn_ledger_puntos` devuelve el NIVEL crudo en cada punto (no intervalos, no eventos): cada
consumidor arma lo que necesita encima (intervalos con `lead()`, o la lista de eventos con `esVenta`/`motivo` para
el FIFO de cohortes de `inventario-exposicion.ts`).

Migración: `supabase/migrations/20260924030000_ledger_fuente_unica.sql`.

**DESCARTÉ:** que `fn_resumen_comparacion` llamara a `fn_ledger_timeline` una vez POR VARIANTE (la interpretación
ingenua de "reutilizar la primitiva que ya existe") — porque convierte un recorrido de sede en N recorridos, uno
por variante, exactamente el N+1 que Felipe pidió evitar explícitamente. En vez de eso, `fn_ledger_puntos` acepta
un arreglo OPCIONAL de variantes: con `null` reconstruye TODAS las variantes con movimiento en UN solo recorrido
(el caso de `fn_resumen_comparacion`, sin cambiar su forma de escanear `movimientos`/`stock`); con un arreglo
explícito, esas variantes SIEMPRE aparecen en el resultado, tengan o no movimiento (el caso de
`fn_ledger_timeline`, que necesita responder siempre para la variante que se le pide).

**SE ROMPE SI:** alguien reutiliza `fn_ledger_puntos` dentro de un bucle PL/pgSQL variante-por-variante en vez de
pasarle el arreglo completo — eso reintroduce el N+1 que esta migración existe para evitar. La función está
diseñada para UNA llamada por invocación, nunca una por fila del resultado.

### Lo que se quedó afuera, y por qué

`fn_resumen_comparacion` conserva su propia consulta `actual` (el stock de HOY, piso/total — un `sum(stock.
cantidad)` directo, sin reconstruir nada) para calcular `a_stock_inicio`/`a_stock_cierre` (`a_ini_raw`/`a_fin_raw`,
vía la CTE `movido`). Es la MISMA información que `fn_ledger_puntos` ya usa como su propia ancla —matemáticamente,
el nivel del último punto de cada bucket ya es igual a ese `actual`— pero exponerla desde la función compartida
habría obligado a rediseñar `a_ini_raw`/`a_fin_raw` de "diferencia hacia atrás desde hoy" (`movido`, simple, ya
probado con 4 escenarios reales) a "búsqueda del intervalo que contiene la fecha" (más frágil en los bordes: una
fecha exactamente en el límite de un intervalo, antes del primero, después del último). `actual` no es el
algoritmo que Felipe pidió unificar —reconstrucción del ledger: saldo inicial, clasificación por bucket, nivel
acumulado, intervalos— es una lectura directa de una tabla, sin ninguna lógica de reconstrucción que pueda
desviarse entre las dos funciones. Duplicar 10 líneas de `sum(...) group by ...` no es el riesgo que esta
migración elimina, y forzar su eliminación habría cambiado el cálculo de columnas que ya llevan meses en
producción (ADR-0113/ADR-0138) sin necesidad real.

### Cómo se verificó (números, no opiniones)

- **Prueba estructural** (`scripts/pruebas/fn_ledger_fuente_unica.mjs`, caso 1): `pg_get_functiondef` sobre
  `fn_resumen_comparacion` y `fn_ledger_timeline` contiene literalmente la cadena `fn_ledger_puntos(` — la prueba
  de que delegan de verdad, no de que "dan el mismo número por casualidad".
- **Equivalencia cruzada** (caso 2): con un ciclo piso→almacén→piso real (20 unidades, 6 vendidas, 5 trasladadas a
  almacén y de vuelta), el nivel de TOTAL reconstruido a mano en JavaScript a partir de los intervalos crudos de
  `fn_ledger_timeline` coincide EXACTO con `a_stock_inicio`/`a_stock_cierre` que reporta `fn_resumen_comparacion`
  para la misma variante y ventana (14 unidades en los dos casos) — confirma que el traslado interno no mueve el
  total en ninguna de las dos funciones, porque las dos leen del mismo lugar.
- **Regresión** (casos 3a–3d): los 4 escenarios de `scripts/pruebas/fn_resumen_comparacion.mjs` (stock
  reconstruido del ledger no deducido de ventas, períodos no contiguos, importe/COGS en componentes con costo
  histórico, ledger que no cuadra y permisos) se repitieron tal cual contra la función unificada: **32/32
  verificaciones en verde**.
- **Rendimiento**: `explain (analyze, buffers)` sobre `fn_resumen_comparacion` en la sede con más movimiento del
  seed local (Tienda TRU, 26 movimientos) da 10.45 ms de ejecución total, UN solo `Function Scan` (no N nodos
  anidados), 4003 buffers — nada que sugiera un recorrido repetido por variante. A la escala real de CAYLA (3
  tiendas + 1 taller, no volumen de cadena) esto no es un riesgo de performance; se documenta el número, no se
  asume.
- **24,286 pruebas de TypeScript en verde**, typecheck y lint limpios (sin cambios de este punto: la única
  superficie tocada es SQL).

## 2. Contrato de calidad, completado en el DOMINIO

**DECIDÍ:** agregar `calidadDeExposicion` (el séptimo adaptador que faltaba, mismo patrón que los 6 de
ADR-0201) a `inventario-calidad.ts`, y calcular las 7 en UN solo lugar: `analizarDesempeno()`
(`resumen-desempeno.ts`), que ahora devuelve `AnalisisDesempeno.calidad: CalidadDesempeno` — un registro con las 7
claves (`exposicion`, `ritmo`, `sellThrough`, `rotacionPiso`, `rotacionTotal`, `sinVenta`, `tendencia`), cada una
un `Calidad` del contrato ya existente. `ResumenComportamiento.tsx` deja de llamar a los adaptadores dentro del
render (antes: 2 de las 7 celdas los invocaban ad-hoc) y pasa a leer `x.calidad.sellThrough`/`x.calidad.
rotacionPiso`/`x.calidad.rotacionTotal` — mismo resultado visible, ahora resuelto una vez por fila en el dominio,
no recalculado por cada celda que lo necesita.

**DESCARTÉ:** reescribir `RotacionUnidades`/`SellThroughExposicion`/`Velocidad`/`Tendencia` para que cada uno
CARGUE su propio campo `calidad` en vez de proyectarse — habría tocado la forma pública de cuatro tipos usados en
docenas de sitios (KPIs, ranking, Comparar períodos) sin necesidad real: el pedido literal de Felipe ("cada
métrica debe poder declarar calidad") lo satisface igual de bien una proyección calculada una vez en el dominio
que un campo nativo en cada tipo, con muchísimo menos riesgo de romper un consumidor que hoy no espera ese campo.

**DESCARTÉ** también extender esto a `lecturaComparacion`/`ResumenComparacionDetalle.tsx` (Comparar períodos):
Felipe ya había dejado esa extensión fuera de alcance en ADR-0200/0181 ("se dejó a propósito en el set de reglas
anterior"), y nada en este pedido la reabre explícitamente.

**DESCARTÉ** cambiar el tooltip de las celdas «Sin venta» y «Tendencia» para que lean `textoCalidad(x.calidad.
sinVenta)`/`textoCalidad(x.calidad.tendencia)` en vez de su texto estático actual — `textoCalidad` devuelve
`undefined` para el estado `exacto` (el caso común), lo que habría BORRADO el tooltip explicativo que hoy se ve
siempre en esas dos celdas. Felipe pidió explícitamente "no llenes la tabla de badges nuevos"; quitar información
que ya se mostraba tampoco es neutral. `calidad.sinVenta`/`calidad.tendencia` existen, están probados y listos —
conectarlos a una celda es una decisión de presentación que él mismo dijo que le corresponde a la presentación.

**SE ROMPE SI:** una pantalla nueva necesita la calidad de una de estas 7 métricas y la recalcula con su propio
adaptador en vez de leer `AnalisisDesempeno.calidad` — vuelve a dispersar la lógica que este cambio centralizó.

### Cómo se verificó

- `apps/web/lib/inventario-calidad.test.ts`: 3 casos nuevos para `calidadDeExposicion` (exacto, estimado por
  muestra corta, no_disponible sin ningún intervalo).
- `apps/web/lib/resumen-desempeno.test.ts`: un caso "todo exacto" (las 7 métricas con base suficiente en la misma
  fila), un caso "mezcla real" (exposición corta, ritmo/sell-through/sin-venta/tendencia cada uno N/D por SU
  PROPIO motivo, no uno inventado para toda la fila) y un caso de historial inconsistente (rotación piso/total
  declara `HISTORIAL_INCOMPLETO`, nunca `SIN_INVENTARIO` — la causa raíz es otra).
- 24,286 pruebas en verde (+6 desde ADR-0201), typecheck y lint limpios.

## Verificación visual — bloqueada, no omitida

La sesión local del navegador (puerto 3020) sigue cerrada desde el reinicio de la base local documentado en
ADR-0201 — confirmado de nuevo hoy (`/login?error=sin_persona`). Por protocolo de este repo, la sesión local la
inicia Felipe una vez, al principio; no se intentó ningún rodeo. Los cambios de este ADR no se verificaron en
vivo en el navegador — quedan cubiertos por las pruebas automatizadas de arriba, pendientes de una verificación
visual cuando Felipe vuelva a iniciar sesión.

## Hallazgo aparte, fuera de alcance de este ADR

Al construir la verificación SQL de este cambio se confirmó que el seed local de Postgres cambió (nombres de
sede, identidades de personas, estado de sedes) en algún punto de una sesión anterior, y que esto rompe
silenciosamente decenas de `scripts/pruebas/*.mjs` preexistentes (confirmado en `fn_resumen_comparacion.mjs` y
`roles_por_modulo.mjs`) — no por una regresión de este cambio, sino porque esos scripts hardcodean nombres/IDs que
ya no existen en el seed actual. Se dejó anotado como tarea aparte (chip de sesión), no se intentó arreglar hoy.
