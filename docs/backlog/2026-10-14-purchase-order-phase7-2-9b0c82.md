## Producción ▸ Órdenes de insumos, fase 7 parte 2: el papel y la recepción en el Taller (2026-10-14) — rama `claude/purchase-order-phase7-2-9b0c82`

ADR-0362 (decisiones 17, 18, 47, 52, 53, 62, 63 y 84 a 88). Contrato: `contrato-ordenes-de-insumos.md` («Cambios al construir la parte 2»).

- [x] 1 · El comprobante de la orden, al crédito (`20261015015000`, `20261015020000`; `/ordenes-insumos/comprobante/[id]`).
- [x] 2 · Pagarlo al contado desde una cuenta o desde «Mi fondo» (`20261015034000`).
- [x] 3 · Recibir en el Taller contra la orden (`20261015035000`, `20261015040000`; la sección «Órdenes de insumos» de Producción ▸ Recibir).
- [x] 4 · Lo que no llegó, anotado en la orden (`20261015043000`; «Nos debe» en la orden y en la lista).
- [x] 5 · Cierre: /chaos (semilla 1072), guías y huellas, ADR, contrato.
- [x] **Pegado en producción el 2026-10-15**, en este orden y una sola vez: `20261015015000` → `…020000` → `…034000` → `…035000` →
  `…040000` → `…043000` (las 16 funciones tocadas, con la misma huella que en el banco). Diccionario refrescado
  (`docs/datos/generado/`, foto del 2026-10-15 05:24 UTC). Volver a pegar la `…020000` después de la `…034000` deshace el contado.
- [x] **/chaos, gravedad 1:** anular el papel de una orden ya no deja lo recibido o lo anotado sin respaldo (`anular_comprobante_produccion`
  bloquea la orden y lo impide; decisión 86, prueba en `pruebas:recepcion-orden-insumo`).
- [x] **/chaos, textos sin tope en la base:** código de lote hasta 40 letras, referencia del pago hasta 100, un pago hasta 20 medios.
- [ ] **/chaos, gravedad 2 (de Felipe):** la coma decimal («1.299,50» se lee 1.2995; es la decisión pendiente de la coma en todo el ERP) y
  el piso y techo de las fechas (una emisión de 1900 entra; también en el papel de Compras).
- [x] **/chaos, gravedad 4:** el porqué de un número que no vale queda escrito sobre los botones; tras un corte, corregir el papel ofrece
  «Recargar».
- [x] **/formidable del papel y de Recibir:** los 3 + 3 cambios hechos (decisiones 87 y 88) y medidos en el navegador: 7,1 → 7,9 y 6,8 → 7,7
  (provisionales). Falta repetir la ciega sobre lo nuevo.
- [ ] El porqué de un número que no vale vive sobre los botones, fuera del pie fijo: con la hoja arriba se lee al bajar. Es de la pieza
  (`PieGuia conFrase`, seis hojas), no de esta pantalla.
- [ ] Probar con una persona real del Taller que NO hizo la orden (la 17) y con una cuenta que solo tenga «Órdenes de insumos».
- [ ] Visto de paso, no es de esta fase: la caja fuerte del Taller puede quedar en negativo al pagar en efectivo; «Anular este
  comprobante» del detalle de un comprobante del Taller es un enlace y no `btn-peligro`; el Diario no asienta los pagos del Taller.
- [ ] Visto de paso (Compras, otra pantalla): la guía del papel de una orden de compra hace clic en «Contado» y en «Crédito», y al salir deja
  «Crédito» elegido aunque ese papel no trae nada puesto desde el 13/10 (`apps/web/lib/guias/pantallas/compras.ts:1757-1776`). Tarea aparte.
