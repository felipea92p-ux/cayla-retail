## Compras ▸ fase 3 de las órdenes de compra: enviar a una sede (2026-10-12) — rama `claude/purchase-order-phase3-9b0c82`

- **Qué:** desde la orden abierta, «Enviar a una sede»: una guía a una sede, con número de guía opcional, lo que falta enviar ya puesto
  y el precio neto congelado en cada línea; el envío nace «en camino» (`ENV-000001`), se anula solo mientras va en camino, y la orden
  muestra «Enviado X de Y» y sus envíos. Una «Por repartir» se reparte en varias guías y ya registra su comprobante: la deuda es de la
  sede de quien hizo la orden (decisión 46). El stock no se mueve hasta que la sede recibe (fase 4).
- **Por qué:** ADR-0362, fase 3 (decisiones 12, 19, 22 y 46–49); Felipe pidió avanzar de corrido hasta la mañana del 2026-10-13 y
  respondió antes de irse cómo se paga una «Por repartir», si la guía de una orden «directo» es obligatoria y quién crea la prenda.
- **Cómo:** migraciones `20261012225000` (tablas `despachos` y `despacho_items`, `crear_envio`, `anular_envio`, lecturas para la sede y
  candado diferido del tope) y `20261012230000` (`fn_orden_compra_gestora`); `pnpm pruebas:ordenes-compra-envios` 17/17 (falla sin su
  migración), las de la fase 2 en verde sobre el banco con todo `main` (18 + 20 + 37), vitest completo y tsc en verde. En el navegador
  (banco propio): OC-000129 «Por repartir» → ENV-000061 a Tienda Trujillo con 32 de 48 unidades, la orden muestra «Enviado 20 de 36» y
  el envío «En camino» con «Anular envío»; modo oscuro sin hallazgos nuevos; dos sesiones mandando lo mismo a la vez: sale una y la otra
  lee «quedan 0 por enviar». **Sin pegar en producción** (espera el OK de Felipe).

## Compras ▸ «Sin comprobante», el cuarto tipo del comprobante de una orden (2026-10-12)

- **Qué:** al registrar el comprobante de una orden se elige entre boleta, nota de venta, factura o **sin comprobante**. Sin papel no se
  pide serie ni número: la base le pone un número interno (`SC-000001`, único para la empresa), sin IGV, al crédito o al contado; la
  pantalla habla de «la compra» en vez de «el papel», y en el celular el tipo se elige con un desplegable (cuatro no caben en el
  segmento a 375 px). Facturas de proveedor puede filtrar «Sin comprobante».
- **Por qué:** Felipe, mientras se construía la fase 3: «Debe existir 4 tipos de comprobantes, boleta, nota de venta, factura y sin
  comprobante» (decisión 50). En Gamarra muchas compras no traen ningún papel y no había cómo registrarlas.
- **Cómo:** migración `20261012235000` (candado `compras_tipo_check` y cinco reemplazos anclados sobre `registrar_comprobante_orden`,
  re-ejecutable); `pnpm pruebas:ordenes-compra-sin-comprobante` 7/7 en el banco (número que sigue, reintento que no gasta número, contado,
  total, Actividad, anular, fuera de Impuestos); 5 pruebas puras nuevas en `comprobante-orden-reglas.test.ts`; en el navegador la hoja
  cambia sus textos y su botón («Registrar sin comprobante»), y a 375 px el tipo es un desplegable. **Sin pegar en producción.**
