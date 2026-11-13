## Compras → Existencias (rama compras-stock-cayla-c20350, ADR-0636)
- [x] `20261109231000`, `20261109235000`, `20261110004000` en producción (2026-11-09).
- [x] `20261110011000` probada (20 casos) y revisada; arreglos de la revisión aplicados. Falta el OK de Felipe para pegarla.
- [ ] DECISIÓN de Felipe (ya hay un caso parcial real: Victor Hugo Pun, 24 de 40): «no se une si llegó menos de lo comprado» (hoy) o permitir varias uniones por papel (PK `(papel_id, despacho_id)`) para que el resto llegue después.
- [ ] Pendientes menores de la revisión (visibilidad, no descuadran stock ni libro): (1) `recepciones_sin_comprobante` apaga el exceso llegado de más (13 llegadas contra 8 comprados) en cuanto una fila queda repartida en parte: restar lo repartido de `m.cantidad`; (2) `reabrir_envio` deja reabrir una recepción unida cuyo papel ya pasó al libro: extender `fn_envio_reabrir_bloqueo` con `reabrir_papel_completado`; (3) `fn_bal_por_recibir` suma el movimiento entero por línea (preexistente de 20261106001000).
- [x] Paso 3, la función: `20261110022000` (`fn_uniones_posibles`), probada (L1 a L6). Sin pegar; va DESPUÉS de `20261110011000`.
- [ ] Paso 3, la pantalla: la lista con «Unir» por pareja (hoy solo existe la función). El envío 2 de TRU (Victor Hugo, 40 prendas, 24 llegadas): que no lo cierren hasta revisar la boleta.
- [ ] Pantalla que llama a `unir_recepcion_con_compra` y su guía interactiva.
- [ ] Pegar `20261110011000` en producción, en dos partes y con OK de Felipe.

## Hallazgo real del 2026-11-10 (Victor Hugo Pun / marca Matic Moda, TRU) — SIN ARREGLAR, espera a Felipe
- Compra del 28-oct: boleta S/ 755, 40 prendas (orden 2, destino TRU), envío propio ENV 2 abierto con 32 de sus prendas ya contadas.
- Esas prendas YA ENTRARON al stock de TRU el 29-oct por «alta del producto» (lote sin envío, nota «Llegó con el alta del producto», proveedor Victor Hugo): 35 prendas (Top Brillos 9, Short Saskia 8, Polo Odaly 9, Polo Mia 9). Varias ya vendidas. Si TRU cierra el ENV 2, entran otras 32: doble conteo (~S/ 600).
- Además entraron «sin aviso» de Victor Hugo: recepción 7 (abierta, 15: Blusa Encaje, Top Bandana) y recepción 12 (cerrada, 9: Straple Destellos). En total 59 prendas de Matic Moda desde el 28-oct contra 40 compradas: al menos 19 sin compra registrada.
- La unión de 20261110011000 solo cubre recepciones «sin aviso»; una carga por «alta del producto» es una tercera puerta que NO cubre. Decisión de Felipe pendiente: extender la unión a esa puerta, o sacar esas líneas del conteo del ENV 2.
- NADA se tocó en producción. Pasos humanos: TRU no cierra el ENV 2; la compradora confirma qué compras de Victor Hugo hizo desde el 28-oct y qué pasó con «Polo ateriza» (5 contadas, sin entrada).
- Corrección de la lista de parejas (`fn_uniones_posibles`) antes de su pantalla: comparar también categoría y marca, no solo proveedor, sede y cantidad.
