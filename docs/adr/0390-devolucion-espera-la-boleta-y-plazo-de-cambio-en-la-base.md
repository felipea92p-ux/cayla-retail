# ADR-0390 — Una devolución espera a que SUNAT acepte la boleta, el reembolso es libre con aviso y el plazo de cambio vive en la base

- **Fecha:** 2026-10-12 · **Estado:** construido y verificado en local (copia desechable de la base, y la pantalla a 375 px con datos de
  prueba que se deshicieron con `estado.mjs`). **En producción desde el 2026-10-14**, con el OK de Felipe:
  las dos migraciones, ensayadas antes con un lote que terminaba en error a propósito, sobre la definición viva que ya traía
  los arreglos de #1054 (ADR-0398) y #1062 (ADR-0382).
- **Pedido:** tareas 6 y 7 de la revisión del 11-oct (lote C). Felipe eligió las dos reglas de negocio: «bloquear» (tarea 6) y «libre, con
  aviso» (tarea 7).

## Decisión 1 — la devolución espera a que SUNAT acepte la boleta (`20261012221000`)

**El problema.** `aprobar_devolucion` solo emite la nota de crédito sobre una boleta ACEPTADA. Con la boleta todavía en camino (sin
internet, en la cola de reintento, enviada sin respuesta) o rechazada, aprobaba sin nota; al volver la red la boleta llegaba a SUNAT por el
total, y CAYLA declaraba IGV de una venta ya devuelta, sin una nota que la corrigiera.

DECIDÍ: bloquear. Mientras la venta tenga una boleta o factura en `pendiente`, `pendiente_reintento`, `enviado` o `rechazado`,
`aprobar_devolucion` se niega antes de mover stock, caja o comprobantes (hint `devolucion_boleta_sin_aceptar`), y la pantalla lo dice desde
la tarjeta (chip «La boleta aún no llega a SUNAT») y en el panel, con «Aprobar devolución» apagado. Una nota de venta o una boleta liberada
(`no_emitido`) o anulada no van a SUNAT: no bloquean.
DESCARTÉ: diferir la nota (aprobar y emitirla sola cuando la boleta pase a aceptada) porque suma una cola más que alguien tiene que vigilar,
y una devolución «aprobada sin nota» es justo el estado que crea el problema; y liberar la boleta porque deja una venta real sin
comprobante.
SE ROMPE SI una boleta queda rechazada para siempre (una serie mal configurada): la devolución no se puede aprobar hasta resolverla en
Comprobantes. Es a propósito —no hay una forma honesta de devolver sobre una boleta que SUNAT nunca tuvo—, pero hoy «rechazado» solo
ofrece «Reintentar»; si pasa, hace falta decidir qué se hace con esa boleta.

## Decisión 2 — el medio del reembolso es libre, con aviso (solo pantalla)

DECIDÍ (Felipe): cualquier medio. La pantalla propone el medio con que más se pagó la venta (`medioSugeridoReembolso`) y, si se elige otro,
avisa «Esta venta se pagó con Tarjeta (S/ 79.90). Vas a devolver en Efectivo: confírmalo con el cliente.» Sin candado en la base.
DESCARTÉ: «efectivo solo si se pagó en efectivo» y «el mismo medio exacto», porque Felipe prefiere no trabar el mostrador (un POS que ya no
revierte la tarjeta dejaría la devolución sin forma de pagarse).
SE ROMPE SI se usa para sacar efectivo por una compra con tarjeta: el aviso lo hace visible, no lo impide. El registro queda en
`devoluciones.reembolso_metodo`, comparable contra `venta_pagos`.

**Pendiente:** Cambios todavía arranca la diferencia negativa en «Efectivo» y no avisa: no carga los pagos de la venta. Llevarle la misma
regla es tocar su cargador y verificarlo a 375 px.

## Decisión 3 — el plazo de cambio vive en la base (`20261012222000`)

DECIDÍ: `registrar_cambio` rechaza una compra fuera de plazo con la misma cuenta que la pantalla (días calendario de Lima desde la venta;
el día 15 todavía se cambia), sin excepción, igual que la pantalla. El número vive en `retail.fn_dias_plazo_cambio()` (15) y en
`DIAS_PLAZO_CAMBIO`; `lib/cambios-plazo-base.test.ts` exige que coincidan.
DESCARTÉ: una excepción para el líder porque la pantalla nunca la tuvo (Cambios no tiene aprobación); agregarla sería una regla nueva.
SE ROMPE SI alguien cambia el plazo en un solo lado: la prueba de la web lo atrapa.

## Verificación

- `pnpm pruebas:aprobar-devolucion-caja`: 12/12 con las migraciones; sin ellas fallan exactamente los tres candados nuevos (boleta
  pendiente, enviada, rechazada); la boleta liberada se aprueba en los dos.
- `pnpm pruebas:registrar-cambio`: 27/27 con las migraciones; sin ellas falla solo «una compra de hace 16 días ya no se cambia».
- Las otras 17 suites que llaman a `registrar_cambio`: mismo resultado con y sin migración, salvo `concurrencia_linea_de_venta`, que elegía
  la venta más reciente sin mirar el plazo; ahora elige una dentro del plazo.
- Devoluciones a 375 px (navegador integrado): la tarjeta con la boleta sin enviar muestra el chip y el bloqueo con «Aprobar devolución»
  apagado; la otra propone «Tarjeta» y, al elegir «Efectivo», avisa sin bloquear. Los datos de prueba se deshicieron con
  `scripts/flujo-de-negocio/estado.mjs` (la base local quedó idéntica a la foto).
