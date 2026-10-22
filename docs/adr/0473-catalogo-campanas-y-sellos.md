# ADR-0473 — Catálogo ▸ Campañas, y las etiquetas de prenda se llaman «Sellos»

- **Fecha:** 2026-10-22 · **Estado:** aceptado (Felipe eligió las tres respuestas el 2026-10-22). Código en la rama
  `claude/etiquetas-atributos-98a04d`; la migración `20261022151000_campanas_del_catalogo_y_sellos.sql` está aplicada en local y
  **no en producción**.
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
- **Módulo nuevo `campanas_catalogo`** («Campañas», orden 142), nace sin rol y delegable (ADR-0161). **Consecuencia:** los roles que
  hoy configuran campañas con «Etiquetas» conservan los Sellos, pero no ven la pantalla Campañas hasta que el líder se la dé en Roles
  y accesos.
- **`fn_puede_editar_etiquetas()` acepta también `campanas_catalogo`** (y la web, `editarEtiquetas`), porque una campaña es una fila de
  `etiquetas`: sin eso, quien recibe Campañas vería la pantalla y la base le rechazaría cada guardado.
- Crear desde Campañas manda `estilo: "campana"` al `POST /api/productos/etiquetas`; la política de alta ya lo aceptaba.

## Descartado

- **Separar la base por estilo** (Sellos solo toca lo que no es campaña y Campañas solo lo que sí): obligaba a reescribir todas las
  funciones que crean, aprueban, configuran y ponen etiquetas, varias leídas por la caja. Nadie gana un permiso que no tenía: con
  `etiquetas` ya se podía todo eso. La pantalla es la que separa.
- **Renombrar la tabla o la clave del módulo** a `sellos`: rompe historia, políticas y Actividad sin ganar nada a la vista (como
  `clientas`).
- **La clave `campanas`**: ya existe en producción, en Tienda web (PR #1190). Los dos módulos de campañas de Tienda web se resuelven
  en otra sesión.
- **Poner las campañas en Ventas o unirlas a Tienda web ▸ Campañas:** Felipe eligió Catálogo. Ventas ya está cargado; bajo «Tienda web»
  parecería que una campaña es solo online, y también rige en las tiendas.

## Verificado

En local: la pantalla con sus tramos, el alta de una campaña (nace con estilo `campana` y no aparece en Sellos; base restaurada a la
foto), Sellos sin el grupo de campañas, menú y módulos (`modulos.test.ts`, `menu.test.ts` con la foto del menú puesta al día), las
guías de Atributos y de Campañas (`guias.test.ts`) y toda la suite de la web.

## Sin verificar

Producción. El enlace al diseño web de cada campaña: la base local no tiene el módulo `campanas_web` ni campañas con descuento.
