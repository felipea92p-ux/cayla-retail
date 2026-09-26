# ADR-0236 — Apartados v2, pasos 2 a 5: abonos, estante, editar, actividad y opciones

**Fecha:** 2026-09-26
**Estado:** Aprobado por Felipe el 2026-09-26 («realiza los pasos 2 a 5 y sube todo lo pendiente completo»).
**Afecta:** migraciones `20260927100000_separacion_abonos.sql`, `20260927110000_separacion_estante.sql`,
`20260927120000_apartados_actividad_y_editar.sql` y `20260927130000_apartados_opciones.sql` (se pegan en ese orden);
web: `components/apartados/*`, `lib/separaciones*.ts`, `lib/actividad-reglas.ts`, `app/(app)/vender/apartados/page.tsx`.
**Sigue a:** ADR-0223 (celular) y ADR-0227 (recordar en lote). **Spike:** `docs/maquetas/apartados-v2-2026-09/`.

## Paso 2 · Abonos a cuenta

- **Un abono es un pago más del mismo apartado.** Entra en `separacion_pagos` (con `abono_id`), el efectivo entra al
  cajón y sube `separaciones.adelanto` (lo pagado antes de recoger). Por eso el saldo, el arqueo, la custodia, la
  devolución y el invariante «los pagos suman el adelanto» salen de lo mismo que ya existía.
- **Cada abono lleva su boleta o factura de anticipo**, con la clienta del anticipo original. Hoy ningún anticipo se
  transmite a SUNAT (`lib/transmision-reglas.ts:40`), así que no cambia nada de lo que ya se envía. Al entregar, la
  boleta final descuenta TODOS los anticipos: la lista queda en `comprobante_anticipos`, y `anticipo_comprobante_id`
  sigue apuntando al primero. Al devolver, sale una nota de crédito por cada anticipo.
- **Reglas de Felipe (2026-09-26):** sin monto mínimo. El plazo **no** cambia solo; al abonar se puede elegir esperarla
  2 días más, o 3 si el abono cubre la mitad o más de lo que le faltaba (`p_esperar`, `diasEsperaPorAbono`).
  Corrección de lectura: «El primero estaría bien» se refería a la PRIMERA opción de la pregunta («No, el plazo queda
  fijo»), no a «el primer abono corre la fecha».

## Paso 3 · Estante «Apartados»

Cada apartado abierto recibe el lugar libre más bajo de su tienda (A-01, A-02…) por un disparador BEFORE INSERT, con un
candado por tienda. El lugar se libera al cerrarse el apartado. **No es un movimiento de stock:** la prenda ya queda
reservada (ADR-0141) y Existencias ya la cuenta como apartada. Moverla a otra sububicación tocaría el núcleo
(`movimientos`/`stock`, principio 1) y la entrega (que vende desde la sububicación del apartado), sin ganar nada que el
número no dé. `buscar_separaciones` se recrea para devolver el estante, la fecha y el tipo de cada pago, y el id de
cada prenda.

## Paso 4 · Actividad y editar

- **Actividad (receta de ADR-0207):** disparadores sobre `separaciones` (apartó, al cerrar la transacción; entregó,
  liberó, devolvió y extendió), `separacion_abonos`, `separacion_avisos` y `separacion_ediciones`. Si describir falla,
  queda un WARNING y la operación sigue. La web suma `apartados` a `MODULOS_CON_ACTIVIDAD`: la «Actividad» de la
  cabecera ya lo muestra.
- **Editar (`editar_separacion`):** quitar y sumar en una sola transacción, todo o nada. Lo que sale libera su apartado;
  lo nuevo se aparta con el precio y la campaña de hoy. Lo quitado no se borra: pasa a `separacion_items_retirados`, y
  cada edición queda en `separacion_ediciones`. Si el nuevo total queda **por debajo** de lo ya pagado, se rechaza,
  porque qué hacer con esa diferencia sigue sin decidir (pregunta abierta del README). Cambiar la talla = quitar + sumar.

## Paso 5 · Opciones y «Qué ver»

- **Opciones por tienda** (`apartados_opciones.apagadas`): se guarda lo que se apaga, así que una tienda sin fila, o una
  función nueva, nace encendida (**Completo**, el de fábrica, decisión de Felipe). Solo el líder las cambia
  (`guardar_opciones_apartados`). Son opciones de **pantalla**: esconden botones; lo ya hecho sigue contando.
- **Clienta por DNI o celular** (una de las opciones): busca en la ficha (`buscar_clienta`), llena los datos y manda
  `p_clienta_id`, que `separar_prendas` ya aceptaba. Sin migración.
- **«Qué ver»** en Todos: qué datos lleva cada fila. Es comodidad de quien mira, así que vive en su navegador
  (`localStorage`, con lo de fábrica si no se puede guardar).

## Lo que NO entró (y cómo se resolvió)

**Apartar de otra sede** — resuelto el mismo día en **ADR-0233** («pedir el traslado y apartar al llegar», decisión de Felipe).
Lo que sigue es por qué no entró en este paso. Toca Traslados, otro módulo. Hoy `iniciar_traslado` no puede despachar una prenda apartada
en la sede de origen, y la entrega vende desde la sede del apartado. Hacerlo bien exige reescribir funciones de
Traslados, y es una decisión de varios módulos que se confirma con Felipe antes (CLAUDE.md, «Reglas de ejecución»).

## Cómo se verifica

`pnpm pruebas:separaciones`: **71/71** contra Postgres. Las 53 que ya había y 18 nuevas: abono con y sin espera
(2 y 3 días), abono en efectivo, token, sin módulo, tope del saldo, entregar con los dos anticipos, devolver con una nota
por anticipo, estante que se reutiliza, editar (sumar, quitar, precio y sin prendas), actividad y opciones. Las cuatro
migraciones se pueden pegar dos veces sin efecto. En la pantalla: Entregar → «Abonar» y «Editar prendas»; «Opciones»
(solo el líder); Todos → «Qué ver», estante y abonos en cada fila.
