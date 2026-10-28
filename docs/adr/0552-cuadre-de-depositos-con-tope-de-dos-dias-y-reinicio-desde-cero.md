# ADR-0552 — Cuadre de depósitos de las máquinas: tope de 2 días, estimador por operación y reinicio de saldos desde cero

- **Fecha:** 2026-10-27 · **Estado:** **propuesto, sin construir.** Lo que se hizo hasta aquí fue medir (solo lectura) y decidir con Felipe;
  no hay migración ni código. Las actividades de abajo esperan su OK y el calendario del cierre de octubre.
- **Relacionados:** ADR-0429 (la máquina, las puentes «Por depositar» y la comisión real), ADR-0417 (Fase 1 de Finanzas), ADR-0195 F3
  (cuentas de dinero y `saldo_desde`), ADR-0544 y ADR-0548 (idempotencia del depósito), ADR-0332 (desde cuándo cuenta Finanzas).
- **Cifras y archivos:** los extractos bancarios, los reportes de las máquinas y las cifras exactas **no entran al repo** (es público, como en
  el ADR-0429). Aquí solo van reglas y porcentajes.

## El problema (medido el 2026-10-27, solo lectura)

Desde que el ADR-0429 puso cada cobro con tarjeta y QR en la puente de su máquina, la puente solo se vacía cuando alguien registra un
«Depósito de la máquina» marcando los días que cubre. En la práctica no se hizo: las dos puentes acumulan casi un mes de cobros que el banco
ya recibió, y el aviso «no depositó» miente. Cruzar eso hacia atrás con la función existente (`registrar_abono_pos`) no funciona, por tres
motivos que se midieron contra los extractos de Interbank y los reportes de las máquinas:

1. **El banco solo muestra el neto.** Sin el reporte de la máquina no se sabe cuánto fue comisión.
2. **El ERP registró mal medios y máquinas al principio de octubre.** El QR de Izipay de los primeros días se guardó como Yape/Plin
   (cuenta del BCP, no la puente), así que el BCP del ERP quedó inflado y el banco real tiene QR que la puente no conoce. Además, desde mediados de
   mes hay QR cobrado en el banco que el ERP no tiene con ningún medio (ventas sin registrar).
3. **El saldo inicial de Interbank se tomó a media jornada**, no a la apertura, así que cualquier abono del mismo día se contaba dos veces.

## Lo que se midió y vale como regla

- **Izipay QR** llega suelto, el mismo día y neto, **por pago**: `neto = monto − round(monto×tasa, 2) − round(round(monto×tasa, 2)×0,18, 2)`. Con la tasa
  del ADR-0429 coincide con el banco al céntimo en los días sin QR mal registrado. La ventana de QR gratis de los primeros días del mes sigue siendo de
  la tarifa vigente.
- **Vendemás** deposita **un lote por día hábil, y solo neto**. Un lote del día D cubre las ventas del POS desde el día del lote anterior hasta
  D−1 (el sábado y el domingo caen juntos el lunes; un feriado no tiene lote). Contra el reporte de transacciones del POS (cada venta con su hora, marca y
  monto) los lotes cruzan sin residuo: Visa y Mastercard pagan 2,30 % + IGV **por operación redondeada al céntimo**; American Express, alrededor
  de 4,45 % + IGV; algunas Visa «premium» suben un lote hasta 3,5 % sin que se sepa por qué.
- **El estimador por operación** (la regla de arriba) se equivoca en ~2 % de la comisión de dos meses y unos pocos soles por lote.
- **El ERP y el POS de Vendemás coinciden día a día desde mediados de octubre**; antes hay días desalineados. La puente de Vendemás es fiable hacia adelante.
- **Una comparación de totales diarios del ERP con el banco engaña** (se concluyó mal, y se corrigió, que Vendemás «no cruzaba»); lo que permite saber a
  qué lote pertenece cada venta es el reporte del POS, no el total del día del ERP.

## Decisión

DECIDÍ:
1. **Reinicio desde cero, sin migración.** Cada cuenta parte de su saldo real en una fecha de corte, con el lápiz de Configuración ▸ Cuentas
   (`editar_cuenta_dinero`, que ya existe: permite cambiar el saldo inicial y su fecha mientras no haya conciliación vigente y el mes esté abierto).
   Las puentes parten en 0 en la fecha de corte; el banco parte con su saldo real **antes** de los abonos del día que se van a registrar (la apertura
   de Interbank del corte es «saldo de la app menos los abonos del día»), para que ningún depósito se cuente dos veces. La historia anterior queda en las
   ventas; lo que se pierde es la comisión de los meses sin cruzar (ver «Queda fuera»).
2. **«Cuadrar depósitos» es un botón del líder al cierre**, con vista previa de lo que va a mover y la comisión que estima, y confirmación. Mueve lo vencido de
   cada puente al banco. No es automático.
3. **Vence a lo que tarda la máquina, con tope de 2 días corridos**: Izipay el mismo día; Vendemás el día hábil siguiente (sin domingos ni feriados).
   Lo vencido deja de ser «pendiente»; lo demás sigue en la puente.
4. **La comisión se estima por operación** con la regla de cada máquina, y se le aplica un **factor aprendido** de los depósitos reales ya confirmados,
   contraído hacia la tarifa cuando hay pocas operaciones: `(n·r_observada + k·r_tarifa) / (n + k)`, con `k = 30`. Sin depósitos confirmados vale la tarifa.
5. **Lo estimado se reemplaza por lo real en una sola transacción.** El depósito estimado queda marcado; cuando llega el depósito real (o el reporte de la
   máquina) se anula el estimado y se registra el real, y la diferencia queda a la vista.
6. **El control es la conciliación diaria del banco contra la app.** Dar por llegado lo que cumple 2 días solo es seguro si cada noche el saldo del ERP se
   compara con el de la app del banco (`registrar_conciliacion`, que ya existe).

DESCARTÉ:
- **Cruzar la historia con `registrar_abono_pos`:** exige bruto ≥ neto por día, y el ERP clasificó mal medios y máquinas; la comisión de Vendemás no sale del extracto.
- **Barrido automático nocturno:** da por llegado un depósito que nadie vio; el dinero real se confirma con una vista previa.
- **Poner en 0 con un ajuste sin comisión:** la utilidad del mes sale inflada por todo lo que cobraron las máquinas.
- **FIFO sin rastro** (ya descartado en el ADR-0429) y **una tasa por marca guardada en la tarifa:** la regla por operación vive en el estimador, no en el esquema.
- **Registrar hoy cada abono del día contra una apertura de fin de día:** cuenta doble; por eso la apertura es «antes de los abonos que se registran».

SE ROMPE SI:
1. **Vendemás retiene un lote** (contracargo) **y ya se dio por llegado:** el banco del ERP queda por encima de la app hasta que la conciliación diaria lo muestre.
2. **Alguien concilia una cuenta antes de reiniciar su saldo inicial:** una conciliación vigente bloquea editarlo (hay que anularla primero).
3. **Un feriado largo:** el tope de 2 días corridos vence un día antes de lo justo; avisar antes es mejor que después.
4. **Vendemás o Izipay cambian condiciones** y nadie carga la tarifa nueva: la estimación se desvía hasta que el factor aprendido la alcance.
5. **Se registran movimientos con fecha del día de corte para una cuenta cuyo saldo inicial ya los incluye:** se cuentan dos veces.

## Qué queda fuera (a propósito, y quién decide)

- **El gasto único de «comisiones de las máquinas» de los meses antes del corte:** con el reinicio no pasan por el gasto de comisiones. Si se registra (con la
  comisión real de los reportes), es decisión de Felipe y de su contador.
- **El BCP:** su saldo real y su extracto están pendientes; el reinicio corrige de paso el exceso del QR mal registrado como Yape sin ningún movimiento entre cuentas.
- **Costos propios del banco** (comisión diaria de Yape, mantenimiento, ITF) **y transferencias entre cuentas propias:** hoy no están en el ERP; las últimas se
  registran el mismo día como «entre cuentas» o la conciliación diaria no cuadra.
- **Por qué el QR se registra como Yape:** capacitación en tienda o un aviso en Vender (celular obligatorio y `/chaos`). Decisión de Felipe.

## Actividades propuestas (`/construir`; esperan el OK de Felipe)

1. Estimador puro (`lib/`): vencimiento, comisión por operación, factor aprendido; con su prueba contra los casos medidos.
2. Migración: tabla de depósitos estimados, vista previa y «Cuadrar depósitos» (todo o nada, por máquina, idempotente por token), que reemplaza lo estimado por lo real.
3. Pantalla en Cuentas y dinero (botón con vista previa, insignia «estimado»).
4. Guía interactiva, guía de foco, `/chaos` y la prueba de Postgres en su tanda.
5. Carga del reporte de la máquina para confirmar lo estimado.

**Calendario:** el congelamiento de código del cierre de octubre corre del miércoles 28 a las 18:00 al lunes 2-nov a las 12:00; se construye y prueba en
local y la migración se pega después, salvo que Felipe lo exima.

## Actualización 2026-10-28: cómo se hizo de verdad el reinicio, y lo que enseñó

El reinicio se hizo a mano, con las pantallas que ya existen, y salió. El método final difiere de la decisión 1 en un punto y conviene dejarlo escrito:

- **Bancos y puentes empiezan el mismo día** (el de hoy) con su saldo real. Las puentes abren con **lo que de verdad está pendiente** (la tarjeta que aún no llegó), no en 0: así los días de ayer siguen marcables y el depósito real de mañana tiene de dónde descontar.
- **Lo viejo se cierra con UN «Depósito de la máquina» por máquina, fechado el día anterior al corte.** Como su fecha es anterior al inicio de las dos cuentas, no mueve ningún saldo; solo cierra los días pendientes y anota la comisión estimada como gasto de octubre (el neto se calcula con la comisión esperada: Izipay por pago, Vendemás ~2,82 % efectivo de octubre). Sustituye a la apertura «saldo menos los abonos del día» de la decisión 1.
- **Verificación:** con los saldos y movimientos leídos en producción, el saldo esperado de cada cuenta coincide con su app y el gasto de comisión no está duplicado (los intentos anulados anulan su gasto).

Fricciones que salieron y entran como requisito de la actividad 3 (la pantalla):
1. **`fn_pos_pendientes` y el formulario ignoran `saldo_desde`:** tras un reinicio siguen listando todos los días viejos como «atrasados» y marcados. Deben ocultar lo anterior al inicio de la cuenta, o decir «cerrar lo anterior al corte» como una acción propia.
2. **La fecha vuelve a hoy al reabrir el formulario.** Un depósito con fecha igual o posterior al inicio de una cuenta sí cuenta en su saldo: con días viejos, el formulario debe avisarlo y pedir confirmación.
3. **El destino por defecto fue una cuenta equivocada** (BCP en vez de Interbank): la máquina debe proponer el banco donde deposita.
4. **El total cobrado cambia** si alguien registra o corrige una venta vieja durante la operación: el monto se toma del total que muestra la pantalla, y el formulario debe proponer «cobrado − comisión esperada» en vez de dejar que se teclee.
5. **Vendemás no tenía tarifa cargada:** su «comisión esperada» salía en 0. Hay que sembrar su tarifa (2,30 % + IGV, por operación) antes de la actividad 1.
