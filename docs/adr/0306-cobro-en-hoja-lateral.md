# ADR-0306 — El cobro sale del ticket: hoja lateral sobre el catálogo

**Fecha:** 2026-10-02 · **Estado:** construido y probado en local (escritorio y 375 px); la migración del QR
(`20261002120000_venta_pagos_qr.sql`) **no está en producción** · **Decide:** Felipe (la hoja, su forma «tal cual» la maqueta,
el comprobante sin valor por defecto, el QR con su migración, quitar el Nº de operación de la caja, siempre «Confirmar» y no
el cobro de un toque); Claude (el reparto del «resto», la marca `fn_acepta_pago_qr`, dónde va el QR en Finanzas, el resto
de lo técnico) · **Rama:** `claude/redesign-post-payment-ticket-6d3690` · **Maqueta:**
`docs/maquetas/cobro-hoja-lateral-2026-10/` (la H de la ronda 3, pulida con Felipe en cinco vueltas).

## 1. El problema, primero

Al tocar «Cobrar», todo el cobro (cinco medios, montos, recibido, billetes, Nº de operación, comprobante, documento) se
apretaba dentro de la columna del ticket, de 420 px. Se leía chico, había que bajar con scroll y la grilla de prendas, la
parte más grande de la pantalla, quedaba sin uso mientras se cobraba. Felipe pidió que el cobro ocupe la grilla sin perder
de vista el ticket, que se entienda con pocos toques y que se lea de lejos.

## 2. Decisión

```
DECIDÍ:    al pasar a «cobrar», una hoja ancha entra sobre el catálogo (que queda atenuado detrás) y el ticket sigue a la
           derecha con sus prendas quietas. La hoja tiene dos pasos y un botón:
             1 PAGO — seis cuadrados grandes (efectivo, tarjeta, QR, Yape, Plin, transferencia; F1–F6), el ícono llenando
               el cuadro y el color de su medio. Tocar uno cobra todo con él; tocar un segundo ya es pago mixto (la lógica
               de siempre) y cada cuadrado muestra su monto. Con efectivo, «¿Con cuánto paga?» en billetes sugeridos
               (exacto + 4: S/59.90 → 60, 70, 100, 200) y el vuelto grande.
             2 COMPROBANTE — boleta, factura o nota de venta, NINGUNO marcado al empezar. Elegido, el documento de la
               clienta en una fila.
             «Confirmar cobro» — el mismo del ticket, en grande; apagado dice qué falta.
           En el celular la misma hoja va dentro de la hoja del ticket (`compacta`).
DESCARTÉ:  (a) las rondas 1 y 2 (seis maquetas: mesa de cobro, anillo, recibo vivo, cuenta, teclado, frase): densas o con
           scroll interno; (b) el cobro de un toque con «Deshacer» de la maqueta: registraría la venta (y su boleta a SUNAT)
           sin un Confirmar aparte; Felipe eligió confirmar siempre; (c) reimplementar la consulta de DNI/RUC dentro de la
           hoja: se usa `DocumentoDelComprobante` tal cual y solo se acomoda en una fila con CSS; (d) agregar el QR a
           `METODOS_PAGO`: Apartados, Cambios y Devoluciones lo ofrecerían y sus funciones lo rechazan.
SE ROMPE SI: la migración del QR no está en producción (la hoja muestra cinco medios: `fn_acepta_pago_qr` no existe y la
           web lo lee como «no»); la pantalla es muy baja (la hoja hace scroll por dentro como último recurso; medida sin
           scroll en 1440 × 900 con el menú lateral abierto, el caso más angosto de escritorio).
```

## 3. Lo que cambia en el negocio

1. **El comprobante se elige siempre.** Antes la caja arrancaba en Boleta («Opcional: ya está en Boleta»). Ahora ninguno viene
   marcado y sin elegir no se cobra (`motivoBloqueoCobro`: «Elige el comprobante.»). Una proforma con RUC sigue llegando con
   Factura marcada: es el dato de esa proforma, no un valor por defecto.
2. **«El resto» con tres o más medios.** Con dos medios ya existía: el otro toma lo que falta. Ahora, con tres o más, el primer
   medio que la cajera no escribió a mano se queda con el resto (`PagoAplicado.fijo`, `pagosTrasEditarMonto`). El segundo medio
   que se toca se lleva el cursor a su monto.
3. **El Nº de operación ya no se pide en la caja** («nunca se ingresan», Felipe). La columna `venta_pagos.referencia` y su
   búsqueda en Ventas ▸ Historial (ADR-0230) siguen para las ventas que ya lo tienen; las nuevas llegan sin él. Retirar también
   la búsqueda es otra decisión.
4. **QR, sexto medio de una venta.** Es el QR de **Izipay** y su abono llega **aparte** de las tarjetas (Felipe, 2026-10-02):
   por eso no va con la tarjeta. Solo en Vender. En Finanzas el cobro con QR se sella en la cuenta de cobro de
   **transferencia** de la sede (`fn_cuenta_sellada` ya manda ahí todo medio que no es Yape, Plin ni tarjeta) y aparece en el
   libro de cuentas como «Cobros con QR · sede». En Caja va en el grupo digital de la dona. Color: tinta (`--color-metodo-qr`),
   como un código impreso.

## 4. Cómo se ve y por qué así

Palabras en DM Sans mayúscula espaciada (`label-cayla`) y cifras en EB Garamond: la letra del botón del ticket (Felipe pidió que
la hoja y el ticket se sientan uno). Íconos de los medios: los de siempre (Yape y Plin dibujados en monocromo, banco para la
transferencia; `iconoMetodo`), más `QrCode`. La guía de foco (ADR-0284) va en la propia hoja: el paso que sigue se enciende con
tinte terracota y «Sigue aquí», «Elige uno» marca el comprobante pendiente, el número del paso pasa a ✓ y el botón dice qué
falta. Movimiento: la hoja entra desde la derecha con `--ease-cayla`, el velo aparece detrás; todo se apaga con
`prefers-reduced-motion`. Esc, «Volver» o tocar el velo vuelven al ticket.

## 5. Dónde vive

- `apps/web/components/punto-de-venta/HojaDeCobro.tsx` — la hoja (sin estado propio; el cobro sigue en `PuntoDeVenta`).
- `apps/web/components/PuntoDeVenta.tsx` — la monta sobre el catálogo (escritorio) o en la hoja del ticket (celular); el botón
  confirma el formulario del ticket desde afuera (`form="ticket-pos"`).
- `apps/web/components/PuntoDeVentaTicket.tsx` — en «cobrar» muestra las prendas quietas; ya no pinta medios ni comprobante.
- `apps/web/lib/vender-reglas.ts` — `montosSugeridos`, `pagosTrasEditarMonto` con «el resto», `metodoDeAtajo(t, medios)`,
  `motivoBloqueoCobro({ sinComprobante })`; pruebas en `vender-reglas.test.ts`.
- `packages/shared/src/enums.ts` — `METODOS_PAGO_VENTA` / `MetodoPagoVenta` (los cinco + QR), aparte de `METODOS_PAGO`.
- `apps/web/app/globals.css` — `--color-metodo-qr`, `.metodo-qr` y el bloque «Hoja de cobro».
- `supabase/migrations/20261002120000_venta_pagos_qr.sql` — el candado de `venta_pagos.metodo` acepta 'qr',
  `fn_acepta_pago_qr()`, y 'qr' en `fn_dinero_libro`, `fn_flujo_caja_proyeccion` y `fn_cuenta_sirve`. Dos partes para pegar
  por separado; validada contra la base local dentro de una transacción con `rollback`.

## 6. Verificación

En local (`/vender`, 1440 × 900, menú lateral abierto y cerrado): Yape por F3, efectivo por F1 con el cursor en su monto, 100
escritos → Yape pasa solo a S/54.80; S/200 recibido → vuelto S/100.00; Boleta; «Confirmar cobro» de la hoja registró la venta
B001-000002 con los dos medios y su vuelto. Sin scroll en la hoja y sin texto cortado (medido). A 375 px: la hoja dentro del
ticket, sin desborde horizontal. QR y Factura probados forzando la marca en local (sin aplicar la migración en la base compartida).
