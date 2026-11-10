## Compras → Existencias (rama compras-stock-cayla-c20350, ADR-0636)
- [x] `20261109231000`, `20261109235000`, `20261110004000` en producción (2026-11-09).
- [x] `20261110011000` probada (20 casos) y revisada; arreglos de la revisión aplicados. Falta el OK de Felipe para pegarla.
- [ ] DECISIÓN de Felipe: «no se une si llegó menos de lo comprado» (hoy) o permitir varias uniones por papel (PK `(papel_id, despacho_id)`) para que el resto llegue después.
- [ ] Pendientes menores de la revisión (visibilidad, no descuadran stock ni libro): (1) `recepciones_sin_comprobante` apaga el exceso llegado de más (13 llegadas contra 8 comprados) en cuanto una fila queda repartida en parte: restar lo repartido de `m.cantidad`; (2) `reabrir_envio` deja reabrir una recepción unida cuyo papel ya pasó al libro: extender `fn_envio_reabrir_bloqueo` con `reabrir_papel_completado`; (3) `fn_bal_por_recibir` suma el movimiento entero por línea (preexistente de 20261106001000).
- [ ] Paso 3: lista para unir lo ya recibido (3 parejas exactas, 2 probables; el envío 2 de TRU: que no lo cierren hasta revisar la boleta de 40 prendas).
- [ ] Pantalla que llama a `unir_recepcion_con_compra` y su guía interactiva.
- [ ] Pegar `20261110011000` en producción, en dos partes y con OK de Felipe.
