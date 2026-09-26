# ADR-0230 · Historial conectado: encontrar una venta y actuar sobre ella

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe, que eligió las opciones del spike: todo lo «encendido de
  fábrica», más «Volver a vender», «Exportar (líder)» y «Buscar por nº de operación Yape». Quedaron fuera «Enviar por
  WhatsApp» y «Nota interna».
- **Spike:** `docs/maquetas/historial-spike-2026-09/` (escritorio, celular A/B/C, comparación con otros sistemas y
  hallazgos).
- **Producción:** una migración, `supabase/migrations/20260926230000_venta_pagos_referencia.sql` (nº de operación).
  **No está aplicada:** espera el OK de Felipe. La web funciona igual antes y después de aplicarla.
- **Complementa:** ADR-0147 (Historial de ventas), ADR-0191 (totales en la base), ADR-0167 (cobrar una proforma, mismo
  camino que «Volver a vender»), ADR-0136 (modales), ADR-0149 (loader), ADR-0161 (módulos y roles), ADR-0196 (apartados).

## Problema

Historial era un libro que se **leía** pero no ayudaba a **resolver**. El caso más común en el mostrador —«la clienta
vino a cambiar una prenda, ¿dónde está su venta?»— no se podía resolver desde ahí:

1. **No había buscador.** Había que bajar día por día, y una venta de hace 35 días quedaba fuera de «30 días».
2. **El detalle solo imprimía.** Cambios y Devoluciones ya aceptaban `?q=` e `?item=`, pero nada llevaba hasta ellos.
3. **«Pendiente de enviar» no llevaba a ninguna parte**, y un comprobante rechazado hace 40 días no aparecía.
4. La venta que venía de un apartado no se distinguía («anticipo» salía sin color en «Cómo se pagó»).
5. Una venta que ya tuvo un cambio o una devolución se veía intacta.
6. No había «Hoy» ni «Mis ventas».
7. La cabecera decía «Todas las tiendas» con «Tienda TRU» elegida arriba.
8. El título repetía nombres («Test de Produto 2, Test de Produto 2»).
9. En el celular, la primera venta aparecía a media pantalla.

Shopify POS, Square, Lightspeed, Loyverse y Odoo resuelven lo mismo con un buscador único que ignora el período y
acciones desde el pedido (comparación en el spike).

## Decisión

Historial **sigue sin cambiar nada**. Encuentra la venta y **lleva** a la pantalla que hace cada proceso, con la venta ya
buscada; esa pantalla y su función en la base deciden si se puede.

- **D1 — Buscador único en todas las fechas.** `?q=` usa la MISMA búsqueda que Cambios y Devoluciones
  (`idsDeVentasBuscadas` en `lib/ventas-v2.ts`): comprobante, DNI o RUC, clienta, prenda, código de etiqueta y —nuevo— nº
  de operación. Buscando, la lista ignora el período y el líder busca en todas las tiendas salvo que haya elegido una. Las
  cifras de la cabecera siguen siendo del período; una línea dice cuántas ventas encontró y ofrece «Volver al período».
- **D2 — Atajos.** «Hoy» es un período. «Mis ventas» y «Por enviar» vienen de fábrica. «+ Atajo» (una hoja del
  sistema) suma: sin comprobante, con cambio o devolución, desde apartado, facturas, con clienta, anuladas y Yape. Un atajo
  es solo un conjunto de parámetros de la URL que ya entiende `filtrosDesdeParams`, así que nunca contradice al panel de
  filtros. **Los atajos elegidos se guardan en el navegador** (`localStorage`, sin base). Si la colaboradora cambia de
  teléfono, vuelve a elegirlos; los de fábrica no se pierden nunca. Se prefirió a una tabla por persona porque es una
  comodidad y no un dato del negocio.
- **D3 — Totales con filtros nuevos.** `fn_totales_historial_ventas` solo conoce tienda, vendedor, estado, pago y
  con/sin comprobante. Con «por enviar», «factura», «con clienta» o «posventa», las cifras se calculan fila por fila con los
  MISMOS filtros que la lista (`totalesConTope`, con su tope de 999 y su aviso). No se tocó la función de la base.
- **D4 — Avisos arriba**, de cualquier fecha: comprobantes que esperan a SUNAT (`getResumenPorEnviar`, la misma cola de
  «Por reintentar») y apartados que vencen en 2 días o ya vencieron (`resumen_separaciones`). No se cierran: si el problema
  sigue, el aviso sigue.
- **D5 — «Qué hacer con esta venta»** al pie del detalle, solo con lo que la cuenta ve (`accionesDeVenta`, pura):
  Enviar a SUNAT / Corregir y reenviar (primero y destacada si el comprobante espera), Cambiar prenda y Devolver (`?item=`
  con una prenda, `?q=<comprobante>` con varias, `&todas=1` si es de otra sede y quien mira es líder), Ficha de la clienta
  (`/clientas?q=`), Ver el apartado, Volver a vender, Ver comprobante (`?m=` del mes) y Anular (solo el líder, solo el
  mismo día, PL-29). Una venta anulada no ofrece cambiar, devolver ni anular.
- **D6 — Recorrido de la venta** (`recorridoDeVenta`, pura): apartada → vendida → SUNAT → cambios y devoluciones →
  anulada. La nota de venta interna no suma paso de SUNAT.
- **D7 — Marcas en la fila**, leídas de relaciones que ya existían (sin migración): «Tuvo cambio» (`cambios.venta_item_id`),
  «Devuelta» / «Devolución por aprobar» (`devoluciones.venta_id`) y «Desde apartado AP-…» (`separaciones.venta_id`, o un
  pago `anticipo`). El chip de un comprobante que espera a SUNAT lleva a «Por reintentar».
- **D8 — Volver a vender:** `/vender?repetir=<id>` arma el ticket con esas prendas **al precio de hoy** (con la campaña
  del día), recortado al piso de esta tienda. Lo que no entra se avisa con su razón (`lib/repetir-venta.ts`, mismo camino
  que cobrar una proforma, ADR-0167). La RLS decide si la cuenta ve esa venta.
- **D9 — Nº de operación:** campo opcional bajo Yape, Plin y transferencia en el cobro (`PuntoDeVentaTicket`). Viaja en
  `p_pagos[].referencia` y se guarda en `venta_pagos.referencia`, que agrega la migración (solo letras y dígitos, hasta
  40, y un candado que lo impide en efectivo, tarjeta o anticipo). La migración **no reescribe** `registrar_venta`:
  reemplaza solo su `insert into venta_pagos` sobre la definición viva, con la misma firma, sin sobrecarga, y se detiene
  si el texto no está tal cual. Probada en el Postgres local dentro de una transacción revertida (se aplica, se puede
  pegar dos veces y el candado rechaza una referencia en efectivo).
- **D10 — Exportar (solo el líder):** `GET /vender/historial/exportar` con los mismos filtros → CSV con BOM, coma y
  punto decimal, una fila por venta (hasta 5.000). Las celdas que Excel ejecutaría como fórmula se neutralizan. En el
  celular no se muestra.
- **D11 — La sede de la cabecera:** el líder ve por defecto la tienda elegida arriba. «Todas las tiendas» se elige en el
  filtro (`?sede=todas`).
- **D12 — Celular:** el buscador queda fijo bajo la cabecera, los períodos y atajos corren en una fila deslizable, no se
  dibuja el hilo de la izquierda y el detalle es la hoja de siempre desde abajo (variante A del spike: ya era el
  comportamiento del `<Modal>`). Las acciones van en dos columnas.
- **Arreglos menores:** el título agrupa la misma prenda con ×N y el mosaico lleva el ×N; «Anticipo» tiene nombre y
  color (`--color-metodo-anticipo`, taupe); al pie del pulso hay enlaces a Caja de hoy, Posventa y Comprobantes.

## Qué NO se hizo (y por qué)

- **Enviar por WhatsApp y Nota interna:** Felipe no los eligió. WhatsApp pide decidir el enlace público del comprobante
  y el número de la clienta.
- **«Anotar clienta» en una venta de «Cliente varios»:** necesita una función que escriba `ventas.cliente_id`, con su
  regla (¿el comprobante ya emitido cambia? no). Queda para cuando se decida.
- **Apartados con `?q=`:** Apartados todavía no recibe una búsqueda por la URL. La acción lleva a la pantalla y muestra
  el código.
- **La migración en producción:** es un cambio de esquema en producción que toca la función de cobro. Espera el OK de
  Felipe (regla de CLAUDE.md). Hasta entonces el campo se ve, pero el número no se guarda, y buscar por operación no
  encuentra nada, sin error.

## Cómo se verifica

- `pnpm vitest run lib/ventas-historial-reglas.test.ts lib/historial-acciones-reglas.test.ts
  lib/historial-exportar-reglas.test.ts lib/repetir-venta.test.ts lib/vender-reglas.test.ts`.
- En el navegador, contra la base local: buscar «emma» encuentra la venta en otra fecha. El detalle muestra el recorrido
  y las acciones. «Cambiar prenda» abre Cambios en el paso 2 con esa prenda. «Volver a vender» deja la prenda en el
  ticket a precio de hoy. El nº de operación se limpia («0123 4567» → «01234567»). «Por enviar» y «Con cambio o
  devolución» filtran, con cifras que cuadran con la lista. La exportación descarga el CSV. A 375 px: buscador fijo,
  hoja desde abajo y el campo de operación en el cobro.
- Después de pegar la migración: las tres consultas de verificación al pie del archivo.
