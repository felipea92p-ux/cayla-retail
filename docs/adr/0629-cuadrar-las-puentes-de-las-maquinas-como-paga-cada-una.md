# ADR-0629 — Cuadrar las puentes de las máquinas como paga cada una: el residuo primero, el QR uno por uno después

- **Fecha:** 2026-11-07 · **Estado:** aceptado por Felipe el 2026-11-07. **Fase A construida** en `20261107214000` (pegada el 7-nov);
  **Fase B construida** en la rama `claude/interbank-empresas-cuentas-93baab` (migración `20261108023000`, pegada en producción por Felipe el 2026-11-07: ver «Fase B — lo construido»).
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

## Fase B — lo construido (2026-11-07, rama `claude/interbank-empresas-cuentas-93baab`)

**La fuente es el extracto de Interbank Empresas, no el reporte de cada máquina (Felipe, 2026-11-07).** El ADR-0630 (decisión 1) había
cambiado la fuente a «el Excel de Izipay, uno por código». Felipe lo descartó el mismo día, con sus palabras: «ese adr es quivoco no puedo
estar cuadrando asi es tedioso y me entiendes que esos dos terminales van a la cuenta de interbank empresa?». Las dos máquinas depositan en
Interbank Empresas (`pos_maquinas.banco_id`, fijado el 7-nov), así que un solo archivo, el que ya baja, cuadra las dos. Se le avisó a la
sesión del ADR-0630, que no construye su parte 2. Lo que el banco no dice (la tienda y la comisión) lo pone el ERP: la tienda sale de la
venta emparejada y la comisión es lo cobrado menos lo que llegó.

1. **La puente sale de «Cuadrar con el banco»** (`tieneExtracto`, aplicado al leer `fn_conciliacion_cuentas`) y en su lugar está «Lo que te
   deben las máquinas»: por máquina y día, lo atrasado y lo que todavía no le toca, con el depósito de siempre.
2. **«Subir extracto»** en el banco al que deposita alguna máquina: lee el .txt de la banca (columnas fijas) o la tabla copiada de la web,
   en céntimos enteros, **en el orden real del banco (fecha de proceso y correlativo), no el del archivo** (un sábado procesado el lunes sale
   mezclado con el domingo), y revisa la cadena de saldos: un hueco en medio del período se avisa; uno en el borde es de un día vecino.
3. **Vendemás por lote:** cada «PAGO ESTABLECIMIENTOS» cubre lo cobrado desde el lote anterior hasta el día antes (el del lunes junta
   sábado y domingo); la comisión se mide con la regla del formulario del depósito (`revisarComision`) y se registra con
   `registrar_abono_pos`. Una línea con un depósito vigente del mismo día y monto sale «Ya registrado».
4. **Izipay pago por pago** (`20261108023000`): cada «Abono QR IBK» se junta con un QR por día y neto exacto (empate por hora; uno de
   medianoche puede llegar al día siguiente) y cada «PAGO IZIPAY <código>» con la tarjeta (y los QR pagados con tarjeta) de UNA tienda en
   su ventana (Izipay no abona el fin de semana: el lunes trae viernes a domingo), al céntimo. Se registra con `registrar_abono_pos_pagos`:
   un depósito por día del banco, con bruto parcial por día y la lista de pagos en `pos_abonos_pagos`. Lo que se cobró y no llegó, y lo que
   llegó sin venta (casi siempre un QR anotado como Yape), se dicen con nombre.

DECIDÍ:
- **Guardar qué pagos cubrió cada depósito** (`pos_abonos_pagos`, solo agrega). Sin eso, un día que llega a medias dice cuánto falta pero no
  cuál. No contradice el «DESCARTÉ» de arriba: el depósito sigue siendo uno por día y no hay un movimiento por pago.
- **Un día con un depósito sin detalle no entra al pago por pago** (`dia_sin_detalle`): son todos los de antes de la Fase B y los de
  «Cuadrar depósitos». Adivinar qué pagos cubrió depositaría dos veces el mismo QR; esos días siguen con «Cuadrar depósitos».
- **Un lote que no calza al céntimo no se propone.** Dice qué revisar; no se registra «a ojo».

SE ROMPE SI:
1. **Izipay cambia cómo escribe sus líneas** («Abono QR IBK», «PAGO IZIPAY») o Interbank cambia las columnas del .txt: las líneas caen en
   «Lo demás» y no se emparejan (nada se registra mal: solo deja de proponer).
2. **Dos QR del mismo monto, el mismo día, en dos tiendas, llegan en otro orden que el de la hora:** el depósito del día queda igual (va al
   mismo banco con el mismo neto), pero cada tienda se lleva el pago de la otra. Raro y sin efecto en la plata.
3. **Una venta se anula después de que su QR se depositó:** el pago sigue en `pos_abonos_pagos` del depósito vigente; el residuo de la Fase
   A (negativo) no se ve, como ya dice el ADR-0630 («SE ROMPE SI» 1).
4. **La máquina se reconoce por su nombre** (`/izipay/`, `/vendem/`): una tercera máquina con otro nombre no se empareja hasta agregarla.

Pruebas: `pnpm pruebas:pos-pagos` (25 casos; su control `--mutante` quita el freno del pago repetido y ese caso cae), `lib/extracto-interbank.test.ts`
(14, con el .txt real de octubre leído en local sin subirlo: 930 líneas, 0 sin leer, huecos solo en el borde), `lib/emparejar-maquinas.test.ts` (20).

## Al pegar en producción (cada paso con el OK de Felipe)

1. Anular con motivo los abonos de máquina sin días.
2. Pegar la migración (una ejecución, sin políticas).
3. Corregir los depósitos de máquina anotados a otro banco que Interbank Empresas.
4. Reemplazar la comisión del depósito de los primeros días de noviembre por lo real (gratis).
5. Decidir qué pasa con el QR que no llegó al banco (reclamo a Izipay, venta mal cobrada o pérdida).
6. (Fase B) **Hecho el 2026-11-07:** Felipe pegó `20261108023000` en una sola parte; existen `pos_abonos_pagos` (RLS sin políticas, con su
   disparador de solo agregar), `fn_pos_comision_pago`, `fn_pos_pagos_por_depositar` y `registrar_abono_pos_pagos`, y la lista responde en
   producción. Del 1 al 6-nov los días ya tenían depósito sin detalle (el cuadre del 7-nov): esos se siguen con «Cuadrar depósitos».

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
