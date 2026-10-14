# ADR-0401 · Inventario después de /chaos: el envío sigue a su contenido, el envío en curso se resuelve al volver y los textos tienen tope

- **Fecha:** 2026-10-14 · **Estado:** construido y verificado en local (pruebas de base, vitest, guía recorrida y re-ataque en un navegador).
  **Las dos migraciones están en producción** desde el 2026-10-14 (con el OK de Felipe, antes de fusionar la web). Rama
  `claude/chaos-inventario-5c56e1`, PR #1068.
- **Pedido:** Felipe, 2026-10-14, tras el `/chaos` de Inventario (semilla `20261014`): «Cubre todo y arregla todo lo que consideres
  necesario y que necesite arreglo, si no interrumpe el flujo ni nada».
- **Extiende:** ADR-0398 (el envío sigue a su contenido en Ventas: `intentos_con_token`, `fn_intento_con_huella`, `fn_resolver_intento`,
  `useIntento`). **Complementa:** ADR-0356 (`/chaos`), ADR-0173 (traslados y la «prenda de más»), ADR-0288 (reemplazos anclados).

## 1. El envío sigue a su contenido, también en Inventario (gravedad 1)

**El problema.** En Nuevo traslado se envían 2 prendas, la base lo guarda y la respuesta se pierde. La pantalla decía «No se pudo iniciar
el traslado» y dejaba el formulario abierto; la persona corregía a 3 y reintentaba con la MISMA marca. La base devolvía el traslado viejo
(2) y la pantalla anunciaba «3 prendas enviadas», con su WhatsApp. En la caja viajan 3, el sistema descuenta 2 y la otra sede recibe 3 de un
envío de 2: entra una «prenda de más» que no salió de ninguna sede. Es el mismo defecto que ADR-0398 cerró en Ventas.

**La decisión.** La pieza de ADR-0398, sin inventar otra:
- **Base** (`20261014162000`): ocho funciones llaman a `fn_intento_con_huella` antes de buscar su token, con la huella de todo lo que se
  manda menos el token: `iniciar_traslado`, `enviar_pedido_a_otra_sede`, `recibir_lote`, `pedir_a_otra_sede`, `pedir_prenda_para_apartar`,
  `apartar_prenda`, `bajar_al_piso_desde_vender` y `arreglar_prenda_danada`. La última es la peor de la lista: con la misma marca y la misma
  nota daba por arregladas DOS dañadas con un solo movimiento, y una unidad quedaba en cuarentena sin dañada que la explicara; ahora la
  dañada (`p_id`) es parte de la huella. `fn_resolver_intento` aprende a revisar un traslado (`iniciar_traslado`,
  `enviar_pedido_a_otra_sede`): responde `hecho` con el número y las prendas, o `no_llego`.
- **Web:** Nuevo traslado (`MoverMercaderiaFormV2`) y el pase de un pedido (`PasePedido`) pasan a `useIntento`. Una ráfaga de clics manda
  un solo envío. Si la respuesta no llega, el formulario se congela con «No sabemos si se guardó», y quedan dos salidas: «Volver a
  intentar» (lo mismo) o «Revisar si se guardó».
- **Lo que no se tocó:** ajustar, bajar, retirar, subir para enviar, reportar dañada, mover y cuadrar el piso ya comparaban su contenido.
  `anular_traslado` con la misma marca anula otro traslado, pero cada anulación es legítima y no deja un estado imposible.

## 2. El envío en curso se resuelve al volver, en Vender y en Nuevo traslado

**El problema.** Si alguien recarga o cierra la pestaña mientras se envía un traslado, al volver no sabe si salió. En Vender ya se
resolvía el «cobro en curso» (ADR-0398), pero el re-ataque encontró un hueco latente: al montar la página la sesión a veces todavía no está
lista, la pregunta a la base responde 401 y el aviso no salía nunca (solo se volvía a preguntar con el evento `online`, que no llega si la red
nunca se cortó).

**La decisión.** Un solo hook, `lib/useEnviosEnCurso.ts`, para los dos. Antes de enviar se anota el envío en el almacén de la sede; al
volver, se pregunta por los que salieron hace más de 20 s (uno más nuevo puede venir de otra pestaña). Si la pregunta falla, se reintenta a
los 5 s (`proximaRevision`, pura y probada). El aviso dice lo que pasó: «Tu traslado a Tienda Trujillo sí se envió · Traslado 316 ·
2 prendas» o «El traslado a Taller no se envió». Mientras se envía, salir de la página pide confirmación.

## 3. Textos, fechas y URLs (gravedad 2 y 3)

- **Base** (`20261014163000`): la nota de un traslado y la de un pedido a otra sede, hasta 200 caracteres (como una dañada o un retiro); la
  de un ajuste, hasta 300, porque Existencias le antepone «Error al cobrar: » o «Uso interno: » a una nota de 200. La llegada estimada de
  un traslado no puede ser anterior a ayer (día de Lima: un día de margen para el pase abierto antes de medianoche). El motivo de un ajuste es
  uno de los cuatro que ofrece la pantalla. La revisión de `iniciar_traslado` va DESPUÉS del atajo del token: el reintento de un traslado ya
  guardado devuelve lo guardado aunque su fecha haya pasado. En producción no hay ninguna nota de traslado ni de pedido escrita y ningún
  traslado tiene la llegada antes de su creación (2026-10-14): nada de lo guardado queda fuera.
- **Web:** Nuevo traslado corta la nota en 200 y no deja elegir una llegada pasada. Un filtro con una fecha imposible
  (`?desde=2026-02-31`) ya no tumba Movimientos (`esFecha` valida el día de verdad), y un pase con un id que no es uuid da el 404 de
  siempre en vez de «Esta pantalla no está mostrando datos».

## Lo que queda para Felipe

- **La «prenda de más» al recibir un traslado** (ADR-0173, INV-08): entra al destino sin salir del origen. Con el punto 1 ya no la alimenta
  un reintento, pero sigue siendo diseño. Es una regla de stock que cambia el flujo de la tienda: ¿lo de más sale del origen, o entra como
  sobrante a investigar?
- ~~Pegar las dos migraciones en producción~~: **hecho el 2026-10-14.** Solo funciones, una parte cada una, `20261014162000` antes que
  `20261014163000`. Antes, las 10 anclas aparecían las veces esperadas y `fn_resolver_intento` era idéntico al del repo; se revisó además
  que ninguna función de la base llama a `ajustar_inventario` y que sus tres pantallas mandan solo los cuatro motivos (producción tiene
  movimientos con motivo `conteo` y `hallazgo_conteo`, pero los escriben `cerrar_conteo` y `registrar_hallazgo_de_conteo` directo, sin
  pasar por el ajuste). Después, los cuerpos son idénticos al local (md5), salvo `ajustar_inventario`, que difiere solo en comentarios
  que producción ya no guardaba. El diccionario no cambia: ninguna firma, tabla ni candado es nuevo. **Se pegan ANTES de fusionar la web:** son compatibles con la web de
  hoy, y sin ellas «Revisar si se guardó» de Nuevo traslado solo respondería «Todavía no hay respuesta» (reenviar lo mismo sí funciona).

## Lo vigila

- `pnpm pruebas:inventario-token-y-textos` (41 casos, cada uno con su control: la misma prueba falla si se quita el bloque de la función).
- `lib/intento-reglas.test.ts`: la lista del resolver sale de la ÚLTIMA migración que lo define; toda operación con marca está parchada en
  alguna migración; `PasePedido` dejó la lista de deuda.
- `pruebas:bajada-desde-vender` ahora espera `token_reusado` con otro contenido (antes, `ya_registrada`).
