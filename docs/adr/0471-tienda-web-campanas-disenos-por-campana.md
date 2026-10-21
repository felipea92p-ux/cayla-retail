# ADR-0471 — Tienda web ▸ Campañas: el diseño de la tienda online durante cada campaña

- **Fecha:** 2026-10-21 · **Estado:** código y pruebas listos en la rama `claude/campaign-designs-animations-5eae76`; **las 4 migraciones (`20261021161000`, `20261021181000` en dos partes, `20261021194000` y `20261021195000`) están pegadas en producción desde el 2026-10-21** (OK de Felipe; en ese orden, con `apply_migration`, y verificadas: funciones, permisos, módulo, bucket y política). El PR #1190 hace algo parecido y ya está en parte en producción (tabla `retail.campana_disenos`, módulo `campanas`, ADR-0436): se resuelve aparte; por eso aquí todos los nombres son distintos (`campana_web_disenos`, `tienda_diseno_campana`, módulo `campanas_web`).
- **Relacionados:** ADR-0430 (grupo Tienda web), ADR-0161 (módulos y roles), ADR-0306 (un módulo es una entrada del menú), ADR-0408 (la tienda online), ADR-0169 (tokens), ADR-0136 (movimiento), ADR-0195 (políticas y deadlocks), ADR-0290 (sugerencias coherentes), ADR-0389 (guías interactivas), ADR-0356 (caos). Maqueta: `docs/maquetas/campanas-tienda-2026-10/`.

## El problema

Una campaña (`etiquetas` con estilo `campana`) solo se veía en la tienda online como una frase en la franja y una cuenta regresiva. Felipe pidió que cada campaña tenga su propio diseño y movimiento, configurable desde el ERP, sin deploy y sin que el líder pueda dejar la tienda con letras que no se leen.

## Lo que se decidió

1. **Módulo `campanas_web`** (Tienda web ▸ Campañas): delegable, nace solo para el líder (ADR-0161). La pantalla lista las campañas y abre el editor por campaña. Fechas, descuento y prendas siguen siendo de Etiquetas (una sola fuente de verdad); el diseño solo se cuelga de la campaña.
2. **Dos caminos de diseño:** un ambiente del catálogo cerrado (7 ambientes × 3 paletas, incluido «Día del Gato») o la imagen propia del líder (banner horizontal obligatorio y versión vertical opcional para el celular; sin ella se recorta la horizontal al centro; el texto va dentro de la imagen y la tienda pone encima «Ver la campaña» y «Lo nuevo»). Sin opción «como está hoy»: una campaña sin diseño ya se ve como siempre.
3. **Lo que se elige:** ambiente y paleta (o solo el color del botón con imagen), color propio, movimiento (franja rota/marquesina/quieta, entrada, efecto con intensidad, una vez o continuo, cuenta regresiva), textos cortos con ejemplos que siguen el ambiente, y dónde se ve (franja, portada, banda del catálogo, sello en cada prenda, línea de la bolsa).
4. **Guardado por parche** (`guardar_campana_diseno(etiqueta, versión, parche)`): módulo, responsable, versión que frena a la segunda persona, sin cambios no escribe ni anota, Actividad. Los valores salen de listas cerradas (CHECK).
5. **Borrador y programado.** Un borrador no se ve. «Programar» lo pone en la tienda mientras dure la campaña (las fechas son las de Etiquetas; el diseño no tiene reloj propio); «Pasar a borrador» lo saca. Editar un programado lo deja programado y se ve en menos de un minuto. Programar exige guardar antes, al menos una pieza encendida y una campaña que no terminó; es idempotente.
6. **El candado de lectura** (contraste WCAG de cada texto sobre su fondo, el botón y el sello sobre la foto) vive en `packages/shared` y lo usan el ERP (no deja programar lo que no se lee) y la tienda (nunca pinta un diseño que no se lee: cae a «como siempre»).
7. **Con dos campañas a la vez gana la que termina primero** (la misma regla de la portada).
8. **Imagen:** el navegador la reduce a WebP de 300 KB o menos y la sube al bucket público `retail-campanas`; solo quien tiene el módulo puede subir y nadie borra ni cambia desde el ERP. La base guarda la ruta; la tienda arma la dirección y solo deja pasar rutas con la forma que sube el ERP.
9. **Vista previa privada:** un enlace con una llave de 48 letras (la base guarda solo su huella sha-256), 7 días, a lo más 20 vivos por campaña; la tienda lo muestra en `/vista-previa/<llave>` con las prendas reales, sin índice y sin referer.
10. **La tienda siempre se degrada:** cualquier dato raro, sin base, sin origen del almacén o diseño que no sabe pintar es «como siempre» (principio 9).

## Descartado

- **Reusar `retail.campana_disenos` y `tienda_portada()` de #1190:** ya viven en producción con otra forma; sobrescribirlas sin leer su definición real es lo que prohíbe el repo. Se resuelve al unir los dos trabajos.
- **El contraste en SQL:** copiaría el catálogo de paletas a Postgres, dos fuentes que se desfasan.
- **Una fecha de programación propia del diseño:** dos relojes que se contradicen.
- **Pasar a borrador al editar un programado:** sacaría la campaña del aire sin que nadie lo pidiera.
- **Una llave de vista previa en claro o sin vencimiento.**

## Verificado

Pruebas de base `pnpm pruebas:campanas-web` (89 escenarios: permisos, lista, CHECK, guardar, tienda, almacén, programar, vista previa), reglas puras del ERP y de la tienda, guías, Knip. En el navegador (ERP y tienda contra la base local): editor en los dos modos, guardado, programar y pasar a borrador, vista previa abierta en la tienda, la portada con imagen en escritorio y celular. `/chaos` (2026-10-21, semilla 2110): 0 estados imposibles; sus 3 hallazgos menores (reintento tras perder la respuesta, ruta de imagen, tope de enlaces) se cerraron el mismo día con su prueba (`20261021195000`) y se repitieron con la misma semilla.

## Sin verificar

La subida real al almacén (el Storage local está apagado: se probó con una respuesta simulada), el celular real, las animaciones a 60 fps en un aparato de gama baja, y todo contra producción.
