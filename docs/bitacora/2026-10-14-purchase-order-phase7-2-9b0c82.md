## Producción ▸ fase 7 de las órdenes de compra, parte 2: el papel y la recepción de la orden de insumos en el Taller (2026-10-14) — rama `claude/purchase-order-phase7-2-9b0c82`

- **Qué:** la orden de insumos ya tiene su papel y su recepción. «Registrar comprobante» copia la factura, boleta, nota de venta o compra
  sin comprobante del proveedor con lo pendiente ya puesto, al crédito (con el vencimiento sugerido por el plazo del proveedor) o al
  contado, pagada en el acto desde una cuenta o desde «Mi fondo». En Producción ▸ Recibir, la orden se recibe en el Taller: un lote con su
  movimiento por línea, el costo a la vista y corregible, y «el resto no va a llegar» con su motivo, que queda en la orden como lo que el
  proveedor nos debe (y el chip «Nos debe» en la lista). Quien hizo la orden no la recibe; una orden con papel o recibida ya no se edita.
- **Por qué:** ADR-0362, decisiones 17, 18, 47, 52, 53, 62 y 63, y las dos de hoy: pagar al contado «como en tienda» (84) y lo que no
  llegó «anotado en la orden» (85). Lista de 5 actividades aprobada por Felipe, un commit por actividad.
- **Cómo:** seis migraciones (`20261015015000` → `…043000`), dos suites nuevas (`pruebas:comprobante-orden-insumo` 23/23 y
  `pruebas:recepcion-orden-insumo` 18/18, con dos sesiones a la vez) y las vecinas en verde; cada pantalla de punta a punta en un banco
  propio (`cayla-oi`). /chaos (semilla 1072): 84 casos en la base, 11 de concurrencia y 21 en el navegador; encontró un hueco de gravedad 1
  (anular el papel de una orden en Producción ▸ Comprobantes deja lo recibido o lo anotado sin respaldo), 3 de gravedad 2 y 2 de gravedad
  4, todos esperando el OK de Felipe. También que el banco había perdido el contado al volver a pegar la 020000: se pegan en orden y una
  vez. **Sin pegar en producción** (las seis esperan el OK de Felipe).
