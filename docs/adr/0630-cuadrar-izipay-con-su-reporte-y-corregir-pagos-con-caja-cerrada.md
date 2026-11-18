# ADR-0630 — Cuadrar Izipay con su propio reporte, y corregir un cobro que no es efectivo con la caja cerrada

- **Fecha:** 2026-11-07 · **Estado:** aceptado por Felipe el 2026-11-07. Parte 1 construida y **pegada en producción el 2026-11-07** (`20261107223000`, con el OK de Felipe);
  la parte 2 (la pantalla que lee el reporte) espera su lista de actividades.
- **Relacionados:** ADR-0365 (corregir el pago de una venta), ADR-0429 (las máquinas y sus puentes), ADR-0629 (la puente por residuo;
  esta decisión cambia la fuente de su Fase B), ADR-0433 (mes cerrado).
- **Cifras:** las del caso real viven fuera del repo (es público). Aquí solo van reglas.

## Lo que se midió (2026-11-07, solo lectura, con los paneles de Izipay y Vendemás abiertos en Chrome)

Se cruzó cada abono de Izipay («Mis abonos», por código de comercio y día, y su «Descargar detalle», pago por pago) y cada venta de
Vendemás (su panel, con la terminal de cada una) contra `fn_dinero_libro` y `venta_pagos` desde el 28-oct.

1. **Vendemás calza.** Una terminal por tienda; lo pendiente en su puente es exactamente lo cobrado de los dos últimos días hábiles.
2. **Izipay calza pago por pago, pero tiene cuatro códigos de comercio, no tres:** una tienda cobra con dos. Mirando un solo código parecía
   que faltaba casi la mitad del QR de esa tienda; con los dos, cada día cuadra al céntimo.
3. **El reporte de Izipay trae lo que el banco no dice:** el código (= la tienda), la hora al segundo, si fue QR o tarjeta, la comisión y el
   IGV de cada pago, y la fecha de abono. Interbank solo muestra líneas «.» sin tienda ni comisión. Un pago de Izipay se abona solo (su
   «abono del lote» es su propio monto): por eso el banco las recibe sueltas.
4. **Los descuadres que quedan son de anotación, no de la máquina:** un cliente paga «con Yape» escaneando el QR de Izipay y se marca
   «Yape» (el ERP espera la plata en BCP y llega a Interbank); una tarjeta pasa por Izipay y se anota en Vendemás; un QR anotado que Izipay
   nunca recibió. Se descubren al cuadrar, días después, con la caja ya cerrada, y `corregir_pagos_venta` los rechazaba (`caja_cerrada`).
   Tampoco podía cambiar de máquina: las dos son «tarjeta», así que la corrección parecía «sin cambios».

## Cómo lo hacen los que saben

- **Stripe y Square** cuadran el depósito con el **reporte del procesador**, no con el banco: cada payout trae la lista de cobros, con su
  comisión, que lo forman. Se copia: la fuente es el reporte de Izipay. No se copia la integración por API: Izipay no la ofrece para esto,
  y leer su panel con la sesión de alguien sería frágil y guardaría credenciales.
- **QuickBooks y Odoo** usan una cuenta puente («Undeposited Funds», «Outstanding Receipts») que se vacía al emparejar cada depósito; un
  cobro mal clasificado se **corrige con un asiento nuevo** y la historia queda. Se copia la puente (ya existe, ADR-0429) y la corrección
  con foto que solo agrega (`venta_pagos_correcciones`, ADR-0365).

## Decisión

DECIDÍ:
1. **Izipay se cuadra subiendo su Excel** («Mis abonos ▸ Descargar detalle», uno por código). El ERP empareja cada pago por tienda, monto
   y hora, dice lo mal anotado y registra el depósito con la comisión real (parte 2). Reemplaza «pegar las líneas del banco» de la Fase B de
   ADR-0629: el reporte dice tienda y comisión, el banco no. La primera vez que aparece un código, el ERP pregunta de qué tienda es (los
   códigos no viven en el repo).
2. **Con la caja cerrada, un líder corrige lo que no es efectivo** (`20261107223000`). El efectivo y su redondeo tienen que quedar igual,
   céntimo por céntimo: el arqueo solo guarda efectivo (`cajas.monto_cierre_*`), así que eso es todo lo que el candado protegía. Cada pago
   puede traer `cuenta_dinero_id` (la máquina), y sin ella se sella la cuenta de su medio **el día de la venta**, no la de hoy. Toda
   corrección exige el mes abierto (el diario lee `venta_pagos` en vivo).
3. **Vender aclara el medio** para que el error no nazca: «QR Izipay (aunque paguen con la app de Yape)» y «Yape al celular de la tienda»
   (parte 3).

DESCARTÉ:
- **Asiento de reclasificación entre cuentas** sin tocar la venta: la venta diría «Yape» para siempre (los informes por medio, mal) y la
  puente recibiría una línea sin día ni tienda que ningún depósito sabe cubrir.
- **Escribir el abono del día** de «Mis abonos»: rápido, pero si no calza el ERP no sabe qué pago falló.
- **Abrir el candado entero** con la caja cerrada: el efectivo ya contado quedaría contradiciendo el arqueo.

SE ROMPE SI:
1. **Se corrige un cobro de un día cuyo depósito ya se registró:** la puente queda con un residuo. Con ADR-0629 (Fase A) un residuo
   positivo vuelve a «pendiente»; **uno negativo NO se ve**: `fn_pos_pendientes` lo descarta (lo trata como una venta anulada después del
   depósito), pero el saldo de la puente sí lo resta, y el saldo deja de ser igual a lo pendiente. **Pasó el 2026-11-07:** sacar de Izipay
   una tarjeta del 29-oct cuyo día ya cubría un depósito vigente dejó la puente por debajo de lo pendiente, en ese mismo monto, hasta rehacer ese
   depósito. Arreglo pendiente (decisión de Felipe, toca una RPC de dinero): que `corregir_pagos_venta` avise o rechace cuando lo que saca
   deja un día por debajo de lo ya depositado, o que la puente muestre el «depositado de más».
2. **Alguien agrega al arqueo un medio que no es efectivo:** esa cifra también tiene que quedar fija con la caja cerrada.
3. **Cambia la máquina que cobra un medio en una tienda** después de la venta: el disparador vuelve a validar la cuenta con la configuración
   de hoy y podría rechazar la de entonces. Raro; el mensaje dice cuál.
4. **Izipay cambia las columnas de su Excel:** la parte 2 lo lee en el borde y, si no reconoce una columna, lo dice y no registra nada.

## Parte 1 — lo construido

- `20261107223000_corregir_pagos_caja_cerrada_sin_efectivo.sql`: reemplaza `corregir_pagos_venta` con candado de huellas (las dos versiones
  conocidas; difieren solo en comentarios). Actividad dice «(con la caja ya cerrada)».
- `pnpm pruebas:corregir-pagos-caja-cerrada`: 13 casos (8 frenos que DEBEN bloquear) y un control con `-- --sin-migracion`, en el que los
  casos nuevos caen. La web no cambia: «Corregir pago» sigue ofreciéndose solo con la caja abierta.
