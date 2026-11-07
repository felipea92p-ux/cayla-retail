# ADR-0553 — El Taller tiene su cuenta de pago por defecto: la de sus transferencias

- **Fecha:** 2026-10-28 · **Estado:** **construido en la rama `claude/sales-account-reconciliation-6b2908`**; la migración
  `20261028065000_taller_cuenta_de_pago_por_defecto.sql` **en producción desde el 2026-10-28** (aplicada por Claude con el OK de Felipe, archivo tal cual por la línea de comandos de Supabase; verificada).
- **Nace de:** el cuadre de cuentas del 27-28 de octubre (ADR-0552). Felipe va a cargar en el Taller telas y avíos pagados por transferencia y no quiere
  elegir el banco a mano en cada pago.
- **Complementa:** ADR-0195 F3b (la cuenta sellada en cada cobro y pago), ADR-0429 (las máquinas y el destino por tienda), ADR-0370 (reemplazos anclados).

## El problema

«A qué cuenta entra cada cobro» (`medios_de_cobro`) solo la guardaban las **tiendas**: `guardar_medio_de_cobro` rechazaba cualquier sede que no fuera
`tipo = 'tienda'`. El Taller paga a sus proveedores por transferencia, pero sin una cuenta por defecto: el campo «Sale de» proponía «el primer banco que
sirve» (en producción, BCP Empresa) y el sello del pago de un comprobante del Taller le preguntaba a `fn_cuenta_sellada` por una sede **nula**, así que un
pago sin cuenta elegida quedaba «sin cuenta» y ningún banco bajaba. Cada pago exigía que alguien eligiera bien; un descuido bajaba el saldo equivocado.

## Decisión

DECIDÍ:
1. **El Taller guarda UNA cuenta por defecto, solo para sus transferencias.** No para Yape, Plin, tarjeta ni QR (el Taller no cobra: eso lo cobra una tienda).
   La regla vive en la función que guarda **y** en el disparador de la tabla, para que ningún otro camino deje una fila inválida. El código no fija ningún banco:
   la elige el líder en Configuración ▸ Cuentas y cobros (casilla «De qué cuenta paga Taller por transferencia»).
2. **La primera configuración del Taller rige desde HOY**, no desde 1900-01-01 como en las tiendas, para que los gastos y pagos viejos del Taller que hoy están
   «sin cuenta» no se muevan solos a ese banco (el cierre de octubre no cambia de cifra).
3. **No se parcha `fn_cuenta_sellada`** (sus huellas están fijadas en las pruebas del redondeo y ya lleva tres parches de ADR-0429). El cambio entra por quién la
   llama: `fn_produccion_pagos_sellar` pasa la sede del Taller en vez de nula.
4. **«Sale de» propone la cuenta del Taller solo para transferencia, depósito y «otro»** (lo que el sello asigna). El efectivo del Taller se propone como antes:
   pedir las cuentas con la sede del Taller no debe cambiar lo que nadie pidió (`useCuentasParaElegir(..., { propuestaSoloDe })`).
5. **La web reconoce al Taller por lo que la base le lista** (una sede que solo trae transferencia), sin conocer el tipo de ubicación. Si la migración no está
   pegada, la pantalla se ve exactamente como hoy.

DESCARTÉ:
- **Una cuenta «por cuadrar» con saldo** (propuesta de Felipe para el hueco de octubre): su saldo entraría en «¿Cuánto tienes?» y volvería a esconder errores. El hueco se
  explica con una lista «Por explicar» sin saldo (ADR-0552, actividad aparte).
- **Dejar que el Taller guarde todos los medios:** el Taller no cobra; se rechaza en la tabla.
- **Sede nula + una tabla aparte solo para el Taller:** dos tablas respondiendo la misma pregunta (Tevanian/Brooks: una sola forma de resolver «de qué cuenta sale»).
- **Parchar `fn_cuenta_sellada`:** rompe las huellas md5 del redondeo del efectivo.

SE ROMPE SI:
1. Se publica la **base antes que la web**: la fila del Taller saldría con cinco casillas y la base rechaza las cuatro que no son transferencia con un mensaje claro
   (ningún dinero queda mal sellado). Por eso el orden es primero la web y después el SQL.
2. **Alguien crea un segundo Taller activo:** el sello toma el más antiguo (`created_at`) y la web el más antiguo también; el otro seguiría sin propuesta.
3. **Alguien repega `20261015034000`** sobre esta base: su reemplazo anclado ya no encuentra ni su texto viejo ni el nuevo y aborta (falla en voz alta, no revierte nada).
   Las pruebas de insumos llevan un módulo, `scripts/pruebas/sello-taller-antes-de-cuenta.mjs`, que deshace este parche antes.
4. **Un gasto del Taller con fecha de hoy** que estaba «sin cuenta» baja el banco en el instante de configurar (el libro lo deriva de la configuración, no del sello).
   Lo anterior a hoy no se mueve.

## Otros usos de esa misma cuenta (el mismo patrón de las tiendas)

Los gastos y activos del Taller pagados por transferencia, los pagos de Compras destinados al Taller y un cierre de caja del Taller con destino «banco» sin cuenta
elegida usan `fn_cuenta_de_cobro(sede, 'transferencia')`, que no mira el tipo de sede. Con esta cuenta configurada salen de ella.

## Qué se construyó

| Pieza | Dónde |
|---|---|
| La puerta, la lista, el candado, el sello y el detalle de la cuenta (7 reemplazos anclados, idempotentes, verificados contra las funciones VIVAS de producción) | `supabase/migrations/20261028065000_taller_cuenta_de_pago_por_defecto.sql` |
| Pruebas de base: puerta, rechazo de Yape/Plin/tarjeta/QR, lista, vigencia desde hoy, sello, y que «Sale de» proponga la transferencia y no el efectivo | `scripts/pruebas/cuentas_dinero.mjs` (bloque 7b), `cuenta_sellada.mjs` (11b), `sello-taller-antes-de-cuenta.mjs` |
| El Taller en Configuración y en Cuentas y dinero solo con su casilla de transferencia; textos de «de dónde sale» (no «entra») | `ConfiguracionCuentas.tsx`, `CuentasDinero.tsx`, `cuentas-dinero-reglas.ts` |
| Los formularios de pago de Producción piden las cuentas con la sede del Taller | `ComprobanteProduccionForm.tsx`, `PagarComprobanteProduccionModal.tsx`, `RegistrarComprobanteOrdenInsumo.tsx`, `CampoCuenta.tsx` |

## Cómo se pega en producción

Primero se publica la web (este PR, sin SQL de por medio: funciona igual con la base de hoy). Después, **una sola ejecución** de la migración con el prefijo `retail.`
ya escrito. Antes de pegar: sonda de solo lectura que cuenta cada ancla en las funciones vivas (hecha el 2026-10-28: las 7 aparecen una vez) y comprobar que hay un solo Taller
activo. Después: en Configuración ▸ Cuentas y cobros, la casilla del Taller ▸ elegir **BCP Operativa**.

## Lo que queda fuera

- `PagosSinCuenta` (regularizar pagos pasados) no cambia: ese modal no usa la propuesta.
- Un reembolso de proveedor del Taller sigue sin propuesta (`fn_cuenta_sellada` con sede nula en esa ruta).
- La cuenta por defecto del efectivo del Taller (hoy se propone la primera que sirve, como antes).
