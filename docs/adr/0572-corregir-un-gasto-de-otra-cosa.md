# ADR-0572 — Corregir un gasto de «otra cosa» (Mis compras)

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local; la migración `20261029171000` **NO está en producción** (corrige dinero de la compradora y deja rastro: la pega Felipe, con su OK puntual).
- **Continúa a:** [ADR-0561](0561-corregir-una-compra-ya-anotada.md) (el modelo: corregir mientras Compras no revisa, la plata vuelve sola, todo o nada, rastro que no se borra) y [ADR-0480](0480-compras-simple-en-cuatro-pasos.md) («Gasté en otra cosa»). Se apoya en [ADR-0569](0569-reabrir-la-ultima-ronda-de-compras.md) para las rondas cerradas.
- **Origen:** Felipe, 2026-10-29, viendo la lista de la ronda con «Comida · Sin papel · Compras lo revisa · − S/ 4.00» y «Saco Piñata · … · − S/ 3.00»: «se deben poder editar, igual que ya se pueden corregir las compras ya anotadas».

## El problema

Un gasto anotado con «Gasté en otra cosa» no se podía tocar: `fn_compra_gastos_inmutable` congela concepto, nota, monto y foto, y no había puerta de corrección. Quien anotaba «Comida S/ 4» y era
«S/ 14», o «Otro: Saco Piñata» y era otra cosa, tenía el error adentro de «Tienes para comprar» y del cuaderno de su ronda hasta que Compras lo viera al revisarlo.

## Lo que se decidió

1. **La plata vuelve sola, sin escribir un movimiento.** Mientras el gasto está «por completar», su monto NO está en el libro de dinero: sale de `compra_gastos.monto`
   (`fn_mi_plata_tiene` lo resta; `fn_ronda_compras_de` y `fn_ronda_compras_cuenta` lo suman a «gastaste»). Corregir el monto recalcula las dos cuentas sin tocar ninguna de esas funciones. Al revisarlo Compras
   (`revisar_gasto_compra`), el gasto pasa a los libros: por eso la corrección **termina ahí**.
2. **Cuándo se puede** (`fn_compra_gasto_corregible`, una sola regla para leer y guardar): solo quien lo anotó; solo `por_completar` (Compras todavía no lo revisó); solo con su ronda **abierta**. Sin ronda
   (anotado antes de las rondas) o ya revisado o anulado, no.
3. **Qué se corrige:** en qué gastó (concepto, y con «Otro» qué fue), cuánto y la foto del papel (sumarla o cambiarla; **no quitarla**: nada se borra, la ruta vieja queda en el rastro). No se cambia la fecha, la ronda ni quién lo anotó.
4. **Una ronda cerrada se reabre primero.** Si la ronda ya se cerró, la hoja dice «Reábrela desde Rondas anteriores» (ADR-0569). Reabrir deshace el cierre (se archiva) y al cerrar otra vez el monto sale de lo que de verdad
   tiene, ya con el gasto corregido: nunca queda un cierre con una cifra vieja. Y como reabrir solo es posible mientras Compras no recibió el cierre, un gasto de una ronda cuyo cierre ya movió plata no se corrige.
5. **Todo o nada, una sola vez.** `corregir_gasto_rapido(gasto, lote, concepto, nota, monto, foto)` valida con las mismas reglas de `registrar_gasto_rapido` antes de escribir; el `lote` nace al abrir la hoja: dos toques con el mismo lote devuelven
   lo que ya quedó (`ya_estaba`); el mismo lote en otro gasto se rechaza. «No cambiaste nada» no escribe.
6. **Rastro que no se borra** (`compra_gasto_correcciones`, append-only con disparador): una fila por dato (cuál, antes y ahora), quién y cuándo, por lote. Se lee con `fn_gasto_correcciones` (quien lo anotó o quien tiene Revisar compras)
   y se ve como «Corregida · Ver qué cambió» en el detalle de la fila. La foto no manda su ruta, solo si había.
7. **Candados:** la ronda de la compradora (la misma clave `compra_ronda:` de abrir, cerrar, reabrir y anotar), después el del gasto (`compra_gasto:`, la de anotarlo) y la fila `for update`, que es también lo primero que toma `revisar_gasto_compra`: si Compras lo
   revisa a la vez, uno espera al otro y, si gana Compras, la corrección ve «revisado» y no escribe nada.
8. **El disparador `fn_compra_gastos_inmutable`** se reescribe entera: quién lo anotó, su fecha, su huella (la de lo anotado al principio: reintentar el guardado original sigue devolviendo lo que ya quedó) y su ronda no cambian nunca; concepto, nota, monto y foto solo cambian con la marca de la
   transacción `retail.gasto_corrigiendo` = el id de ESE gasto (la marca de otro no sirve), que solo pone `corregir_gasto_rapido`. Un gasto sigue sin borrarse; `estado` lo sigue cambiando Compras.
9. **Web:** el detalle de una fila de gasto pendiente (`DetalleDeFila`) ofrece «Corregir este gasto» (cierra el detalle y abre su hoja: nunca una hoja sobre otra). `HojaCorregirGasto` es la misma hoja de «Gasté en otra cosa» con lo anotado ya puesto
   (los campos son UNA pieza, `CamposDelGasto`, que usan las dos: ADR-0358), un cuadro de «lo que cambia» (antes → ahora) con la frase de su plata («Tu plata baja S/ 10.00») y el botón «Guardar N cambios». Si la base dice que ya no se puede, la hoja se abre en solo lectura
   con el motivo en palabras de tienda. Lógica pura en `lib/corregir-gasto-reglas.ts`; lo de la base en `lib/corregir-gasto-acciones.ts`. La acción se firma con la clave `gasto_corregir` (sin combo: 67 claves, web y base).

## DESCARTÉ

- **Corregir un gasto ya revisado:** ya está en los libros como gasto del viaje con su papel; cambiarlo exigiría un asiento que compense. Se avisa «Avísale a Compras».
- **Corregir el gasto de una ronda cerrada recalculando su cierre:** el cierre ya pudo mover plata (devolver, que le deban); además duplicaría la lógica de la ronda. Reabrir (ADR-0569) es el camino que ya existe y cubre también cambiar de idea sobre lo que hace con lo que le sobró. (El encargo original decía «ronda abierta **o la última cerrada** sin cierre recibido»: eso es exactamente lo que reabrir permite, solo que en dos toques y sin tocar el cierre a mano.)
- **Reusar `compra_correcciones`:** su `papel_id` es una llave a `compra_papeles` y su `campo` un conjunto cerrado de prendas y papel; mezclar gastos habría exigido un `alter table` de una tabla de otra función.
- **Quitar la foto:** «nada se borra».
- **Una columna `corregido` en `compra_gastos`:** `alter table` de una tabla en uso y dato derivable del rastro.

## Cómo se verificó

- `pnpm pruebas:compras-simple-corregir-gasto` (13 casos de Postgres, migraciones pegadas dos veces, ROLLBACK): módulo como llave y gasto ajeno; la plata y el «gastaste» de la ronda se mueven sin escribir un movimiento de dinero; concepto/nota y su rastro; foto (sumar, cambiar, no quitar,
  el rastro no manda rutas); todo o nada (monto 0, 3 decimales, «Otro» sin nota, concepto raro, foto de otra carpeta, «no cambiaste nada»); dos toques con el mismo lote y el mismo lote en otro gasto; revisado y anulado; ronda cerrada → reabrir → corregir → el cierre nuevo trae el monto corregido
  (26.00 de 40.00 − 14.00); sin ronda; el disparador (edición a mano, borrar, marca de otro gasto, fecha aun con marca); rastro inmutable y la API sin acceso; permisos; idempotencia de la migración. Suma a `PRUEBAS` de `scripts/ci/pruebas-postgres.mjs`.
- `lib/corregir-gasto-reglas.test.ts` (14), la suite de la web completa (733 archivos), `tsc`, `knip` y `knip:produccion`, la guía de «Mis compras» (huella aceptada tras revisar el paso «En esta ronda») y las pruebas de la clave de firma (67).
- En el navegador (página temporal con respuestas inventadas de la base, ya borrada): el botón «Corregir este gasto» en el detalle, la hoja con lo anotado, «S/ 4.00 → S/ 14.00 · Tu plata baja S/ 10.00 · Guardar 1 cambio», lo que se manda a la base, el aviso de éxito, el caso «Compras ya lo revisó» en solo lectura y «Otro: Saco Piñata» a 375 px sin desborde.

## Qué se rompería si estuviera mal

Una plata que no vuelve (o baja dos veces) en «Tienes para comprar»; un cierre de ronda con una cifra vieja; un gasto que Compras ya pasó a los libros y la compradora cambia después (dos montos distintos). Cada una tiene su caso en la prueba.

## Lo que no se hizo

- **Avisar a Compras que un gasto fue corregido** al revisarlo (`GastosPorRevisar.tsx`): hoy `revisar_gasto_compra` lee el monto de la fila en el momento de revisar, así que Compras siempre pasa a los libros el monto vigente; pero si tenía la hoja abierta con el viejo, no se entera. Un chip «Corregido» ahí exige parchar `fn_revisar_compras` (reemplazo anclado, otra migración): backlog.
- **El chip «Corregida» en la fila de la lista** (igual que las compras, ADR-0561): se ve al abrir el detalle.
- **`/formidable` y `/chaos`** de la hoja nueva, y verla con una cuenta de compradora real en el navegador: la prueba fue con la base simulada, así que «Corregida · Ver qué cambió» (que lee `fn_gasto_correcciones`) no se vio con datos reales; su lectura sí está probada en la base y en `lib/corregir-gasto-reglas.test.ts`.

## Para pegar en producción (con el OK de Felipe)

Una sola parte (tabla nueva vacía con RLS, una función de disparador reemplazada y funciones nuevas; sin `alter` de tablas en uso, sin políticas ni `drop trigger`), después de `20261029150000`. Idempotente. El deploy de la web puede ir antes: sin la función, la hoja dice «No se pudo leer el gasto» y nada más se rompe.
