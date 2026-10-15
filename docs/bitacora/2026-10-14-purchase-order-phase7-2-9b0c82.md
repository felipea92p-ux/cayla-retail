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
  vez.

## Producción ▸ fase 7 parte 2: los arreglos de /chaos y /formidable, y en producción (2026-10-15) — rama `claude/purchase-order-phase7-2-9b0c82`

- **Qué:** con el OK de Felipe, el papel de una orden ya no se anula si responde por lo recibido o lo anotado (decisión 86), la base pone tope
  a los textos que solo frenaba la pantalla, el papel arranca sin nada elegido y su pie dice qué se va a registrar (87), la orden muestra lo
  que llegó fuera de ella y su estado dice lo mismo que Recibir, y la hoja de Recibir dice las cantidades que entran y qué pasa con cada
  resto (88). Las seis migraciones se pegaron en producción, en orden y una sola vez, y el diccionario se refrescó.
- **Por qué:** /chaos encontró un estado imposible (un papel anulado que dejaba un lote sin respaldo, o «El proveedor nos debe» por un papel
  que ya no vale) y /formidable, que sin tocar nada se registraba una factura al crédito con IGV y que la orden contradecía a Recibir.
- **Cómo:** primero la prueba que fallaba y después el arreglo (`pruebas:comprobante-orden-insumo` 24/24, `pruebas:recepcion-orden-insumo`
  25/25, con dos sesiones a la vez), el mismo ataque con la misma semilla (resiste) y el navegador del banco. En producción: las 16 funciones
  tocadas con la misma huella que en el banco y las 55 piezas de estructura iguales. El refresco del volcado trajo también lo que otras
  ramas habían pegado sin refrescar (el conteo de envíos y los sobrantes de traslado) y les dio pájaro. El CI pidió una séptima migración
  (`20261015112000`): las dos columnas nuevas de `insumo_lotes` nacieron sin permiso de lectura y el candado de dinero del Taller exige que se
  lea todo lo que no es dinero; se probó en el banco (la guardia de 19/20 a 20/20) y se pegó con el OK de Felipe.
