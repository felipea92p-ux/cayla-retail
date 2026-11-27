# ADR-0710 — El líder se lleva efectivo de la caja fuerte sin depositarlo todavía

- **Fecha:** 2026-11-26 · **Estado:** PROPUESTA construida en la rama `claude/intelligent-elbakyan-89f80b`, a la espera de que Felipe la
  apruebe. Es un cambio de reglas de dinero: la migración `20261127010000_lider_se_lleva_de_la_caja_fuerte.sql` **no está pegada en
  producción**. Número y versión reservados con `pnpm reservar`.
- **Pidió:** Felipe, 2026-11-26, cuadrando bancos: la caja fuerte de una tienda decía en el ERP más plata de la que tenía adentro,
  porque él se había llevado una parte para depositarla después y no había dónde anotarlo sin escribir directo en las tablas (no se hizo).
- **Sigue a:** ADR-0195 (Cuentas y dinero: los tipos de cuenta `caja_fuerte` y `por_rendir`, y el candado de qué va en cada punta de un
  movimiento), ADR-0190 y ADR-0412 (el token del doble clic), ADR-0290 (el ejemplo sigue lo elegido), ADR-0389 (guía interactiva).

## El problema

El efectivo de una tienda pasa por cuatro lugares: el cajón, la caja fuerte, la mano del líder y el banco. El sistema conocía los cuatro,
pero no todos los caminos entre ellos. «Efectivo entregado al líder» (la cuenta `por_rendir`) solo recibía plata desde el cierre de caja
(el traslado con destino `lider`). Si el líder pasaba después por la tienda y sacaba plata de la caja fuerte, el único movimiento que lo
describe —un «entre cuentas» de la caja fuerte a lo que tiene el líder— lo rechazaba el candado `retail.fn_movimientos_dinero_validar`
con «Ese movimiento no va entre esas cuentas».

Es como una prenda que salió del almacén y todavía no llegó al piso: si el sistema no tiene «en camino», la prenda figura en el almacén y
el conteo no cuadra nunca. Aquí la plata figura en la caja fuerte, y quien la cuenta encuentra menos sin que nadie se haya equivocado.

Cómo se ve mal hecho: registrar un «depósito al banco» que todavía no ocurrió (el banco del sistema diría plata que el extracto no
tiene y la conciliación quedaría descuadrada), o un «retiro de utilidades» del dueño (baja la plata de CAYLA y esa plata sigue siendo de
CAYLA).

## La decisión

DECIDÍ: un `entre_cuentas` puede ir de una **caja fuerte** a la cuenta **`por_rendir`**. Lo permite un bloque nuevo en el candado
`retail.fn_movimientos_dinero_validar` (el disparador de `retail.movimientos_dinero`), que exige sesión de líder, sin comisión y sin
caja, y deja el movimiento en la sede de esa caja fuerte. Se registra con la función de siempre, `retail.registrar_movimiento_dinero`,
que no cambia: fecha, monto, nota, responsable y token. En la web es una opción más de «Qué pasó» en la hoja «Registrar movimiento»
(«El líder se lleva efectivo») y un botón «Se lo llevó el líder» en el detalle de cada caja fuerte con plata, junto a «Registrar el
depósito», que solo ve el líder.

DESCARTÉ: un tipo de movimiento nuevo (`retiro_lider`). Obliga a reescribir dos `check` de la tabla y a enseñarle el tipo al libro del
dinero, al Flujo, al Diario, a los textos y a cada `not in` de la base, para decir lo mismo que «entre cuentas» ya dice con su origen y
su destino. El costo concreto: unas ocho funciones parchadas por ancla en vez de una, y cada una es un lugar donde olvidarse.

DESCARTÉ: una función propia (`registrar_retiro_del_lider`). Repetiría el token, la firma, el piso de Finanzas y el mes abierto que
`registrar_movimiento_dinero` ya tiene; dos funciones que guardan lo mismo terminan con reglas distintas.

SE ROMPE SI: alguien reescribe entera `fn_movimientos_dinero_validar` sin el bloque «ADR-0710». El movimiento vuelve a rechazarse (lo ya
guardado no se pierde). Lo detecta `pnpm pruebas:lider-se-lleva`, que está en la lista `PRUEBAS` del CI.

## Los estados que no deben existir, y qué los impide

| Estado | Qué lo impide | Dónde |
|---|---|---|
| Caja fuerte bajo cero | `fn_exigir_efectivo_en_cuenta`, disparador diferido con candado por cuenta: dos salidas a la vez se ordenan y la segunda ve la primera. Ya existía; este movimiento pasa por él como todos | base |
| Un retiro «al líder» guardado por quien no es líder | el bloque nuevo del candado pregunta `fn_es_lider()` en la tabla misma; antes, `registrar_movimiento_dinero` ya rechaza a quien no es líder todo lo que no sea un depósito | base |
| El mismo retiro dos veces por doble clic | `token_cliente` único: el segundo intento espera al primero y devuelve su movimiento; el mismo token con otro monto se rechaza | base |

La web avisa antes («En «Caja fuerte · …» hay S/ …: no se puede llevar más»), pero no es la que lo impide.

## Lo que no cambia

- La plata total de CAYLA: baja una cuenta y sube la otra por el mismo monto. El libro del dinero lo lee como dos líneas que suman cero, y
  el Flujo real lo cuenta como «entre cuentas» (ni entrada ni salida).
- El depósito posterior: ya existía (`deposito` de `por_rendir` a un banco).
- La guía de foco de la hoja «Registrar movimiento»: sigue en la deuda de antes de la regla (`components/finanzas/CuentasDinero.tsx`,
  `PENDIENTE`). Esta rama le suma una opción, no un campo.

## Lo que queda abierto (decide Felipe)

1. **El camino de vuelta.** Si el líder devuelve a la caja fuerte lo que no depositó, hoy solo puede deshacer el movimiento completo
   («Deshacer») y volver a anotarlo por lo que sí se llevó. Un movimiento de `por_rendir` a `caja_fuerte` sigue cerrado.
2. **«Efectivo entregado al líder» puede quedar bajo cero** si se anula este movimiento después de haber depositado esa plata. Esa cuenta
   nunca tuvo el candado de la caja fuerte; la pantalla lo muestra en rojo como «Saldo negativo: revisar». Ponerle el candado es otra decisión.
3. **En las listas el movimiento se llama «Entre cuentas»**, con su origen y su destino debajo. Darle nombre propio es tocar el libro del dinero.

## Si falla una dependencia

No toca ninguna dependencia externa. Si la base no responde al guardar, la hoja queda abierta con lo escrito y el mismo token: reintentar
no duplica.

## Cómo se verificó

- `pnpm pruebas:lider-se-lleva`: 13 casos en verde contra un Postgres privado con las 1 285 migraciones de `main`; control sin la
  migración: 9 de 13 fallan (los del movimiento), como debe ser.
- Las pruebas vecinas que vuelven a pegar sus parches sobre el mismo candado siguen en verde: `fondos`, `rendicion-fondo`, `deuda-fondo`,
  `pago-planilla-y-sunat`, `movimientos-dinero-inicio-y-empresa`, `claure-pago`, `pos-maquinas`, `gastos-viaje`, `cuentas-dinero`.
- Lectura en producción (2026-11-26, sin escribir): la función viva tiene la misma huella md5 que la de `main` y el ancla aparece 1 vez.
- En el navegador, en local, a 1440 y a 375 px: el botón, la hoja, el rechazo por monto de más, el guardado y el doble clic (un solo
  movimiento). Sin desborde a 375 px; los botones del pie miden 44 px de alto.

Para volver a verlo: `supabase/migrations/20261127010000_lider_se_lleva_de_la_caja_fuerte.sql`, `scripts/pruebas/lider_se_lleva.mjs`,
`apps/web/lib/cuentas-dinero-reglas.ts` (`OPCIONES_QUE_PASO`, `tipoDeMovimiento`) y `apps/web/components/finanzas/dinero/PanoramaDinero.tsx`.
