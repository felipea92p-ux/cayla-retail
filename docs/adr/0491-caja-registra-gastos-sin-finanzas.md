# ADR-0491 — Caja registra el gasto de hoy sin el módulo Gastos

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe lo pidió el 2026-10-23: «que en caja se puedan registrar gastos sin tener que darle
  visibilidad al módulo de finanzas»). Código en la rama `claude/caja-gastos-sin-finanzas-105a5b`.
  **La migración `20261023212000_caja_registra_gastos_sin_finanzas.sql` NO está en producción** hasta que Felipe la apruebe y se pegue; la
  web se puede publicar antes (ver «Orden»).
- **Relacionados:** ADR-0306 (lo que hace un botón es del módulo donde vive su botón), ADR-0368 (el gasto rápido de Caja), ADR-0195 F2
  (Finanzas ▸ Gastos y su módulo), ADR-0161 (módulos y roles), ADR-0412 (reemplazos anclados en `registrar_gasto`).

## El problema

«Registrar gasto» vive en Caja (la hoja rápida del mosaico, ADR-0368), pero solo aparecía a quien tenía el módulo **Gastos** de Finanzas:
`registrar_gasto` pregunta `fn_gastos_puede`, que sale de `fn_gastos_ubicaciones`, y la página de Caja pedía `registrarGastos`. Para que una
colaboradora anotara la movilidad que pagó del cajón había que abrirle Finanzas ▸ Gastos entero: anular gastos, los gastos fijos del mes, los
activos y los egresos por clasificar.

Sin ese módulo la plata igual salía: quien opera la tienda registra un egreso «Otro» del cajón (`registrar_movimiento_caja` solo pide
`fn_puede_operar_ubicacion`). Pero salía sin decir qué fue, y quedaba «por clasificar» para que alguien de Finanzas lo adivinara después.
Esconder el botón no protegía la plata; solo hacía que se anotara peor.

## Lo que se decidió

1. **Registrar el gasto de HOY de la tienda desde su caja abierta es una función del módulo Caja** (ADR-0306). Lo hace quien maneja la caja
   (`fn_puede_gestionar_caja`: Caja completo, o líder) de la tienda que opera (`fn_puede_operar_ubicacion`), sin el módulo Gastos.
2. **Solo lo que hace la hoja rápida:** fecha de hoy, al contado, del cajón abierto o con el Yape o el Plin de la tienda, con o sin boleta o
   factura de un proveedor que ya existe. **Siguen siendo de Finanzas ▸ Gastos:** otra fecha, a crédito, un gasto fijo, clasificar un egreso ya
   hecho, sacarlo de otra cuenta (caja fuerte, banco) y anular. La base lo rechaza con `gasto_fuera_de_caja` (y con la caja cerrada,
   `caja_cerrada`), sin escribir nada.
3. **Una sola regla, en la base:** `retail.fn_puede_registrar_gasto(…)` (módulo Gastos, o Caja dentro de su alcance) reemplaza a
   `fn_gastos_puede` en `registrar_gasto` (reemplazo ANCLADO de una línea). Quien tiene Gastos registra exactamente lo mismo que antes.
4. **Lo que Caja lee, también sin Gastos:** `retail.fn_gastos_de_caja(ubicación, desde)` alimenta la tarjeta «Gastos del turno» y la ★ del
   mosaico. Con Gastos devuelve todo lo de la tienda (como `fn_gastos_lista`); desde Caja, solo lo que pasó por la caja o por el Yape o el Plin
   de la tienda, y nunca más de 90 días atrás: el alquiler pagado por transferencia no se le muestra a quien no ve Finanzas.
5. **La web:** el botón sale con `registrarGastos || gestionarCaja`. El formulario completo («¿Proveedor nuevo, o se paga a crédito?») y el
   enlace «Ver en Finanzas» de la tarjeta, solo con Gastos; sin él, la hoja dice «Eso se registra en Finanzas ▸ Gastos: pídeselo a tu líder».
6. **Roles y accesos lo dice:** el «incluye» del módulo Caja suma «registrar los gastos de hoy que se pagan del cajón o con el Yape o el Plin
   de la tienda». Ningún rol gana ni pierde un módulo.

## Por qué así y no de otra forma

- **No es un módulo nuevo** («Gastos de caja»): ADR-0306 lo prohíbe para un botón dentro de una pantalla, y daría el mismo problema al revés
  (dar Caja y olvidarse del otro).
- **No es «Caja ve Gastos»:** abrir la lista de gastos de la tienda a todo el que maneja la caja mostraría el alquiler, los gastos fijos y lo que
  se le paga a cada proveedor, que hoy solo ve Finanzas. Por eso la lectura nueva filtra a lo que pasó por la caja.
- **El alcance angosto (hoy, al contado) no es desconfianza:** es lo que ya podía sacar del cajón. Lo que pide pensar (crédito, fechas pasadas,
  otra cuenta) sigue con quien ve el panorama de Finanzas.

## Orden (web y base)

La web se puede publicar antes que la migración: mientras `fn_gastos_de_caja` no exista (PGRST202), Caja lee como antes con `fn_gastos_lista`.
En ese rato una cuenta con Caja y sin Gastos ve el botón, pero al guardar la base le responde lo de siempre («necesitas el módulo Gastos»):
no se escribe nada. Con la migración pegada, guarda.

## Cómo se verifica

- `pnpm pruebas:gastos`, casos 11 y 11b: la integrante de Trujillo (Caja sin Gastos) registra el de hoy por Yape, del cajón (con su egreso) y
  con boleta; se le rechaza otra fecha, a crédito, clasificar un egreso, transferencia, otra tienda y anular; con la caja cerrada lo dice; sin
  Caja no registra; lee los suyos y no el alquiler; la regla no se llama desde el navegador. El caso 7 sigue: con Gastos, igual que antes.
- En el navegador local (2026-10-23): la terminal de ventas de Lima (Caja sin Gastos, sin Finanzas en su menú) abre la hoja, registra
  «Movilidad · S/ 5» del cajón, el cajón baja de S/ 294.90 a S/ 289.90, la fila dice «Gasto · Movilidad» y al reabrir la hoja la ★ ya marca
  Movilidad. El líder sigue viendo «Usa el formulario completo».

## Antes de pegar en producción

El reemplazo en `registrar_gasto` es anclado: si la línea `if not retail.fn_gastos_puede(p_ubicacion_id) then` no aparece exactamente una
vez en la función viva, el pegado se detiene con un error que lo dice y no se aplica nada (todo va en una transacción). El ancla se verificó en
local; en producción no se pudo leer desde esta sesión. Para mirarla antes, de solo lectura:

```sql
select (length(d) - length(replace(d, '  if not retail.fn_gastos_puede(p_ubicacion_id) then', '')))
       / length('  if not retail.fn_gastos_puede(p_ubicacion_id) then') as veces  -- debe ser 1
  from (select pg_get_functiondef('retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)'::regprocedure) d) x;
```
