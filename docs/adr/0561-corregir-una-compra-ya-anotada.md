# ADR-0561 — Corregir una compra ya anotada (Mis compras)

- **Fecha:** 2026-10-28 · **Estado:** construido en la rama `claude/algo-nuevo-opciones`; la migración `20261029012000` **NO está en producción** (cambia dinero y el historial de una compra: la pega Felipe, con su OK puntual).
- **Relacionados:** ADR-0480 (Compras simple), ADR-0543 (candados de la auditoría, la clave `compra_ronda:`), ADR-0207 (actividad), ADR-0136 (movimiento de hojas).
- **Origen:** Felipe, 2026-10-28: «que se pueda editar una compra que ya realicé dentro de mi ronda, quizás me confundí en algo». Maqueta: `docs/maquetas/mis-compras-corregir-2026-10/`. Su recorrido: ver todas las prendas de la compra y, al tocar una, recién ahí cambiar sus datos.

## El problema

Una compra anotada desde el celular no se podía tocar: `fn_compra_papeles_inmutable` congela lo anotado y las líneas de la orden no tenían puerta de corrección. Quien se equivocaba (un costo de 300 que era 220, 5 unidades que eran 8) tenía que pedirle a Compras que lo arreglara al completar el papel, y mientras tanto «Tienes para comprar» salía de lo anotado, con el error adentro.

## Lo que se decidió

1. **La plata vuelve sola, sin escribir un movimiento.** Mientras el papel está «por completar», lo que la compradora tiene sale de restar lo PAGADO de ese papel (`fn_mi_plata_tiene`); no hay nada en el libro de dinero. Corregir el papel recalcula la cuenta. Al completar Compras, el pago pasa al libro (que no se edita): por eso la corrección **termina ahí**.
2. **Cuándo se puede** (`fn_compra_corregible`, una sola regla para leer y guardar): solo la dueña de la compra; el papel `por_completar`; de una ronda aún abierta; sin una orden anulada por otra vía; y sin factura registrada contra sus líneas.
3. **Qué se corrige.** Por prenda: unidades, costo y precio de venta (de 0 a 5 000; el 0 solo donde el catálogo lo admite). En una prenda de «Algo nuevo», también nombre, categoría y marca; en una **del catálogo, no** (eso cambiaría el catálogo de toda la empresa: es de Catálogo ▸ Productos y la base lo rechaza, `compra_corregir_del_catalogo`). Cambiar de **tienda**: solo si de esa prenda no salió nada. Y el **papel y el pago** (cuánto dice el papel, cuánto pagó y cómo). **No** se cambia el proveedor, la fecha, el tipo de papel ni quién la anotó.
4. **Dos valores de fábrica (Felipe los aprobó con la lista):** el papel acompaña a las prendas **solo si ya cuadraba**; lo pagado acompaña al papel (pagó todo → todo el monto nuevo; una parte → no pasa del monto). Lo escrito a mano en «Papel y pago» manda sobre esa cuenta. Y una prenda **no baja de lo que ya salió en un envío**.
5. **Todo o nada, una sola vez.** `corregir_compra_rapida(papel, lote, cambios, papel_a_mano)` valida todo antes de escribir; el `lote` nace al abrir la hoja: dos toques con el mismo lote devuelven lo que ya quedó (`ya_estaba`); el mismo lote en otra compra se rechaza.
6. **Rastro que no se borra** (`compra_correcciones`, append-only con disparador): una fila por dato (cuál, antes y ahora), quién y cuándo, agrupadas por lote. Se lee con `fn_compra_correcciones` (quien anotó la compra o quien tiene Revisar compras) y se ve como «Corregida · Ver qué cambió» en el detalle de la compra y en el de Revisar compras. Una orden que se queda sin prendas al mover todas a otra tienda se **anula con su motivo** («Corrección de la compra: …»), nunca se borra, y ese motivo la deja fuera del bloqueo de «orden anulada».
7. **Candados, en este orden:** la ronda (la misma clave de abrir y cerrarla), mandar a la tienda, el papel; y las filas del papel y de sus líneas `for update`. Una corrección y un envío o un cierre a la vez se ponen en fila; Compras al completar espera la fila del papel.
8. **Web:** botón «Corregir esta compra» en el detalle de una compra pendiente (cierra el detalle y abre su hoja: nunca una hoja sobre otra). La hoja: lista de prendas de solo lectura → formulario de la prenda tocada (en la misma hoja, con «‹» para volver) → «Papel y pago» → «Revisa lo que cambias» (Antes → Ahora, qué pasa con la plata) → guardar. Lógica pura en `lib/corregir-compra-reglas.ts`; lo de la base en `lib/corregir-compra-acciones.ts`. La acción se firma con la clave `compra_corregir` (sin combo con una cuenta de persona).

## Lo que NO se hizo

- **Anular una compra entera** (H5 de la auditoría): decisión de Felipe, aparte.
- **Corregir después de que Compras completa:** exigiría un asiento que compense o una nota de crédito. Se avisa «Avísale a Compras».
- **Un saldo a favor con el proveedor** si se entregó de más por Yape: la corrección arregla lo anotado; que el proveedor devuelva la plata no se registra hoy.
- **El chip «Corregida» en cada fila de la lista de la ronda**: `fn_mi_plata_compras` no lo trae; se ve al abrir el detalle. Sumarlo es un reemplazo anclado de esa función (otra migración).
- Concurrencia real entre dos conexiones: la base local es compartida y el rastro no se puede borrar; se verificó que los candados están tomados y son los mismos de las funciones que compiten.

## Cómo se verificó

`pnpm pruebas:compras-simple-corregir` (29 casos de Postgres con ROLLBACK, incluido un ataque al azar de 4 semillas × 60 correcciones con las invariantes mirando tras cada una); `lib/corregir-compra-reglas.test.ts` (37); suite de la web, `knip`, guías y huellas. Sin hallazgos del ataque.

## Qué se rompería si estuviera mal

Una plata que no vuelve (o que baja dos veces) en «Tienes para comprar»; una prenda con menos unidades de las que ya salieron a la tienda; o una orden vacía que Compras vería como compra. Cada una tiene su invariante en la prueba.

## Para pegar en producción (con el OK de Felipe)

Una sola parte (tabla nueva vacía con RLS, funciones y permisos; sin políticas ni `drop trigger`), después de `20261027231000`. Idempotente. El deploy de la web puede ir antes: sin la función, la hoja dice «No se pudo leer la compra» y no rompe nada más.

## Actualización 2026-11-16 — corregir con el envío todavía sin recibir (`20261116215000`)

**El caso.** El ENV-24 de Trujillo decía «Aretes: dijeron 93, contaste 84» y «Por definir: 13 sin contar». No faltaba nada: la compradora anotó mal la cantidad de aretes y, al leer las notas, tres prendas que nunca se compraron. Nadie podía arreglarlo desde el sistema: la regla 4 («una prenda no baja de lo que ya salió en un envío») cerraba la puerta apenas la compra viajaba, y no había cómo quitar una prenda. Ese día las 13 se quitaron a mano en la base, con su copia en Actividad (`envio_lineas_quitadas`).

**Lo que cambia (pedido de Felipe: «que se arregle desde el sistema»):**

1. **Bajar lo que viajó**, mientras lo que sobra esté en un envío en camino o abierto que la tienda todavía no recibió. Lo que la tienda ya recibió (entradas, faltantes, pendientes, separaciones o salidas de esa línea, `fn_despacho_item_fijo`) no baja. La línea del envío baja con la compra, del envío más nuevo al más viejo, y queda con al menos 1. Lo contado no frena ni se toca: se compara después con lo corregido. El envío sube de versión, así que quien cuenta recarga antes de cerrar. Reemplaza a la regla 4 de arriba.
2. **Quitar una prenda anotada por error** («Quitar: se anotó por error» en el formulario de la prenda). Sale de la compra y de su envío si la tienda no la empezó a contar ni anotó nada de ella, no tiene factura ni correcciones anteriores y no es la única prenda de su envío. Una compra se queda con al menos una prenda. Si la orden de una tienda queda vacía, se anula con su motivo («Corrección de la compra: se quitaron o se movieron todas sus prendas»).
3. **La fila se borra; el rastro queda.** La línea nunca existió en la realidad y no movió stock ni dinero. Archivarla con una columna obligaría a filtrarla en las decenas de funciones que leen esas tablas, y la que se olvide sumaría prendas fantasma. El rastro es `compra_correcciones` con `campo = 'quitada'`, lo que decía («Lentes · 3 × S/ 5.40») y su id en `prenda_quitada_id`, una columna sin llave. El índice único del rastro la incluye, para que dos prendas quitadas en la misma corrección no choquen.
4. **El dinero sigue la regla 2 de siempre:** el papel acompaña a las prendas solo si ya cuadraba, y lo escrito a mano en «Papel y pago» manda. La hoja muestra la cuenta antes de guardar.

**Quién:** la dueña de la compra, como antes. Que un líder pueda corregir la compra de otra persona quedó propuesto y sin decidir.

**Cómo se verificó:** `pnpm pruebas:corregir-compra-envio-abierto` (12 casos con ROLLBACK, en una base desechable levantada desde cero con todas las migraciones), más las de siempre en verde (`compras-simple-corregir` 29/29, `mis-compras-por-definir` 13/13), `lib/corregir-compra-reglas.test.ts` (46), la suite de la web y la hoja en el navegador con una compra inventada (escritorio y 375 px).
