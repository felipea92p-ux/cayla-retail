# ADR-0409 · Producción después de /chaos: el token sigue al contenido, los montos son números de verdad y el IGV tiene rango

- **Fecha:** 2026-10-14 · **Estado:** construido y verificado en local (suite de base con controles, 15 suites vecinas, vitest y la
  pantalla en un Chrome sin cabeza). **Las dos migraciones NO están en producción:** esperan el OK de Felipe. Rama
  `claude/chaos-produccion-5c56e1`.
- **Pedido:** Felipe, 2026-10-14: «continúa con el siguiente módulo» después de Catálogo (con la consigna de antes: cubrir y arreglar lo
  que haga falta sin interrumpir el flujo). Compras sigue esperando a que termine su reconstrucción (#1055, #1056, #1040, #1032).
- **Extiende:** ADR-0398 (el token sigue al contenido en Ventas; montos finitos), ADR-0401 (lo mismo en Inventario) y ADR-0405 (montos
  finitos en Catálogo). **Complementa:** ADR-0356 (`/chaos`).

## Lo que estaba abierto (corrida del 2026-10-13, semilla `20261013`, repetida el 2026-10-14)

1. **Gravedad 1:** el mismo token con **otro contenido** devolvía lo del primer envío en seis funciones: `abrir_produccion`,
   `abrir_produccion_con_modelo_nuevo`, `recibir_insumo`, `registrar_comprobante_produccion`, `registrar_pago_comprobante_produccion` y
   `recibir_comprobante_produccion`. Tras una respuesta perdida y una corrección (una orden de 6 reintentada como 8, un lote de 10 m
   reintentado como 15 m), la base guardaba lo primero y la pantalla anunciaba lo segundo. `crear_orden_insumo` ya resistía (su id lo
   pone la pantalla y la base compara el contenido).
2. **Gravedad 1, solo por la API:** un `NaN` entraba al costo de una orden, a un lote de insumo y a las líneas de una factura de insumos
   (en Postgres `NaN` es mayor que cualquier número y pasa todo `<= 0`). Un lote en `NaN` vuelve `NaN` el costo promedio del insumo; una
   orden en `NaN`, su costo unitario. El costo oficial de la prenda ya lo frenaba ADR-0405.
3. **Gravedad 2, solo por la API:** una factura de insumos aceptaba cualquier porcentaje de IGV (1000 % se guardó).
4. **Visto en el navegador el 2026-10-14:** tras perder la respuesta de un lote que **sí** se guardó, Ingresar insumo decía «No se guardó
   nada — revisa el internet y vuelve a intentar». Era falso.

## La decisión

- **Base, parte 1** (`20261014214000`, solo `alter table`): `<tabla>_montos_finitos` en las diez tablas de Producción con montos o
  cantidades (`producciones`, `comprobantes_produccion` y sus ítems, pagos y cierres, `cotizaciones_maquila`, `insumo_lotes`, `insumos`,
  `movimientos_insumo`, `orden_insumo_items`). Cada uno nace `not valid` y se valida si nada viejo lo viola: en producción, ninguna fila
  tiene un monto no finito (consultado el 2026-10-14). La frase en castellano ya existía para todo candado con ese nombre.
- **Base, parte 2** (`20261014215000`, solo funciones, reemplazos anclados verificados en local y en producción):
  - Las seis funciones llaman a `fn_intento_con_huella` antes de buscar su token, con la huella de todo lo que se manda menos el token.
    En `abrir_produccion_con_modelo_nuevo` tampoco entra `p_confirmo_distinto`: confirmar que el modelo es distinto no cambia la orden.
  - La huella es `md5(row(…)::text)` y no `jsonb_build_array` (como en Inventario), porque un `numeric` en `NaN` no se puede pasar a jsonb:
    la llamada se caería con un error crudo antes de que el candado de la tabla diera su frase.
  - El IGV de una factura de insumos va de 0 % a 18 % (`igv_fuera_de_rango`). La pantalla no manda el porcentaje (usa el 18 de la base):
    solo frena a la API.
- **Web:** Ingresar insumo, Nueva factura de insumos, Pagar y Recibir una factura del Taller dicen la verdad tras un corte de red («no
  podemos confirmar si llegó a guardarse; revisa antes de volver a intentar»), con la opción `confirmarAntesDeRepetir` que Nueva orden ya
  usaba. Lo vigila `lib/produccion-corte-de-red.test.ts`.

## Lo que no se hizo, y por qué

- **«Revisar si se guardó» en las pantallas del Taller:** `fn_resolver_intento` no aprende las operaciones de Producción. Con el arreglo de
  la base la pantalla ya no puede anunciar algo que no se guardó: tras el corte avisa que no sabe, y si se corrige y reintenta, la base
  responde `token_reusado` y nada se escribe dos veces. Queda en el backlog, junto con su costo (una función más en el resolver por
  operación y el hook `useIntento` en cinco formularios).
- **La frase de corte de red para todo el ERP:** el «No se guardó nada» de `traducirError` sale en cualquier pantalla que no pida la opción.
  Cambiarlo toca todos los módulos: va como tarea aparte, para que Felipe lo decida.

## Lo que queda para Felipe

- **¿Una orden puede prometer entrega en 1990?** `abrir_produccion` acepta una fecha de entrega pasada (PRO-06).
- **¿Se puede cerrar una orden con más prendas buenas que las pedidas?** Hoy se acepta (9 de 6, PRO-08). Puede ser legítimo (el corte rindió
  más), así que es una regla de negocio, no un candado obvio.

## Cómo se pega en producción

Dos partes, cada una en su propia llamada y en este orden: primero `20261014214000` (solo `alter table`; las tablas son del Taller y no
frenan a Vender), después `20261014215000` (solo funciones). Ninguna lleva políticas. Las dos son idempotentes. La parte 2 se detiene sin
tocar nada si un ancla no aparece las veces esperadas.
