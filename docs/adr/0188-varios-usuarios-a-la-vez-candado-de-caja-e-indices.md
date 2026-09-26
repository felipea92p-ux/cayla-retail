# ADR-0188 — Varios usuarios a la vez: candado de caja, costo promedio sin trabar ventas e índices

- **Fecha:** 2026-09-23
- **Estado:** construido y probado en local; migración `20260924110000_concurrencia_caja_e_indices.sql` **por pegar en
  producción** (no cambia la web: se puede pegar antes o después de fusionar).
- **Contexto:** auditoría de concurrencia y volumen pedida por Felipe (2026-09-23): «que funcione con varios usuarios en
  simultáneo y sea escalable, porque va a guardar grandes cantidades de datos». Es la etapa 1 de 5; las demás van en sus
  propios ADR.

## Problema

La auditoría revisó las 343 funciones de la base, las 229 consultas de la web y las estadísticas reales de producción.
Lo que ya estaba bien: el stock (candado por fila y `check (cantidad >= 0)`: dos vendedoras con la última prenda nunca dejan
stock negativo), la numeración de boletas y códigos (contadores con candado y únicos), una sola caja abierta por sede y el
doble clic en ventas, comprobantes, cambios y compras (`token_cliente` único).

Tres cosas no estaban bien, las tres verificadas contra producción:

1. **Una venta podía quedar guardada en una caja ya cerrada.** `cerrar_caja` bloquea la caja, pero las 7 funciones que
   cobran solo preguntaban «¿hay caja abierta?» sin bloquearla. Si la cajera cobraba mientras la líder cerraba, el cierre no
   contaba esa venta y la venta quedaba en la caja cerrada: arqueo descuadrado sin explicación.
2. **Recibir mercadería trababa las ventas de esa prenda.** El cálculo del costo promedio bloqueaba la variante con
   `for update`, que choca con el candado liviano que Postgres toma al guardar una línea de venta. La venta esperaba a la
   recepción entera, y con dos prendas en orden cruzado Postgres cancelaba una (bloqueo mutuo).
3. **Faltaban índices en las tablas que más se leen.** `ventas` no tenía índice por caja ni por sede; la Caja en vivo
   pregunta cada 5 s por pestaña y cada pregunta recorría la tabla entera (162 millones de filas leídas desde julio con solo
   7 mil ventas). Igual `stock` por sede, `cambios`, `devoluciones` y `comprobantes`.

## Decisión

1. **Toda función que cobra o mueve dinero de una caja la lee con `for share`.** Es un candado compartido: dos cajeras
   cobran a la vez sin esperarse, pero el cierre (`for update`) espera a que terminen las ventas en curso y las cuenta; y una
   venta que llega cuando el cierre ya empezó espera, relee la caja, la ve cerrada y recibe el mensaje de siempre. Regla para
   funciones nuevas: **si escribe algo con `caja_id`, lee la caja con `for share`**.
2. **El costo promedio bloquea con `for no key update`**: sigue serializando dos recepciones de la misma prenda, pero no choca
   con las ventas.
3. **14 índices** para los filtros reales (caja, sede + fecha, línea de venta, documento de la clienta).
4. **Se parcha con anclas, no se copian los cuerpos**: el Postgres local y producción tienen versiones distintas de estas
   funciones; la migración lee la definición viva, exige que cada ancla aparezca exactamente una vez y es re-pegable (mismo
   patrón que `fn_proveedores` en ADR-0187).

## Alternativas descartadas

- **`for update` en las ventas:** también cierra el hueco, pero serializa a todas las cajeras de una sede entre sí.
- **Aislamiento `serializable`:** protege todo, pero obliga a reintentar transacciones desde la web; es mucho cambio para un
  hueco que se cierra con un candado.
- **Copiar los cuerpos completos:** pisaría versiones más nuevas pegadas a mano (el local ya difiere de producción en 6 de
  las 8 funciones).

## Cómo se verificó

- Migración aplicada dos veces seguidas en local: la segunda no cambia nada.
- Suites: `registrar-venta` 25/25, `registrar-cambio` 18/18, `separaciones` 46/46, `caja-cierre-traslado`,
  `fn-aplicar-movimiento` 11/11, `apartar-stock` 46/46. `aprobar-devolucion-caja` da 2/5, pero falla antes, en el permiso
  («Solo un líder puede aprobar», línea 21), por la cuenta de prueba; es previo y ajeno a este cambio.
- Dos sesiones reales contra una caja abierta del local (todo con rollback): con el cierre sosteniendo la caja,
  `registrar_venta` y `registrar_movimiento_caja` esperan (se cortan por `lock_timeout`); con otra venta sosteniéndola
  (`for share`), el movimiento pasa sin esperar.

## Lo que sigue (etapas 2–5, cada una su ADR)

2. Cambios y devoluciones simultáneos de la misma línea, conteo que recuenta con foto vieja, orden de las prendas al
   bloquear, doble clic en traslados, lotes y movimientos de caja.
3. Totales del Historial y resumen de Caja calculados en la base (sin el tope de 1.000 filas).
4. Vender sin recargar todo después de cada venta.
5. «Otra persona cambió esta prenda» al editar productos a la vez.
