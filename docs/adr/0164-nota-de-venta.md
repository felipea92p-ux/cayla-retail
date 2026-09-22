# ADR-0164 — Nota de venta: documento interno con serie propia, sin IGV y que nunca va a SUNAT

**Fecha:** 2026-09-22 · **Estado:** aceptado (Felipe: «1A 2A 3A 4A»). Migración `20260922224300_nota_de_venta.sql` aplicada en local; **producción espera el OK explícito** · Relacionado: ADR-0007 (la nota de venta no es comprobante de pago).

## Contexto

Felipe pidió que el Punto de venta ofrezca, junto a Boleta y Factura, una «nota de venta»: con su propia serie, sin enviarse a SUNAT y sin IGV. El ADR-0007 ya la había dejado fuera de los comprobantes de pago (no acredita venta ante SUNAT).

El riesgo de diseño: hoy lo que decide si algo se transmite a SUNAT es el **estado** del comprobante (`pendiente`/`rechazado`, `motivoParaNoTransmitir`), no su tipo. Una nota de venta guardada como un comprobante más en `pendiente` quedaría a un clic de «Transmitir» y contaría como «por enviar».

## Decisión

1. **Vive en `comprobantes`, con `tipo = 'nota_venta'` y un estado propio, `interna`.** Reutiliza la numeración con bloqueo, la reimpresión, «Ventas de hoy», el Historial y la anulación. Una tabla aparte habría duplicado todo eso.
2. **Candado en la base, `comprobantes_nota_venta_es_interna`:** una nota de venta solo está `interna` o `no_emitido` (anulada con su venta), y ningún otro tipo puede estar `interna`. Nunca puede quedar `pendiente`, así que nunca es transmisible ni cuenta en «Por enviar». Segundo candado en la ruta de Lucode (`motivoParaNoTransmitir` la frena por tipo).
3. **Mismo precio, sin desglose (1A).** `registrar_venta` la reserva con IGV 0 y subtotal = total; `emitir_comprobante` rechaza una nota de venta con IGV distinto de 0. El papel (térmico y A4) dice «NOTA DE VENTA», no lleva QR de SUNAT ni filas de IGV, y pie «Documento sin valor tributario. No es un comprobante de pago.».
4. **Una serie por tienda (2A):** NV01 Trujillo, NV02 Arequipa, NV03 Lima, cada una con su número. Evita el choque que hoy tienen B001/F001 entre sedes (`unique (tipo, serie, numero)` global).
5. **No se convierte en boleta (3A):** si la clienta la pide después, se anula la venta y se vende de nuevo con boleta.
6. **La emite cualquier colaboradora (4A).**
7. **Cambios quirúrgicos, no copias:** `registrar_venta`, `emitir_comprobante` y `anular_venta` se modifican tomando su definición viva y reemplazando solo el fragmento exacto (patrón de 20260922200000), abortando si no aparece. No se pisa nada que producción tenga y el repo no vea.

## Consecuencias

- **Facturación no la muestra** (`getComprobantesMes` excluye `nota_venta`): esa pantalla es lo que va a SUNAT. Sí aparece en Vender, «Ventas de hoy», Historial (cuenta como documento de la venta), Cambios y Devoluciones.
- **Devolución de una venta con nota de venta:** no hay nota de crédito (solo se emite sobre una boleta/factura aceptada); se devuelve sin comprobante tributario.
- **Lo tributario no lo decide el sistema.** Una venta con nota de venta es un ingreso de la empresa; si se declara y cómo, lo define el contador. El sistema la separa y la deja en los reportes.

## Se rompe si

- Se pega una versión anterior de `registrar_venta`/`emitir_comprobante`: la nota de venta nacería `pendiente`, el candado la rechaza y **la venta falla** (no se transmite nada).
- Una tienda nueva no tiene serie `nota_venta`: `fn_reservar_numero_serie` falla y esa venta no se puede cobrar con nota de venta hasta registrar la serie.

## Fuera de alcance

Convertir a boleta, registrar series NV desde la pantalla «Registrar serie» de Facturación, reportes separados por tipo de documento.
