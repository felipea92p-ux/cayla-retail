# ADR-0179 — Una prenda que llega a piso sin registrar se vende con rastro y almacén la regulariza después

**Fecha:** 2026-09-23 · **Estado:** aceptado (Felipe, cuatro rondas de preguntas + «Aprobada, vamos a la implementación»), construido y verificado en local; **las dos migraciones están en producción desde el 2026-09-23** (pegadas con OK de Felipe, huellas y humo en el BACKLOG). Falta fusionar la web. Spec: `docs/superpowers/specs/2026-09-23-prendas-sin-registrar-design.md`; plan: `docs/superpowers/plans/2026-09-23-prendas-sin-registrar.md`.

## Contexto

En hora punta llegan a piso prendas que almacén todavía no etiquetó ni registró (del taller, de proveedores y accesorios comprados por internet), y la colaboradora las vende a un precio estimado porque la clienta las quiere ya. Cada sede tiene su almacén, y al registrar un lote **se cuenta lo físico**: si una ya se vendió, se cuenta una menos.

La única salida del punto de venta era «Monto manual»: vendía la variante centinela «Cargo especial» por cualquier monto, sin decir qué prenda era y contra un stock ficticio de 999 999 unidades. Así nunca se sabía qué prenda salió, el stock real no bajaba y la diferencia de precio no se veía. (En producción, además, esa variante **no existía**: el botón fallaba y ninguna de las 7002 ventas lo usó. Verificado en solo lectura, 2026-09-23. El hueco estaba construido pero apagado.)

## Decisión

1. **Caja vende sin pedir permiso, pero anota lo mínimo.** «Prenda sin registrar» reemplaza a «Monto manual»: descripción corta, categoría, talla y color (de las listas cerradas) y el precio cobrado. `registrar_venta` (misma firma) lo exige para la línea de la centinela, la limita a cantidad 1 y la deja en la tabla nueva `prendas_por_regularizar`. **Esa línea no mueve stock**: la prenda no está en el sistema, así que no hay nada que bajar (y desaparece el stock ficticio).
2. **Almacén regulariza** (Recibir ▸ Por regularizar, `regularizar_prenda`): elige la prenda real y responde **una** pregunta, porque se cuenta lo físico:
   - «Ya estaba registrada, solo perdió la etiqueta» → sale 1 (del piso; si no hay, del almacén de la sede).
   - «Llegó nueva y no se contó en el lote» → entra 1 (`ingreso_regularizado`) y sale 1: el stock no cambia, el ledger dice la verdad.

   La salida lleva motivo `venta` y el `venta_item_id`: rotación, reportes y `anular_venta` la tratan como cualquier venta. La línea de venta pasa de la centinela a la variante real (y a su costo) una sola vez; lo que anotó caja queda en `prendas_por_regularizar`.
3. **La diferencia se guarda con signo** (`precio cobrado − precio oficial`): negativa = descuento no planificado, positiva = sobreprecio. El ingreso es lo que pagó la clienta; la diferencia es una señal en el reporte, no otro «sector».
4. **Freno, sin tope en caja:** visible en la pestaña (por sede y colaboradora, con cifras del mes) y **aviso al líder** en el inicio cuando una pendiente pasa de **2 días** (`DIAS_PARA_VENCER`).
5. **Accesorios de internet:** productos agrupados por tipo y precio («Aretes S/ 15») en el catálogo normal. No necesitan código.
6. **Sin módulo nuevo:** es una pestaña de `/recibir`, que ya es la entrada de almacén (ADR-0113). La firma usa `fn_actor_persona_id(true)` y el combo «Responsable» (ADR-0161/0162).

Candados en la base: `anular_venta` salta la línea pendiente y la tabla pasa a `anulada` (trigger en `ventas`). Un **cambio o devolución** de una prenda todavía pendiente se rechaza (`prenda_sin_regularizar`), porque no se sabe a qué stock vuelve. Un check impide una fila «regularizada» a medias.

## Alternativas descartadas

- **Crear el producto desde caja** (la opción 4 que Felipe consideró): obliga a fijar el precio oficial en hora punta, cuando él decidió que lo fija almacén, y llena el catálogo de duplicados («blusa beige» / «Blusa Beige lino»).
- **Aprobación de la encargada o tope diario en caja:** Felipe prefirió no frenar la venta y hacerla visible.
- **Mantener el stock ficticio de la centinela y restar después:** dejaba dos salidas `venta` por línea (la centinela y la real) y obligaba a reescribir `anular_venta` y los reportes para distinguirlas.

## Se rompe si

- **Un ítem de venta usa la clave `descripcion`.** `transmision-reglas.ts` trata un ítem con `descripcion` como **comprobante manual**, cuyo precio ya viene sin IGV, y declararía a SUNAT un monto equivocado. Por eso el dato viaja como `descripcion_libre`. El comprobante lo usa como nombre de la línea y sigue tratando el precio con IGV (hay prueba).
- **Alguien reescribe `registrar_venta` o `anular_venta` copiando un ARCHIVO.** Su versión viva no está en ningún archivo: la nota de venta (20260922224300), la firma del responsable (20260923100000) y esta migración las parchan en vivo con `pg_temp.reemplazar`. La primera versión de esta migración copiaba el archivo y habría quitado la nota de venta de la caja; se detectó comparando huellas con producción antes de pegar. Todo cambio a estas dos funciones va como parche sobre la definición viva.
- **Se pega en producción una versión vieja de `registrar_venta` o `anular_venta`** encima de esta: la prenda sin registrar volvería a mover stock inexistente, o la anulación fallaría con «se esperaba 1 salida». Antes de pegar, verificar contra `pg_proc` que quede una sola sobrecarga de cada una.
- **Se vuelve a sembrar stock para la centinela.** Ninguna consulta lo necesita. Si alguien lo siembra, cualquier regla que cuente stock «por variante activa» vuelve a verla.

## Cómo se verifica

`pnpm pruebas:prendas-por-regularizar` (15 casos con ROLLBACK contra el Postgres local): datos incompletos, cantidad 2, fila pendiente, anular pendiente, cambio bloqueado, venta normal sin fila, las dos formas de regularizar con su efecto en stock, diferencia negativa y positiva, doble regularización, forma inválida, centinela como destino, sin stock para descontar, otra sede y anular una regularizada. Vitest: `prenda-sin-registrar-reglas`, `por-regularizar-reglas`, `transmision-reglas` e `inicio-reglas`. En el navegador (local, 2026-09-23): el modal de caja y la línea en el ticket, la pestaña con una vencida y una regularizada, y la cola en el inicio del líder.
