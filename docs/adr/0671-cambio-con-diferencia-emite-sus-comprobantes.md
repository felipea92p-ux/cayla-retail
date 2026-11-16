# ADR-0671 — Un cambio con diferencia de precio emite su nota de crédito y su comprobante nuevo

- **Fecha:** 2026-11-16 · **Estado:** en construcción (rama `claude/cambio-prendas-diferencia-precio-e926d7`), sin pegar en producción.
- **Pedido (Felipe, 2026-11-16):** «se debería anular la boleta anterior y, si lleva una prenda más cara por ejemplo, generar una nueva con
  la prenda que llevará»; «si es del mismo precio o es la misma solo que en otro color o talla, no hay problema, siempre y cuando el sistema
  sepa eso y no descuadre el stock».
- **Sigue a:** ADR-0053 (la diferencia cuadra la caja), ADR-0100 (la devolución emite su nota), ADR-0380 (contra lo pagado), ADR-0382 (la
  nota declara solo lo devuelto), ADR-0470 (una prenda por varias), ADR-0655 (el mismo modelo conserva su descuento).
- **Números:** ADR reservado (`reserva/adr-0671`); migraciones `20261116212000` y `20261116213000` reservadas.

## El problema

Un cambio mueve stock y cobra o devuelve la diferencia, pero no emite ningún comprobante. La boleta original sigue diciendo la prenda y el
monto de antes, y lo cobrado de más entra sin documento: SUNAT nunca ve la prenda que se llevó el cliente. En producción, al 2026-11-16:
25 cambios desde el 2026-10-04, 13 con diferencia (11 cobraron S/ 209.70 y 2 devolvieron S/ 10.10), 24 sobre una boleta aceptada y 1 sobre
una nota de venta; cada venta de los últimos 60 días tiene su documento.

**Por qué no se «anula» la boleta.** Una baja le dice a SUNAT que la venta nunca existió (ADR-0016, ADR-0065), y para una boleta solo se
pide en pocos días. En un cambio la venta sí existió. Lo que corresponde es una **nota de crédito** sobre la boleta original y un
**comprobante nuevo** por lo que se lleva.

## Decisiones de Felipe (2026-11-16)

1. **Cuándo:** si la diferencia no es cero (más cara, más barata, o el mismo modelo en una talla más cara), se emiten documentos. Mismo
   precio, o el mismo modelo en otra talla o color sin diferencia: nada. El stock y la caja se mueven igual que hoy.
2. **Qué:** boleta → nota de crédito (serie B…) + boleta nueva; factura → nota de crédito (F…) + factura nueva al mismo RUC; nota de venta →
   nota de venta nueva, sin nota de crédito.
3. **Lo que sobra** cuando la nueva es más barata se devuelve en dinero, como hoy: la nota de crédito es el papel que lo respalda.
4. **Quién:** cualquiera que vea Cambios (R-38), sin aprobación del líder.
5. **Cuándo sale cada uno:** el comprobante nuevo sale **siempre al momento** (SUNAT pide emitirlo al entregar o al cobrar). Solo la nota de
   crédito espera, si hace falta, a que SUNAT acepte la original. Mientras espera, SUNAT ve un poco de IGV de más, nunca de menos.
6. **A nombre de quién:** la nota, siempre del cliente original (SUNAT). El comprobante nuevo se llena con el mismo cliente y se puede
   cambiar en la pantalla (un regalo); una factura va siempre al mismo RUC.
7. **Metas:** si la nueva es más cara, la diferencia la suma quien atiende el cambio; si es más barata, se le resta a quien hizo la venta
   original. La venta original no se toca.
8. **Desde cuándo:** desde que se publique; los 13 cambios pasados no se regularizan (su lista se entregó para el contador, fuera del repo).
9. **Prueba real:** la primera nota de crédito por una sola prenda (motivo 07) se prueba en la vista previa de Vercel contra el sandbox de
   Lucode antes de publicar.
10. **Volver a cambiar lo recibido en un cambio:** se podrá, dentro de los 15 días de la compra original. Hoy el sistema no lo permite en
    ningún caso; queda como obra aparte.

## Diseño

DECIDÍ: **los documentos cuelgan del cambio, no de una venta nueva.** `comprobantes.cambio_id` (nueva) apunta al cambio; el comprobante nuevo
nace con `venta_id` null. Así el camino del stock no se toca (ningún documento escribe en `movimientos`, `caja_movimientos`, `venta_pagos` ni
en las columnas de dinero de `cambios`), la regla «una venta, un comprobante vivo» (INV-06) y «el comprobante suma lo que la venta» (INV-07)
siguen ciertas, y la venta original queda con su asesora.

- **Una sola regla y una sola pasada.** `registrar_cambio` y `registrar_cambio_varias` llaman, justo antes de su único `return v_cambio_id`
  (después de mover el stock y con los candados ya tomados), a `fn_documentos_del_cambio`. Las vueltas tempranas por token devuelven el cambio
  existente y no emiten nada. Todo va en la misma transacción: o queda el cambio con sus documentos, o no queda nada.
- **Los montos no se vuelven a calcular.** Las líneas del comprobante nuevo salen de las MISMAS variables que dieron la diferencia (en uno por
  uno, el precio de cambio por unidad es `diferencia / cantidad + lo pagado por unidad`; en varias, cada prenda con sus unidades al precio del
  mismo modelo y el resto a su precio de cambio). Una rebaja que cae mientras el cambio espera un candado no cambia el comprobante. La función
  comprueba que `Σ líneas = total nuevo` y que `total nuevo − lo pagado = diferencia`.
- **El comprobante nuevo** se reserva con `emitir_comprobante` (la misma que usa una venta, con su validación de documento y su token: el id
  del cambio) y queda marcado con `cambio_id`. Su IGV, como en todo el ERP: `igv = round(total − total/1.18, 2)`; en nota de venta, 0.
- **La nota de crédito** congela sus datos en `retail.cambio_notas` (original, motivo, ítems de lo devuelto como ADR-0382, total por lo
  pagado, quién firma) y la emite `fn_emitir_nota_del_cambio`, que lee la original con `for update`: si está aceptada (y sin baja en
  trámite) la reserva en el acto; si no, queda «por emitir» y la emite el barrido (`fn_emitir_notas_de_cambios_pendientes`, primer paso de
  `/api/lucode/reintentar`, en el navegador y en el cron). Leer la original con candado evita el aviso perdido: si SUNAT la acepta mientras se
  guarda el cambio, una de las dos transacciones espera a la otra; y el barrido es periódico, así que nada queda dormido para siempre.
  Motivo `06` si el cambio cubre toda la venta (la misma regla de `aprobar_devolucion`), si no `07`. Una línea pagada en 0 no lleva nota.
- **Pieza propia para la nota, sin tocar `emitir_nota`.** `emitir_nota` exige una sesión de persona (`fn_puede_operar_ubicacion`,
  `fn_actor_persona_id(true)`), y el barrido corre también con la llave del cron. `fn_emitir_nota_del_cambio` repite su regla (serie por
  letra, techo de notas `total + anticipo_deducido`, IGV) y firma con la persona del cambio.
- **Una pareja por cambio, y nunca se reemplaza.** Índice único `(cambio_id, tipo = 'nota_credito')`: a lo sumo un comprobante nuevo y una
  nota por cambio, en cualquier estado. Una nota rechazada se corrige y se reenvía en la misma fila; nunca se emite otra.
- **Candados.** `anular_comprobante` y `marcar_comprobante_no_emitido` rechazan un documento que sale de un cambio (anular o liberar una
  mitad deja a SUNAT sin la prenda que salió) y la original de un cambio cuya nota todavía no se emite.
- **El cliente** llega como `p_cliente` (jsonb opcional) en las dos funciones de cambio, y entra a la huella del token solo cuando viene.
  Una boleta de más de S/ 700 exige documento (Reglamento de Comprobantes de Pago, art. 8): se valida antes de reservar, y la pantalla lo
  pregunta antes con `previsualizar_documentos_cambio`.
- **La sonda** (`fn_cambio_emite_comprobantes`, como `fn_acepta_qr_en_cambios`): la pantalla solo manda `p_cliente` y solo dice qué
  documentos salen si la base ya los emite. Si la web se publica antes que la migración, Cambios sigue funcionando como antes.
- **El corte** (`fn_cambios_con_documentos_desde`) es el primer cambio que tuvo documentos: lo leen las metas y el vigía para no reescribir los
  meses pasados.

DESCARTÉ:
- **Una venta nueva por lo que se lleva**, con la nota como medio de pago. Habría tocado el camino del stock (la venta descuenta stock y el
  cambio también), rompía INV-06 e INV-07, y las metas habrían restado la venta original completa a quien la hizo.
- **Que los dos documentos esperen a la original** (la primera respuesta de Felipe): el cliente se iría sin comprobante por lo que pagó.
- **Engancharse en `actualizar_transmision_comprobante`** (un disparador «pasó a aceptado»): si la emisión fallara ahí, la base no guardaría que
  SUNAT aceptó la original. El barrido es más simple y no arriesga nada que SUNAT ya aceptó.
- **Refactorizar `emitir_nota` en un núcleo compartido**: la usan tres llamadores (devoluciones, pedidos web, apartados); tocarla para este
  caso los arriesga sin ganar nada que una prueba de igualdad no cubra.
- **Diferir también la nota cuando la original está aceptada**: dejaría a SUNAT con el IGV de más durante minutos sin necesidad.

SE ROMPE SI:
- SUNAT rechaza la primera nota `07` real (nunca se ha transmitido una): queda la boleta nueva aceptada y la nota rechazada, y el IGV del mes
  sale de más. Por eso la prueba en el sandbox de Lucode va antes de publicar, y el vigía mira el par.
- La original se libera o se da de baja mientras su nota espera: la nota ya no se puede emitir. Los candados lo impiden desde la pantalla;
  si pasa por otro camino, el vigía lo muestra.
- Un tercer camino escribe en `cambios` sin pasar por las dos funciones (23 suites de prueba lo hacen a mano): ese cambio no tendrá
  documentos. La emisión vive solo dentro de las dos funciones a propósito.

## Producción

Dos partes, en orden, cada una idempotente y con `lock_timeout` de 3 s, sin políticas: la 1 agrega la columna, los índices y la tabla; la 2,
las funciones y los reemplazos anclados. Desde que se pega la parte 2 la base ya emite (también con la web de hoy, que no manda `p_cliente`);
los documentos los transmite el cron en minutos. Se pega con el OK de Felipe.
