## Producción ▸ Órdenes de insumos, fase 7 parte 2: el papel y la recepción en el Taller (2026-10-14) — rama `claude/purchase-order-phase7-2-9b0c82`

ADR-0362 (decisiones 17, 18, 47, 52, 53, 62, 63, 84 y 85). Contrato: `contrato-ordenes-de-insumos.md` («Cambios al construir la parte 2»).

- [x] 1 · El comprobante de la orden, al crédito (`20261015015000`, `20261015020000`; `/ordenes-insumos/comprobante/[id]`).
- [x] 2 · Pagarlo al contado desde una cuenta o desde «Mi fondo» (`20261015034000`).
- [x] 3 · Recibir en el Taller contra la orden (`20261015035000`, `20261015040000`; la sección «Órdenes de insumos» de Producción ▸ Recibir).
- [x] 4 · Lo que no llegó, anotado en la orden (`20261015043000`; «Nos debe» en la orden y en la lista).
- [x] 5 · Cierre: /chaos (semilla 1072), guías y huellas, ADR, contrato.
- [ ] **Pegar en producción, en este orden y una sola vez** (con el OK de Felipe): `20261015015000` → `…020000` → `…034000` → `…035000` →
  `…040000` → `…043000`. Volver a pegar la `…020000` después de la `…034000` deshace el contado. Después, `pnpm datos:generar:produccion` y
  `pnpm datos:comparar` (mientras tanto, las tablas `orden_insumo_recepciones` y `orden_insumo_cierres` **no están en producción** ni en el
  diccionario).
- [ ] **/chaos, gravedad 1 (espera el OK de Felipe):** anular el papel de una orden en Producción ▸ Comprobantes deja lo recibido o lo
  anotado como «no llegará» sin respaldo; a la vez que se recibe, los dos pasan. Arreglo propuesto: un candado en
  `anular_comprobante_produccion` (bloquea la orden y mira lo recibido y lo anotado) con su prueba en `pruebas:recepcion-orden-insumo`.
- [ ] **/chaos, gravedad 2 (de Felipe):** la coma decimal («1.299,50» se lee 1.2995; es la decisión pendiente de la coma en todo el ERP);
  una emisión de 1900 entra (también en el papel de Compras: ponerle piso y techo a las fechas); textos sin tope en la base (código de lote,
  referencia del pago, cantidad de medios de pago; solo por la API).
- [ ] **/chaos, gravedad 4:** en Recibir, el porqué de un número que no vale está solo en el `title` (con el mouse encima); tras un corte,
  corregir el papel antes de reintentar no ofrece «Recargar» (`token_reusado`).
- [ ] /formidable del papel y de la hoja de Recibir: ver `docs/formidable/README.md`.
- [ ] Probar con una persona real del Taller que NO hizo la orden (la 17) y con una cuenta que solo tenga «Órdenes de insumos».
- [ ] Visto de paso, no es de esta fase: la caja fuerte del Taller puede quedar en negativo al pagar en efectivo; «Anular este
  comprobante» del detalle de un comprobante del Taller es un enlace y no `btn-peligro`; el Diario no asienta los pagos del Taller.
