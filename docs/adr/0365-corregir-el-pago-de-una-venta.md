# ADR-0365 — Corregir el pago de una venta con la caja abierta

- **Fecha:** 2026-10-09
- **Estado:** aceptada (pedido y decisiones de Felipe, 2026-10-09). Migración `20261009120000_corregir_pagos_venta.sql`
  **EN PRODUCCIÓN desde el 2026-10-09** (aplicada por el MCP de Supabase a pedido de Felipe; `apply_migration` la registró con la
  versión `20261009173704`, la hora de aplicación, no la del archivo).

## Contexto

En la caja se marca «Efectivo» cuando el cliente pagó con Yape (o al revés). Al cerrar, el cajón no cuadra: el sistema
espera billetes que nunca entraron. `venta_pagos` solo se escribía al cobrar. La única salida era anular la venta (solo el
líder y solo el mismo día) y volver a cobrarla, lo que genera otro comprobante.

Lo que se verificó antes de decidir:
- **SUNAT no recibe el medio de pago.** `payloadDe` (`apps/web/lib/lucode.ts`) manda ítems, cliente y total, sin efectivo,
  tarjeta ni «forma de pago». Corregir el medio no toca un comprobante ya enviado.
- **Todo lo que suma pagos los lee en vivo:** el efectivo esperado (`fn_calcular_esperado_caja`), el tablero
  (`fn_resumen_caja`), los totales del historial, el libro del dinero y el diario contable (`fn_asientos`). Ninguno guarda
  una copia, salvo **el cierre de caja**, que congela `monto_cierre_sistema` y `diferencia` en `cajas`.
- Cada cobro se sella con la cuenta de su medio (`venta_pagos_sellar_cuenta`) y ese sello no se edita por diseño.

## Decisión (Felipe elige en las tres preguntas)

1. **Solo mientras la caja de esa venta siga abierta**, y lo hace quien ve Historial de ventas, desde el detalle de la
   venta. Es el momento en que se descubre el descuadre. Con la caja cerrada no se ofrece: el líder ajusta con un ingreso
   o egreso de caja, como ya se hacía. Así el arqueo guardado nunca contradice los pagos.
2. **El monto se reparte libre** entre los medios (efectivo, tarjeta, QR, Yape, Plin, transferencia). El último medio
   marcado se lleva lo que falta, así que la suma nunca queda distinta de lo cobrado.
3. **El ticket dice nombre y apellido** de quien atendió (antes, solo el primer nombre). Además, el pie del ticket térmico
   pasa de 6 a 18 mm de blanco: la cuchilla corta más arriba que el cabezal y partía el QR.

Cómo lo hace la base (`retail.corregir_pagos_venta(p_venta_id, p_pagos, p_motivo)`):
- Bloquea la venta y su caja `for update`. `cerrar_caja` también bloquea la caja, así que una corrección y un cierre se
  turnan.
- Exige que lo nuevo sume exactamente lo cobrado, contando los pagos sin el adelanto de un apartado (ese no se toca) y con
  el redondeo.
- Recalcula el redondeo del efectivo (ADR-0311) con `fn_redondeo_efectivo`.
- Reemplaza las filas y deja la foto completa de antes y de después en `venta_pagos_correcciones`, que solo se agrega, y
  en Actividad (módulo «historial», acción `pagos_corregidos`).
- Si lo pedido es lo que ya estaba, responde `pagos_sin_cambios`, y la web lo toma como hecho (cubre el doble clic).
- Firma el responsable del combo (`fn_actor_persona_id(true)`, ADR-0162).
- `fn_sello_caja` suma un conteo de correcciones, para que el tablero de Caja en vivo se entere.

Es una función DENTRO del módulo Historial (ADR-0306), no un módulo nuevo. Solo cambia su frase en Roles y accesos.

## Alternativas descartadas

- **`update` del medio en la misma fila.** El sello de la cuenta no cambia, así que un Yape quedaría guardado en el cajón.
  Además, un reparto nuevo cambia la cantidad de filas.
- **Marcar las filas viejas como «tachadas» en vez de reemplazarlas.** Seis funciones leen `venta_pagos` en vivo, y la que
  olvide filtrarlas contaría el efectivo dos veces. El dato de antes no se pierde: vive completo en
  `venta_pagos_correcciones.antes`. Es la única excepción a «nunca `DELETE`» en `venta_pagos`, y queda escrita aquí.
- **Permitirlo con la caja cerrada.** El cierre ya guardó «lo que el sistema esperaba». Para eso está el movimiento de caja.

## Consecuencias

- El ticket reimpreso muestra los pagos corregidos. El «recibido / vuelto» de antes se borra: ya no dice nada.
- Una corrección no se edita ni se borra (disparador `venta_pagos_correcciones_inmutable`). Si se corrigió mal, se vuelve
  a corregir mientras la caja siga abierta.
- **Se rompe si** alguien agrega como fila de `venta_pagos` un medio que no es dinero cobrado (un vale, puntos) sin
  excluirlo aquí como el adelanto.
