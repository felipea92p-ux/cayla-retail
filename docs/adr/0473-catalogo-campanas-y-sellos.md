# ADR-0473 — Catálogo ▸ Campañas, y las etiquetas de prenda se llaman «Sellos»

- **Fecha:** 2026-10-22 · **Estado:** aceptado (Felipe eligió las tres respuestas el 2026-10-22). Código en la rama
  `claude/etiquetas-atributos-98a04d`; la migración `20261022151000_campanas_del_catalogo_y_sellos.sql` está **en producción desde el
  2026-10-22** (versión `20261022204657`), seguida de `20261022203000` de #1260 (ADR-0476, versión `20261022204822`).
- **Relacionados:** ADR-0095 (taxonomía: etiquetas), ADR-0107/0108 (descuento de campaña), ADR-0161 (módulos y roles), ADR-0293
  (descuento por etiqueta con el módulo), ADR-0306 (un módulo es una entrada del menú), ADR-0379 (Liquidación), ADR-0471 (Tienda web ▸
  Campañas), ADR-0389 (guías).

## El problema

En Catálogo ▸ Atributos, la pestaña «Etiquetas» se confundía con las **etiquetas de precio** que se imprimen y se cuelgan en la prenda.
Además, metía en un vocabulario de la prenda (como color o tejido) las **campañas**: San Valentín, Halloween, Navidad, con fechas y,
a veces, descuento. Una campaña no dice qué es la prenda: dice a cuánto se vende y cuándo. En producción (2026-10-22) eran 26
etiquetas: 13 campañas y 13 marcas de prenda (Nuevo, Top ventas, Hecho a mano, Para liquidar…).

## Lo que se decidió (Felipe, entre opciones con Ganas/Pagas)

1. **«Etiqueta» es solo el papel con el precio.** Lo que se le marca a una prenda se llama **sello** (como ya le decía la tienda online:
   «el sello en cada prenda»). La pestaña de Atributos se llama «Sellos» y el módulo `etiquetas` se llama «Sellos» en Roles y accesos.
   Donde se ofrecen los dos juntos (Nuevo producto, la matriz de la ficha, el historial de la prenda) dice «Sellos y campañas».
2. **Las campañas viven en Catálogo ▸ Campañas** (`/productos/campanas`), una entrada propia del menú entre Atributos y Liquidación:
   las dos responden «a cuánto se vende». Se ordenan por fecha: rigen hoy, próximas, sin fechas, ya pasaron. Desde cada una se
   configura o se repite (la misma hoja de siempre), se imprimen sus etiquetas de precio y se va a su diseño en la tienda web.
3. **El descuento sigue permitido en cualquier sello** (Felipe eligió no restringirlo): «Para liquidar» (20 %) y «Sorteo» (100 %)
   siguen siendo sellos con descuento.

## Cómo se hizo

- **La base no cambia de forma.** Una campaña es la misma fila de `retail.etiquetas` con estilo `campana`; Vender, la tienda online,
  el Plan de campaña y el diseño web las siguen leyendo igual. Cada pantalla filtra sus filas con `esDelModo`
  (`apps/web/lib/sellos-campanas.ts`), y las dos usan la misma lista (`EtiquetasLista` con `modo`) y el mismo cargador
  (`lib/etiquetas-pantalla-datos.ts`).
- **El módulo es `campanas`, el que ya existe en producción** (PR #1190, `20261017151000`, nacido en Tienda web y cableado a las 13
  funciones que crean, configuran y etiquetan una campaña). La migración lo muda a Catálogo (orden 142) con su «incluye» al día; en una
  base sin #1190 nace sin rol. Terminal Almacén, que ya lo tenía, lo conserva.
- **Quién guarda una campaña** (Felipe, 2026-10-22, en la sesión que unifica los módulos de campañas: «que se pueda editar, agregar
  prendas y demás cosas a las campañas desde ambos módulos»): el líder, o quien vea Campañas, Campañas de la tienda web o Sellos
  (`fn_puede_campanas`, en la migración de esa sesión; esta no toca funciones). La ruta `/api/productos/etiquetas` deja pasar a esos
  tres módulos y la base decide fila por fila.
- **Tienda web ▸ Campañas ▸ una campaña** suma la pestaña «Datos y prendas» con la MISMA tarjeta y las mismas hojas de Catálogo
  (`TarjetaDeCampana` en `components/EtiquetasLista.tsx`): «mismas piezas dentro».
- Crear desde Campañas manda `estilo: "campana"` al `POST /api/productos/etiquetas`; la política de alta ya lo aceptaba.

## Descartado

- **Separar la base por estilo** (Sellos solo toca lo que no es campaña y Campañas solo lo que sí): obligaba a reescribir todas las
  funciones que crean, aprueban, configuran y ponen etiquetas, varias leídas por la caja. Nadie gana un permiso que no tenía: con
  `etiquetas` ya se podía todo eso. La pantalla es la que separa.
- **Renombrar la tabla o la clave del módulo** a `sellos`: rompe historia, políticas y Actividad sin ganar nada a la vista (como
  `clientas`).
- **Un módulo nuevo `campanas_catalogo`** (la primera versión de esta rama): en producción la llave de una campaña ya era `campanas`
  (`fn_puede_campanas`), así que quien lo recibiera vería la pantalla y la base le rechazaría cada guardado. Felipe eligió reusar
  `campanas`. `campanas_web` se queda en Tienda web para el diseño.
- **Poner las campañas en Ventas o unirlas a Tienda web ▸ Campañas:** Felipe eligió Catálogo. Ventas ya está cargado; bajo «Tienda web»
  parecería que una campaña es solo online, y también rige en las tiendas.

## Verificado

En local: la pantalla con sus tramos, el alta de una campaña (nace con estilo `campana` y no aparece en Sellos; base restaurada a la
foto), Sellos sin el grupo de campañas, menú y módulos (`modulos.test.ts`, `menu.test.ts` con la foto del menú puesta al día), las
guías de Atributos y de Campañas (`guias.test.ts`) y toda la suite de la web.

## Sin verificar

Producción. La pestaña «Datos y prendas» y el enlace al diseño web en Tienda web: la base local no tiene las migraciones de Tienda web ▸
Campañas (`campanas_web`, `fn_campana_diseno`). Un rol que solo ve `campanas` o `campanas_web` guardando una campaña: depende de
`fn_puede_campanas`, que llega con la migración de la otra sesión.
