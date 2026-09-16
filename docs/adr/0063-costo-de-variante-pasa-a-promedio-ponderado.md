# ADR-0063 — El costo de una variante pasa de "último recibido" a promedio ponderado

**Fecha:** 2026-09-16
**Estado:** Aplicado en la base local (`20260916090000_costo_promedio_ponderado.sql`).
**No aplicado en producción** — falta autorización explícita de Felipe y el paso con
prefijo `retail.` (ver CLAUDE.md).
**Afecta:** tabla nueva `retail.costo_historial`, función nueva
`retail.fn_recalcular_costo_variante` (llamada por las tres funciones que ya escribían
`variantes.costo`: `recibir_lote`, `recibir_compras`, `cerrar_produccion` — las tres
`drop`+`create` para reordenar su cuerpo, mismo comportamiento salvo el costeo), función
nueva de lectura `retail.fn_costo_historial`, y una rama nueva en el trigger de
`retail.fn_registrar_cambio_producto` (ADR-0059) para que el cambio de costo se sume al
historial de producto que ya existe. **Ninguna tabla existente cambia de forma.**

## Contexto

D-45 (`docs/datos/DECISIONES-2026-09-12.md:229-232`) quedó abierta el 12-sep: el costo de
una variante se sobre-escribía con el último valor recibido, sin promediar. Posición de
Felipe en ese momento: *"es un tema contable, existen métodos, no sé si es necesario ese
nivel de detalle ahora"*. El 16-sep, al elegir piezas inspiradas en una comparación contra
NetSuite, Felipe decidió cerrarla: promedio ponderado, aplicado igual a compras y a
cierres de producción del Taller — con el requisito explícito de poder **identificar y
reconocer qué operación causó cada cambio de costo**, no solo el número final.

Auditoría antes de tocar nada: tres funciones distintas escriben `variantes.costo` hoy
(`recibir_lote`, `recibir_compras`, `cerrar_produccion` — este último no estaba en el
radar inicial, encontrado al grepear cada `set costo =` del repo), las tres con el mismo
patrón de sobre-escritura ciega, sin leer costo ni stock previos.

## Decisión

1. **Una sola función calcula el promedio, las tres funciones de escritura la llaman.**
   `fn_recalcular_costo_variante(variante_id, cantidad_nueva, costo_unitario_nuevo,
   origen, movimiento_id)` centraliza `costo_nuevo = ((stock_previo × costo_anterior) +
   (cantidad_nueva × costo_unitario_nuevo)) / (stock_previo + cantidad_nueva)`, con
   `costo_unitario_nuevo` directo cuando `stock_previo = 0` (variante nueva o agotada,
   evita dividir por cero). Antes la misma sobre-escritura vivía copiada tres veces.
2. **Se llama ANTES de `fn_aplicar_movimiento`, no después.** El `insert into movimientos`
   no toca `stock` — solo `fn_aplicar_movimiento` lo hace. Llamar la función de costo
   antes de esa línea captura el stock previo sin la cantidad nueva ya sumada; llamarla
   después habría contado la cantidad nueva dos veces en el promedio.
3. **`costo_historial` es un ledger append-only nuevo, espejo de `movimientos` para el
   costo** — mismo trigger de inmutabilidad que ya usa `historial_producto_cambios`
   (reusado, no duplicado). Guarda los 4 insumos de la fórmula por fila
   (`stock_previo`, `costo_anterior`, `cantidad_nueva`, `costo_unitario_nuevo`,
   `costo_resultante`), `origen` (`compra`/`produccion`, acotado) y `movimiento_id` — una
   sola FK, no una FK polimórfica propia con columnas `lote_id`/`compra_id`/
   `produccion_id`: `movimientos` ya resuelve "qué proceso exacto" (tiene esas tres
   columnas), duplicarlas en `costo_historial` sería la misma pregunta resuelta dos veces.
4. **El cambio de costo TAMBIÉN se suma al trigger de `historial_producto_cambios`
   (ADR-0059).** Ese trigger ya anticipaba esto en su propio comentario: *"si mañana se
   quiere auditar otro campo, se agrega al if/elsif a propósito"*. Con una línea (`if
   new.costo is distinct from old.costo then ...`), el cambio simple (de X a Y, cuándo,
   quién) se ve gratis en `/productos/[id]/historial` — sin pantalla nueva. `costo_historial`
   resuelve la pregunta más rica ("por qué, con qué lote/factura/corrida exacta") que ese
   ledger genérico, con solo `valor_anterior`/`valor_nuevo` en texto, no puede cargar sin
   ensuciarse para sus otros dos usos (precio, categoría).
5. **`fn_recalcular_costo_variante` revoca EXECUTE de `public` Y de `authenticated` por
   separado.** A diferencia de `fn_aplicar_movimiento` (repite un delta que ya está en una
   fila real de `movimientos`), esta función acepta un costo arbitrario sin chequear
   ubicación — ejecutable directo, cualquier colaborador podría destrozar el costo global
   de cualquier variante desde la consola del navegador.

## Alternativas descartadas

- **FK polimórfica propia en `costo_historial`** (columnas `lote_id`/`compra_id`/
  `produccion_id`, como el patrón de `movimientos`). Descartada: dos tablas resolviendo la
  misma pregunta ("qué proceso originó esto") de dos formas distintas — el error que este
  proyecto evita a propósito (Integridad Conceptual). `costo_historial` solo necesita
  `movimiento_id`; un join a `movimientos` resuelve el resto.
- **Agregar columnas de costo directo a `historial_producto_cambios`** en vez de una tabla
  aparte. Descartada: dejaría esa tabla con columnas siempre `null` para sus otros dos usos
  (categoría, precio) — el mismo antipatrón de la alternativa anterior, en la otra
  dirección.
- **Revocar EXECUTE solo de `authenticated`.** Insuficiente, encontrado probando en local:
  Postgres otorga EXECUTE a `PUBLIC` automáticamente al crear una función, y por separado
  `0005_grants.sql` tiene `alter default privileges in schema retail grant execute on
  functions to authenticated` — dos fuentes de permiso distintas, hace falta revocar de
  las dos.

## Consecuencias

- El costo de lo ya vendido con el costo viejo **no se recalcula hacia atrás** — el
  promedio ponderado corre desde que esta migración se aplica, hacia adelante.
- `docs/BACKLOG.md:1477-1478` (V1, sobre `finanzas.ts`, ya borrado) ya anotaba que "el
  costo de lo vendido usa el costo VIGENTE, no el del día de la venta — si algún día se
  mueven, distorsiona el histórico". Con el costo moviéndose por cada recepción/cierre a
  partir de ahora (antes era estable), ese riesgo pasa de teórico a real. `costo_historial`
  no lo resuelve solo, pero es la pieza que un reporte futuro necesitaría para reconstruir
  "cuál era el costo el día X" — subir prioridad en BACKLOG cuando se retome.
- **Se rompe si** alguien agrega un cuarto camino de escritura a `variantes.costo` sin
  pasar por `fn_recalcular_costo_variante` — volvería a la sobre-escritura ciega para ese
  camino específico, sin que el resto del sistema se entere.
- No decide el método de costeo del Taller de forma distinta a compras (D-31) — ambos
  entran al mismo promedio. Si algún día se necesita separarlos (ej. para margen por canal
  de abastecimiento), es un cambio de `origen` en la llamada, no de esquema.
