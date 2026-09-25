# ADR-0196 — Apartados es un módulo propio, separado del Punto de venta

**Fecha:** 2026-09-24
**Estado:** Aprobado por Felipe el 2026-09-24 («son diferentes módulos»).
**Afecta:** `retail.modulos` (fila nueva `apartados`, migración `20260924220000_apartados_modulo_propio.sql`),
`apps/web/lib/modulos.ts`, `apps/web/lib/menu.ts`, `apps/web/app/(app)/vender/apartados/layout.tsx`.
**Supera en parte:** ADR-0166, que colgó Apartados del módulo «Punto de venta» por ser «la misma caja».

## El problema

En Colaboradores ▸ Roles y accesos, encender «Punto de venta» abría dos pantallas: el mostrador (`/vender`) y
Apartados (`/vender/apartados`). La tarjeta del módulo no mencionaba los apartados. Además, el líder no podía darle a
alguien el mostrador sin darle también el manejo de adelantos, saldos, prórrogas, liberaciones y devoluciones de
adelanto, que es otro trabajo.

## Decisión

- Módulo nuevo `apartados` en el grupo Ventas, con `orden` 15 (entre Punto de venta y Caja, igual que en el menú) y
  `delegable = true`. En Roles y accesos dice: «Apartar prendas con adelanto, entregar cobrando el saldo, extender,
  liberar y devolver el adelanto».
- Nace **sin rol**, como todo módulo nuevo (ADR-0161): solo lo ve el líder hasta que él lo encienda en cada rol.
- Punto de venta queda solo con el mostrador.

## Consecuencia de negocio

Al publicar el cambio, quien hoy ve «Punto de venta» (Integrante, Terminal de ventas y los roles a medida) **deja de ver
Apartados** hasta que el líder le encienda el módulo. Los apartados abiertos no se tocan: siguen en la base, el líder los
ve y se entregan o liberan igual. La migración no asigna el módulo a ningún rol a propósito: la regla del ADR-0161 lo
prohíbe (`lib/modulos.test.ts` lo vigila).

## Candado: qué protege qué

Hoy la pantalla (`exigirModulo("apartados")`) es el único candado por módulo. Las funciones de la base
(`separar_prendas`, `entregar_separacion`, `extender_separacion`, `liberar_separacion`,
`registrar_devolucion_separacion`) piden que la cuenta opere esa tienda (`fn_puede_operar_ubicacion`), pero no
preguntan por el módulo. Así funciona también `registrar_venta` con «Punto de venta»: el cambio no abre ningún hueco
nuevo. Que las funciones de Ventas pregunten `fn_ve_modulo(...)` queda en el BACKLOG para los dos módulos juntos.

## Alternativa descartada

Dejar Apartados dentro de Punto de venta y solo aclarar el texto de la tarjeta. Descartada porque Felipe quiere dar
cada trabajo por separado.
