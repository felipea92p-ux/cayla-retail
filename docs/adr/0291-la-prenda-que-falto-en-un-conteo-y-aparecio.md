# ADR-0291 · La prenda que faltó en un conteo y apareció se registra enlazada a ese conteo

- **Fecha:** 2026-10-01 · **Estado:** construido y probado en local (SQL con ROLLBACK, 259 archivos de pruebas web). **La migración `20261001120000` NO está en producción**; sin ella la web no se cae (la pregunta simplemente no aparece).
- **Pedido:** Felipe, 2026-09-30, tras probar Conteo con la cuenta de Almacén Trujillo: si un conteo cerró con «falta 1» y la colaboradora la encuentra después, «tiene que indicar que ya la encontró y registrarla en el ERP por medio del conteo o ajuste, y si es por ajuste directo tiene que saber que fue por ese conteo anterior y arreglar ese conteo también automáticamente, para mantener un equilibrio en todo». Eligió la opción B (ajuste que pregunta) y dijo que Finanzas, en pausa, no cuenta para esta decisión.
- **Complementa:** ADR-0282 (Conteo; «Editar conteo» y la nota del cierre). **Toca:** ADR-0240 (`ajustar_inventario`), ADR-0250 (módulo «Ajustar stock»).

## Problema
Un conteo cerrado con falta ajusta el stock (−1, `motivo = 'conteo'`). Si la prenda aparece, había dos caminos: «Editar conteo» (reabre y corrige) o un ajuste suelto en Existencias, que suma 1 **sin ninguna relación** con el conteo: el conteo sigue diciendo «faltó 1», la pérdida queda como real, y nadie sabe que apareció.

## Decidí
- **El libro no se edita ni el conteo se reabre.** Un ajuste positivo puede llevar la línea del conteo donde faltó (`conteo_item_id`): queda como movimiento `tipo = 'ajuste'`, `motivo = 'hallazgo_conteo'`, enlazado a esa línea. El conteo conserva lo que se contó ese día (`diferencia = −1`, verdad histórica) y su resultado dice «✓ La encontraron después: 1 recuperada» leyendo el libro (`hallazgos` en `fn_conteo_lineas_json`). «Arreglar el conteo» = que lo pendiente baje, no que su historia cambie.
- **Dónde se pregunta:** en «Ajustar inventario» (Existencias). Si sumas una prenda que faltó en un conteo **cerrado** de esa tienda y aún no se recupera, la fila trae «Faltó 1 en el Conteo 13 (30/09). ¿Es la que se encontró?» con «Sí, es la del Conteo 13» / «No, es otra cosa». **La respuesta es obligatoria** (no se adivina; sin ella no se confirma). Con «sí» solo se puede sumar lo que faltó (`hallazgo_excede`); con «no» se suma lo que sea.
- **Tres piezas en la base** (una migración, sin tablas): `fn_faltantes_de_conteo(ubicación, variantes[])` (lectura: lo que faltó y no se recuperó, más reciente primero); `registrar_hallazgo_de_conteo(...)` (la ÚNICA puerta del motivo; mismo candado que un ajuste; `for update` sobre la línea para que dos personas no recuperen más de lo que faltó; sin `EXECUTE` para la web); y `ajustar_inventario` acepta `conteo_item_id` opcional por línea (sin él, idéntico a antes, misma huella del reintento) y devuelve `enlazados`.
- **Movimientos** lo nombra («Ajuste · encontrada tras un conteo», «Registró el hallazgo») y, como cualquier movimiento con `conteo_item_id`, muestra su Conteo N como documento.

## Descarté
- **Reabrir el conteo y cambiar su cantidad al ajustar:** reescribe la historia del conteo y exige que ese conteo pueda reabrirse (uno abierto por sede; solo modelo nuevo).
- **Un movimiento inverso del cierre:** duplica el asiento; el hallazgo enlazado lo dice sin tocar nada.
- **Una columna `recuperadas` en `conteo_items`:** un dato derivado más; el libro ya lo tiene.
- **Ampliar `registrar_movimiento` con el enlace:** se llama desde muchas partes y cambiaría su firma (núcleo mínimo).
- **Bloquear los ajustes positivos y obligar a «Editar conteo» (opción C):** fricción en el mostrador para lo que es un gesto natural.

## Se rompe si
- alguien escribe un ajuste con `motivo = 'hallazgo_conteo'` sin pasar por `registrar_hallazgo_de_conteo` (recuperaría más de lo que faltó);
- `cerrar_conteo` deja de escribir `diferencia` negativa en la línea que faltó (la función no la vería);
- una prenda tiene faltas en varios conteos: el modal pregunta por el más reciente; para las otras hay que ajustar de nuevo (queda la más antigua sin enlazar hasta que se enlace la reciente);
- se reabre un conteo con hallazgos y se vuelve a contar: el «debe haber» ya trae lo recuperado y la nota de Conteo lo cuenta como «entró N» (correcto, pero no dice que fue el hallazgo).

## Se degrada así (todo puede fallar)
Si `fn_faltantes_de_conteo` no existe todavía en la base (la web salió antes que el SQL) o falla, el modal no pregunta nada y el ajuste sigue como siempre. Si `ajustar_inventario` rechaza el enlace, la transacción se deshace entera (todo o nada) y el modal dice por qué; nada queda a medias.

## Cómo se pega
`supabase/migrations/20261001120000_conteo_hallazgo_por_ajuste.sql`, en una sola parte y DESPUÉS de `20260930050100` (solo `create or replace function` más un índice `if not exists`). Para volver: repegar `ajustar_inventario` de `20260928130000` y `fn_conteo_lineas_json` de `20260930050100`, y `drop function` de las dos nuevas.

## Verificación
SQL contra el Postgres local, en una transacción con ROLLBACK: cierre con falta → `fn_faltantes_de_conteo` la lista (faltaron 1, pendientes 1) → cinco rechazos con su hint (`hallazgo_otra_prenda`, `hallazgo_no_existe`, `hallazgo_excede`, `ajuste_linea_invalida` con cantidad negativa, `hallazgo_otra_sede`) → el hallazgo (stock 0 → 1, `enlazados = 1`, ya no queda faltante, la línea del conteo sigue en `diferencia = −1` con `hallazgos = 1` y `ajustado_total` intacto) → enlazar otra vez se rechaza → un ajuste sin enlace sigue funcionando. Web: pruebas de las reglas puras (`faltantesDesdeJson`, `candidatasDeHallazgo`, `resolverHallazgos`, textos, envío) y de `textoHallazgoDeLinea`. **Sin ver en el navegador todavía.**
