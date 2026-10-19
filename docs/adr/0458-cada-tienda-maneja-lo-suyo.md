# ADR-0458 — En la tienda online, cada tienda maneja lo suyo

- **Fecha:** 2026-10-19 · **Estado:** código y pruebas listos; **la migración `20261019223000` está pegada en producción desde el 2026-10-19** (cambia una regla de `tienda_separar` y de `tienda_look`); falta fusionar el PR para publicar la web.
- **Relacionados:** ADR-0408 (la tienda online; su DECIDÍ «una tienda para todo, lo que falta se trae con un traslado» queda **reemplazado** por este), ADR-0455 (siempre una tienda elegida), ADR-0438 (separar siendo del Club).

## El problema

La ficha decía, de una talla que no había en la tienda elegida pero sí en otra: «No hay en Trujillo. Igual puedes separarla ahí: la tienda puede traerla de Arequipa». La bolsa repetía la promesa («No está en Lima: la tienda puede traerla de Trujillo») y la base la cumplía: `tienda_separar` aceptaba una prenda si quedaba en **cualquier** tienda de la web. Ninguna tienda había aprobado traer prendas de otra; el cliente recibía una promesa que nadie tenía asignada. Felipe (2026-10-19): «no es algo que esté aprobado, se quiere que cada tienda maneje lo suyo».

## Lo que se decidió

1. **Lo que se ofrece, se vende y se separa es lo que hay en la tienda elegida.** La tienda no trae de otra.
2. **Ficha** (`lib/ficha.ts`, `components/FichaPrenda.tsx`): una talla que no hay en la tienda elegida dice «Agotada» (aunque otra tenga); el botón pasa a «Avísame cuando llegue» (antes solo si no había en ninguna); una pista sin promesa, «Hay en Arequipa.», dice dónde sí (`pistaOtraTienda`, reemplaza a `avisoOtraTienda`); la tabla «Cuánto hay» muestra **solo la tienda elegida**; el color con que abre la ficha es uno con algo AHÍ.
3. **Bolsa** (`lib/bolsa.ts`): lo que ahí no hay se marca «Se agotó en Trujillo» o «En Trujillo no quedan tantas», y bloquea «Separar» como lo agotado de siempre; se acabó la marca `traslado` y el «lo demás lo trae de otra tienda» de «¿En qué tienda lo recoges?». Al agregar (una prenda, un look) se revisa lo que hay en la tienda de la bolsa o, si no tiene, en la que se miraba (`revisarParaAgregar(linea, sedeId)`). «Cómo separar» ya no dice que la tienda puede traerlo.
4. **Base** (`20261019223000`): `tienda_separar` cuenta «hay» solo en la tienda de recojo (`fn_tienda_libre(variante, array[p_ubicacion_id])`), con el mismo HINT `tienda_separar_agotada` (la web de antes lo entiende y el orden de publicación no importa); `tienda_look` dice «hay» de cada talla según la tienda elegida. `tienda_bolsa` no cambia (ya devuelve, por tienda, si alcanza y si hay).

## Descarté

- **Que cada sede decida si trae de otra.** Habría que modelar quién acepta, cuándo llega y qué pasa si no llega. Si un día se aprueba, es un diseño aparte con su pedido y su plazo.
- **Esconder la prenda que no hay en la tienda elegida de la ficha.** El catálogo y Lo nuevo ya la esconden (`hayEnTienda`); la ficha se abre también por un enlace compartido o un favorito, y ahí «Agotada» + «Avísame» es mejor que una página que no existe.
- **Solo cambiar la web.** Una bolsa guardada antes del cambio o una pestaña vieja habrían podido separar lo que la tienda no tiene; por eso también la base.

## Lo que se conserva

- **«Viene de Arequipa» en un pedido** (`PrendaDelPedido`): sigue existiendo porque el ERP puede reservar al confirmar desde otro lugar (la decisión `reservar` con otra ubicación); es historia de un pedido real, no una oferta de la tienda.
- **«Avísame» en «cualquier tienda»** (esperas sin tienda): no cambia.

## Pruebas

`lib/ficha.test.ts`, `lib/bolsa.test.ts`, `lib/ayuda.test.ts` (la regla nueva y que ninguna marca ofrezca traer); `pnpm pruebas:tienda-bolsa` (escenario «solo separa lo que hay en la tienda de recojo»; los de «lo trae la tienda de recojo» se reescribieron), `pnpm pruebas:tienda-separadas`, `pnpm pruebas:tienda-club`, `pnpm pruebas:vitrina-looks` (escenario «con una tienda elegida, el hay de cada talla del look es el de ESA tienda»), `pnpm pruebas:tienda-cuenta-simple` (la guarda de 20261017175000 acepta también el cuerpo de esta migración, para poder re-pegarla).
