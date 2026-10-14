# ADR-0412 · Finanzas después de /chaos: la caja fuerte no queda bajo cero, los montos tienen tope y un gasto no es anterior al inicio

- **Fecha:** 2026-10-14 · **Estado:** construido y verificado en local (suite de base con controles, suites vecinas, vitest). **Las dos
  migraciones NO están en producción:** esperan el OK de Felipe. Rama `claude/chaos-finanzas-5c56e1`.
- **Pedido:** Felipe, 2026-10-14: «pega las migraciones y continúa con el siguiente módulo» después de Producción (ADR-0409), con la
  consigna de siempre: cubrir y arreglar lo que haga falta sin interrumpir el flujo. Compras sigue en reconstrucción (#1056, #1040, #1032,
  #1088); la fase 6 de Fondos por rendir (#1055) ya está en main.
- **Decisiones de Felipe** (2026-10-14, por pregunta): la caja fuerte no queda bajo cero (el banco sí puede); un gasto o un movimiento de
  dinero llega hasta S/ 1 000 000; un gasto anterior al inicio de Finanzas se rechaza.
- **Extiende:** ADR-0398 (efectivo de la caja no negativo, montos finitos), ADR-0405 y ADR-0409 (montos finitos), ADR-0332 (Finanzas
  cuenta desde una fecha). **Complementa:** ADR-0356 (`/chaos`).

## Lo que estaba abierto (corrida del 2026-10-13, semilla `20261013`, repetida el 2026-10-14 sobre main)

La fase 6 de Compras (20261014192000) ya había cerrado el `NaN` en los movimientos de dinero, los gastos y los pagos de compra. Quedaba:

1. **Gravedad 1, solo por la API:** `NaN` en el saldo inicial de una cuenta, en un gasto fijo, en el mínimo de caja y en un activo. Un
   saldo inicial en `NaN` vuelve `NaN` el saldo de esa cuenta para siempre, y con él el Balance y el Flujo de caja.
2. **Gravedad 1:** un retiro de S/ 99 999 de la caja fuerte de Lima, que no tenía esa plata, se guardaba (saldo negativo).
3. **Gravedad 2, solo por la API:** un gasto o un aporte de S/ 99 999 999; un gasto fechado en 1990 (fuera de todos los reportes); una
   descripción de gasto de 5000 letras.
4. **Gravedad 1, visto el 2026-10-14 (TOK-F1 a F3):** el mismo token con otro contenido devolvía lo del primer envío en
   `registrar_movimiento_dinero` (un aporte de S/ 100 reintentado como S/ 300 quedaba en 100 y la pantalla anunciaba 300),
   `registrar_activo` y `cargar_activo_inicial`. Registrar movimiento y Registrar gasto (cuando es un activo) mandan un token fijo.

## La decisión

- **Base, parte 1** (`20261015002000`, solo `alter table`):
  - `<tabla>_montos_finitos` en las once tablas de Finanzas con montos que no lo tenían (cuentas, gastos fijos, parámetros, parámetros
    tributarios, activos, presupuestos, conciliaciones, saldos iniciales, diario cerrado, cierres de período, dinero revisado).
  - `gastos_monto_con_tope` y `movimientos_dinero_monto_con_tope`: hasta S/ 1 000 000. En producción el gasto mayor es de S/ 850. El
    `NaN` lo deja pasar a propósito: Postgres mira los candados por orden de nombre y `_monto_con_tope` va antes que `_montos_finitos`;
    sin esa salvedad un `NaN` rebotaba con «pasa de S/ 1 000 000» en vez de «no es un número» (lo vio `pruebas:fondos-entradas`).
  - `<tabla>_textos_con_tope`: descripción de un gasto y de un gasto fijo (200), motivo de anular un gasto (300), nombre de un activo (120)
    y su serie (60). Lo más largo en producción mide 68, 45, 43 y 16. El nombre de una cuenta (80), su número (40) y la referencia de un
    movimiento (200) ya tenían tope desde 20260925110000: no se repiten.
- **Base, parte 2** (`20261015003000`, funciones y disparadores):
  - **La caja fuerte no queda bajo cero.** Su saldo no se guarda: se calcula del libro (`fn_dinero_libro`) y la plata sale por cinco
    caminos (movimiento de dinero, gasto, activo, pago de una factura de proveedor o del Taller, cada uno con su cuenta o asignado después
    en `cuentas_asignadas`). Por eso el candado no va en una función sino en **disparadores diferidos** en esas seis tablas y en
    `cuentas_dinero` (si baja su saldo inicial): al confirmar, `fn_exigir_efectivo_en_cuenta` toma un candado por cuenta (dos retiros a
    la vez se ordenan y el segundo ve el primero), recalcula con la MISMA fórmula de Cuentas y dinero y rechaza (`efectivo_insuficiente`).
    La cifra sale solo para quien ve esa cuenta en Cuentas y dinero.
  - Solo la caja fuerte: el cajón ya lo cuida la caja (ADR-0398) y el banco puede quedar en negativo mientras su saldo en el sistema esté
    incompleto (decisión de Felipe). Los cierres que mandan plata a la caja fuerte (`caja_traslados`) no llevan disparador: ninguna
    función los edita ni los borra, y lo que entra no deja un saldo negativo.
  - **El token sigue al contenido** en `registrar_movimiento_dinero`, `registrar_activo` y `cargar_activo_inicial`: la misma pieza de
    ADR-0398 (`fn_intento_con_huella` antes de buscar el token, con `md5(row(…)::text)` porque un `NaN` no pasa a jsonb).
  - **`registrar_gasto` rechaza una fecha anterior al inicio de Finanzas** (`gasto_antes_del_inicio`), con un mensaje que dice qué hacer.
    Solo ahí, el gasto que se anota a mano: un candado en la tabla frenaría también la factura de septiembre que Compras registra en
    octubre (su gasto lleva la fecha de la factura), y eso es otra pregunta (ver «Lo que queda»).
- **Web:** los mismos topes, en una sola definición (`lib/finanzas-topes.ts`) que una prueba compara con las migraciones: `maxLength` en
  Registrar gasto, Gasto fijo, Anular gasto, Nueva cuenta, Editar cuenta y Registrar movimiento; y el monto de un gasto o de un movimiento
  de más de S/ 1 000 000 se frena en la pantalla con la misma frase que la base (`montoDentroDelTope`). Un activo y el saldo inicial de un
  banco no llevan tope (un local o un auto pueden pasar del millón). La frase de `_monto_con_tope` vive en `error-escritura.ts`.

## Lo que queda

- **Una factura de proveedor anterior al inicio de Finanzas:** Compras la sigue aceptando (su gasto queda fuera de los reportes, como dice
  ADR-0332). Decidirlo cuando termine la reconstrucción de Compras.
- **«Revisar si se guardó» en Registrar movimiento y en el activo de Registrar gasto:** `fn_resolver_intento` no aprende esas operaciones.
  Con el arreglo de la base la pantalla ya no puede anunciar algo que no se guardó (tras un corte dice que no sabe, ADR-0410, y si se
  corrige y reintenta la base responde `token_reusado`), pero la persona tiene que cerrar y buscar en la lista.

## Cómo se pega en producción

Dos partes, cada una en su propia llamada y en este orden: primero `20261015002000` (solo `alter table`; `gastos` y `movimientos_dinero`
las escribe la caja, mejor fuera de horario), después `20261015003000` (funciones, disparadores con `create constraint trigger` si no
existen, sin `drop trigger` ni políticas; los reemplazos anclados de `registrar_gasto`, `registrar_movimiento_dinero`, `registrar_activo` y
`cargar_activo_inicial` se detienen sin tocar nada si su ancla cambió). Antes:
ninguna caja fuerte bajo cero en producción (verificado el 2026-10-14) y ninguna fila que viole los candados.
