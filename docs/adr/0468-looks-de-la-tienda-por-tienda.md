# ADR-0468 — «Arma tu look»: cada tienda muestra solo los looks que puede vestir

- **Fecha:** 2026-10-20 · **Estado:** código y pruebas listos; **la migración `20261021010000` NO está pegada en producción** (pide el OK de Felipe). La web no cambia de orden: sin la migración todo sigue como hoy.
- **Relacionados:** ADR-0408 (la tienda online, «Arma tu look»), ADR-0458 (cada tienda maneja lo suyo), ADR-0455 (siempre una tienda elegida), ADR-0434 (el probador «Arma el tuyo»).

## El problema

Los looks que arma el equipo en Vitrina web ▸ Looks eran globales. `retail.tienda_looks(p_sede)` usaba la tienda elegida solo para el **precio**; qué look se veía lo decía el catálogo con «se ve en la web» (publicada, vendible, color con tallas), que no mira cuánto hay en cada tienda. Con Lima elegida salía un look cuya falda solo existe en Trujillo: el cliente lo abría, elegía talla y la bolsa recién le decía «se agotó en Lima». El catálogo ya esconde lo que no hay en la tienda elegida (`hayEnTienda`) y el probador también; los looks eran lo único global. Felipe (2026-10-20): «hay prendas que hay en una sede y en las otras no».

## Lo que se decidió

1. **Con una tienda elegida, un look sale solo si TODAS sus prendas, en su color, tienen alguna talla ofrecida y libre en esa tienda.** «Libre» es la regla única de «hay» de la ficha (`fn_tienda_disponible`: sin Cuarentena, sin lo apartado, sin el Taller) sobre las tallas que la ficha ofrece (`fn_tienda_precios`).
2. **Sin tienda elegida** (la web siempre elige una, ADR-0455; solo llega así cuando hay una única tienda en la web o la base no respondió) el look sale si está completo en al menos una tienda de la web. Con una sola tienda es exactamente esa; no existe «Todas» para el cliente.
3. **Por color, no por modelo.** La pieza de un look es un modelo en UN color; que haya negro en Lima no sirve si el look lleva beige.
4. **Sin tiendas en la web no se esconde nada** (no se sabe dónde hay; igual que `hayEnTienda` sin dato).
5. **«Look N de M» cuenta solo los de esa tienda**, y un look abierto en una tienda donde no está completo dice «Este look ya no está». Si en la tienda elegida no hay ninguno pero otras sí, la lista lo dice y lleva a las que sí tienen.
6. **El ERP no cambia:** Vitrina web ▸ Looks sigue diciendo si el look se ve en la web (criterio de «cualquier tienda»).

## Cómo

Un solo reemplazo de `retail.fn_tienda_looks_json` (la interna que arman `tienda_looks` y `tienda_look`), con candado de md5 (la definición viva tiene que ser la de `20261015032000`, verificada en producción el 2026-10-20). Firma, permisos y lo que devuelve no cambian. `ofrecido` (los precios) ahora se pide siempre para todas las prendas de los looks, no solo las del look abierto, porque qué look se ve y su número dependen de las demás. Web: solo el vacío de `apps/tienda/app/(catalogo)/looks/page.tsx`.

## Descartado

- **Filtrar en la web con el stock del modelo del catálogo:** no sabe del color y deja «Look 3 de 5» con huecos.
- **Un parche anclado:** el filtro tiene que ir antes de numerar los looks, lo que mueve CTE de lugar; más seguro el reemplazo entero con candado.
- **Guardar en el look en qué tiendas está completo** (para decirlo en la tarjeta): un dato derivado que se queda viejo (principio 4). Si hace falta, se calcula al pedirlo.

## Se rompe si

Alguien vuelve a decidir qué look se ve solo con `fn_vitrina_look_se_ve`. Lo vigila `pnpm pruebas:vitrina-looks` (sección «Por tienda», con un mutante que quita el filtro).

## Producción

Una parte, idempotente, sin políticas ni `alter` (ADR-0195). Orden con la web: da igual.
