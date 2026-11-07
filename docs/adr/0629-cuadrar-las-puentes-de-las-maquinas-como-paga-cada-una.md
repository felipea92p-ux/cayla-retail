# ADR-0629 — Cuadrar las puentes de las máquinas como paga cada una: el residuo primero, el QR uno por uno después

- **Fecha:** 2026-11-07 · **Estado:** aceptado por Felipe el 2026-11-07. **Fase A construida** en `20261107214000` (sin pegar en producción);
  la Fase B (pantalla) espera.
- **Relacionados:** ADR-0429 (la máquina, las puentes «Por depositar» y la comisión real), ADR-0552 (cuadre de depósitos con tope de 2 días y
  la comisión en su mes), ADR-0622 (rendimiento de las lecturas de Finanzas).
- **Cifras:** las del caso real viven fuera del repo (es público). Aquí solo van reglas.

## El problema (medido en producción el 2026-11-07, solo lectura)

Felipe: «constantemente tengo problemas para cuadrar esto». En Finanzas ▸ Cuentas y dinero ▸ «Cuadrar con el banco» no se puede cuadrar la puente
«Por depositar Izipay» ni Interbank. Hay cuatro causas, y ninguna es un descuido de quien cuadra:

1. **El ERP y el banco no cuentan en la misma unidad.** `fn_dinero_libro` junta los cobros en una línea por día, tienda y medio
   (`cobros:<fecha>:<tienda>:<medio>`), con el supuesto escrito de que «así llegan al banco». Es cierto para Vendemás, que manda un lote neto por
   día hábil. **No lo es para el QR de Izipay**, que Interbank recibe al instante, pago por pago (las líneas «.» de la app), con las tiendas
   mezcladas y en el mismo orden de hora que el ERP. Para comparar una línea del ERP hay que sumar de cabeza entre 10 y 18 líneas del banco.
2. **Plata atrapada en la puente.** `fn_pos_pendientes` daba un día por liquidado apenas CUALQUIER depósito vigente lo cubría
   (`not exists … a.clave = l.clave`), sin mirar el monto. Como el QR llega al instante, el depósito se registraba a media tarde y lo que la
   tienda cobraba después seguía sumando en la puente sin que ninguna pantalla lo volviera a ofrecer. Se cuadró a mano: un abono sin días y
   «ajustes de conciliación» que tapaban la diferencia.
3. **La pantalla trata la puente como si fuera un banco.** Pregunta «¿Qué saldo dice el banco?» (con un ejemplo fijo) y «¿Está en el extracto?»
   por cada línea. Una puente no tiene extracto: se llegó a anotar en la puente el saldo de Interbank.
4. **La ventana gratis del QR de Izipay no estaba en noviembre.** Las tarifas necesitaban dos filas por mes; sin la de noviembre la base estimó
   2,38 % + IGV sobre días que Izipay abonó completos.

## Decisión (Felipe 2026-11-07, cuatro preguntas)

DECIDÍ:
1. **Mixto, cada máquina como paga.** El QR de Izipay se ve y se empareja pago por pago; Vendemás y la tarjeta siguen por lote del día. La
   puente sale de «Cuadrar con el banco» (Fase B).
2. **Primero, y por separado, la plata atrapada (Fase A):**
   - lo pendiente de un día es **lo cobrado menos lo que cubrieron sus depósitos vigentes** (el residuo). Un día depositado que siguió
     vendiendo vuelve a «pendiente» con lo que falta; `fn_pos_pendientes` lo dice en `ya_depositado`. Un residuo negativo (venta anulada
     después del depósito) no es pendiente: va por la devolución;
   - `registrar_abono_pos` no cambia: ya guarda el bruto que le da `fn_pos_pendientes` (ahora el residuo), y `unique (movimiento_dinero_id,
     clave)` ya deja que dos depósitos cubran el mismo día;
   - el diario revierte la comisión estimada de un día **una sola vez, con su primer depósito vigente** (por la fecha del depósito y, a
     igual fecha, por orden de registro: reemplazar el primero por lo real con su misma fecha no muda la reversa de mes). El depósito del
     residuo trae su comisión real y nada que revertir;
   - «Cuadrar depósitos» le pone al residuo la parte proporcional de la comisión del día y dice cuánto de lo propuesto se cobró después de un
     depósito (`residuo`). El formulario de depósito marca esos días con «después del depósito».
3. **QR de Izipay gratis hasta el día 10 de cada mes.** `pos_tarifas.gratis_hasta_dia` (0 = ninguno): se guarda una vez y vale todos los meses.
   Fila nueva desde el 1-nov-2026: 2,38 % + IGV, gratis hasta el 10. La tarjeta no tiene ventana. Lo de antes sigue con sus filas. Cambiar
   la tarifa desde Configuración ▸ Dinero (`guardar_pos_tarifa`) hereda la ventana de la tarifa vigente; editarla desde la pantalla queda
   pendiente.
4. **Los depósitos de las máquinas llegan siempre a Interbank Empresas.** Los que se anotaron a otro banco están mal y se corrigen anulando y
   volviendo a registrar, nunca borrando.

DESCARTÉ:
- **Un movimiento de dinero por cada QR** (`pos_abonos_pagos`): ~550 filas más al mes, dos formas de liquidar para siempre, y una anulación de
  venta tendría que anular un movimiento. El «uno por uno» de la Fase B se guarda como depósito por día, con la lista de pagos solo para mirar.
- **Cuadrar solo por saldo:** dos errores que se compensan pasan como «cuadra», y falla cada vez que entra al banco algo sin anotar (hoy pasa).
- **Repartir la reversa de lo estimado entre los depósitos de un día en proporción a su bruto:** el reparto cambiaría con cada depósito nuevo y
  movería el diario de un mes ya cerrado.
- **Arreglar solo la pantalla:** la puente seguiría diciendo más de lo que falta.

SE ROMPE SI:
1. **Se deposita un residuo que ya se cuadró a mano** con un abono sin días: se cuenta dos veces. Por eso el candado de la migración ABORTA si
   queda un abono de máquina sin días con fecha igual o posterior al primer día que reaparece como residuo, y dice cuál; se anula antes, con el
   OK de Felipe. Uno anterior no puede cubrir lo cobrado después y no frena.
2. **Se anula el primer depósito de un día y el del residuo sigue vigente:** el residuo pasa a ser el «primero» y revierte toda la comisión
   estimada del día. Mientras lo anulado no se vuelva a depositar, ese día no lleva estimado (la 4691 queda en cero antes de tiempo); al
   depositarlo entra su comisión real. Los totales cuadran; solo el mes intermedio queda un poco bajo. Es raro y está probado.
3. **Izipay cambia la ventana gratis** y nadie agrega la fila: la estimación se desvía. Las tarifas solo agregan filas.

## Cómo lo resuelven los sistemas que ya hacen esto

- **Stripe y Shopify Payments:** cada cobro es una transacción de saldo, y cada depósito al banco (*payout*) lleva la lista de las
  transacciones que cubre. El cuadre se hace por depósito, y lo pendiente es lo cobrado que todavía no tiene depósito. Lo copiamos: el
  depósito guarda qué días cubre y por cuánto (`pos_abonos_lotes.bruto`), y lo pendiente es lo cobrado menos eso. No copiamos el detalle por
  cobro en la base: aquí la máquina no nos da el número de operación.
- **Odoo y QuickBooks:** importan el extracto, proponen el emparejamiento por monto y fecha, y aceptan el **cuadre parcial** (una línea del
  banco cubre una parte de un apunte y el resto queda abierto). La Fase A es justamente el cuadre parcial de un día. La Fase B toma la idea de
  «propón el emparejamiento y que la persona confirme», sin depender de que el banco exporte un archivo.
- **Lo que no se copia:** el «ajuste de conciliación» genérico que tapa la diferencia (QuickBooks lo permite). Esconde el error en vez de
  explicarlo. Aquí lo que mueve plata se corrige anulando y registrando de nuevo, nunca sobrescribiendo.

## Fase A — lo construido (`20261107214000_puente_por_residuo_y_qr_gratis.sql`)

- `pos_tarifas.gratis_hasta_dia` y la fila del QR de Izipay desde el 1-nov-2026; `fn_pos_comision_estimada` y `fn_pos_comision_lote` dan 0 en
  los días gratis.
- `fn_pos_pendientes` por residuo, con la columna `ya_depositado` (cambia lo que devuelve: se borra y se crea con sus permisos).
- `fn_cuadrar_depositos_vista` con la columna `residuo` y la comisión proporcional del residuo.
- `fn_asientos_dinero_y_caja`: reemplazo anclado en `rev_est` (una reversa por día).
- Candado de huellas: aborta si producción tiene otro cuerpo que el de main.
- Web: el chip «después del depósito» en el formulario del depósito de la máquina y la línea del residuo en «Cuadrar depósitos».
- Candado de abonos sin días (ver «SE ROMPE SI» 1) y `guardar_pos_tarifa` que hereda `gratis_hasta_dia` (reemplazo anclado).
- Pruebas: `pnpm pruebas:puente-residuo` (36 casos, con una mutación comprobada: sin el arreglo del diario, la reversa doble y la 4691 caen;
  la reversa cae en la fecha del primer depósito y no en la del residuo; el residuo se compara contra el movimiento de dinero real).
  `comision_estimada.mjs` vuelve a pegar la tarea 14 y ahora deshace antes lo de este ADR (`_deshacer_0629.mjs`). `pos_maquinas.mjs` medía el
  QR «hoy» y ahora usa una fecha fuera de la ventana gratis (la prueba dependía del calendario).

## Fase B — lo que sigue (espera, decisión 1)

En «Cuadrar con el banco», la puente deja de pedir saldo. El QR de Izipay se ve pago por pago en el orden de la app, se pegan los montos del
banco y se emparejan solos (por monto y hora, con lógica pura y su prueba). Lo que llegó se registra como depósito del residuo del día. Vendemás,
por lote neto del día.

## Al pegar en producción (cada paso con el OK de Felipe)

1. Anular con motivo los abonos de máquina sin días.
2. Pegar la migración (una ejecución, sin políticas).
3. Corregir los depósitos de máquina anotados a otro banco que Interbank Empresas.
4. Reemplazar la comisión del depósito de los primeros días de noviembre por lo real (gratis).
5. Decidir qué pasa con el QR que no llegó al banco (reclamo a Izipay, venta mal cobrada o pérdida).

## Revisión y contraste (2026-11-07, antes de pegar)

Una revisión independiente (tres lentes: dinero, pegado en producción, pruebas y web; cada hallazgo intentado refutar) y un contraste de solo
lectura contra producción. Se corrigió en el mismo PR: el candado de abonos sin días, el «primer depósito» por fecha, la herencia de la ventana
al cambiar la tarifa, dos pruebas que no probaban lo que decían y el texto del residuo. El contraste confirmó, con los datos de ese día: el
candado de huellas coincide con producción, el ancla del diario aparece una vez, Vendemás no cambia, en Izipay reaparecen tres residuos de QR
de dos días y la diferencia con el saldo de la puente son exactamente los dos abonos sin días. Quedan para Felipe:
- **El día 10:** la regla lo hace gratis (día ≤ 10); en octubre la tarifa ya cobraba desde el día 10. Confirmar con el extracto de Izipay antes
  del 10-nov.
- **El abono sin días de octubre** no es un depósito sino un ajuste de un cambio: no se cruza con ningún residuo, así que no frena el pegado,
  pero deja la puente corrida en ese monto hasta que se decida.
- **El QR que «no llegó»:** ese día hay una venta QR del mismo monto anulada minutos antes de la que quedó completada; puede que la plata
  nunca faltara. Mirarlo en el extracto antes de decidir.
