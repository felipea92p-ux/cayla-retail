# ADR-0660 · «Por definir» en Mis compras: la prenda se anota sin categoría o sin precio, y alguien lo dice después

- **Fecha:** 2026-11-13 · **Estado:** aceptado (Felipe eligió las tres decisiones de abajo mirando la maqueta `docs/maquetas/compras-por-definir-2026-11/`).
- **Migración:** `supabase/migrations/20261113211000_mis_compras_por_definir.sql` (una parte, re-ejecutable). **Pegar antes de publicar la web.**
- **Prueba:** `pnpm pruebas:mis-compras-por-definir` (11 casos) y las de la web (`compra-rapida-reglas`, `por-definir-reglas`, `corregir-compra-reglas`,
  `recepcion-envio-reglas`, `inicio-avisos`).
- **Relacionados:** ADR-0480 (Compras simple), ADR-0574 (la serie y el número al comprar), ADR-0561 (corregir una compra), marca opcional en «Algo nuevo»
  (`20261111192000`), ADR-0393 (Recibir contando), ADR-0377 (familias fuera de los motores), ADR-0537 b (lo que bloquea operar no sirve),
  ADR-0284 (guía de foco), ADR-0389 (guías interactivas).

## El problema

Una compradora anota en la calle la proforma de un proveedor nuevo: dos docenas, con su costo, pagadas. No sabe todavía a qué categoría pertenece
cada prenda ni a cuánto se vende. La hoja «Algo nuevo» exigía las dos cosas (la categoría, también la base: `orden_compra_items.categoria_id not null`
y `fn_orden_compra_validar`), así que la compra se quedaba sin anotar, y con ella el papel y el pago, que sí se saben. Felipe: «Hay que crear esa
opción de por definir y un aviso en pantalla. Ejemplo: 3 productos a la espera de definir categoría», y para el precio, «crear opción a la espera de
precio sugerido».

## Lo que eligió Felipe (2026-11-13)

| Pregunta | Eligió | Lo que no eligió |
|---|---|---|
| ¿Hasta dónde llega una prenda por definir? | **Viaja y se define al recibir**: sale a la tienda igual, y la tienda dice qué es antes de contarla | Esperar antes de mandarla (la recomendación); una lista aparte hasta definirse |
| ¿Quién define? | **Compras y la compradora**: quien ve «Revisar compras», cualquiera; la compradora, las suyas | Solo Compras; solo un líder |
| Sin precio, ¿sale a la tienda? | **Sí, la tienda pone el precio** al crear la prenda, como hoy cuando una orden no trae precio sugerido | Esperar igual que sin categoría |

## La decisión técnica

- **DECIDÍ:** «por definir» es un **estado de la línea** de la compra. `orden_compra_items.categoria_id` y `despacho_items.categoria_id` aceptan vacío,
  y el precio que espera es una **marca explícita**, `orden_compra_items.precio_por_definir`. Los candados de la base hacen imposible: lo pendiente
  fuera de una compra de Mis compras, en una prenda del catálogo o de vuelta a «por definir» una vez definido; una línea del envío sin categoría si
  su compra la tiene; y contar o cerrar en Recibir una línea sin categoría. Lo que entra al stock o queda como diferencia (`despacho_recibidos`,
  `despacho_diferencias`) sigue exigiendo categoría en la tabla.
- **DESCARTÉ:** una categoría «Por definir» en `retail.categorias`, porque crearía productos con ella y se colaría en Análisis, Frescura y el plan del piso
  (ADR-0377). También descarté el precio vacío como señal, porque el 2026-11-13 producción tenía 37 líneas de Mis compras sin precio (31 sin recibir) y el aviso
  las habría contado como «a la espera». Y descarté una tabla aparte para lo pendiente, porque la misma compra viviría en dos lugares y definirla obligaría a
  meter la prenda en una orden que quizá ya salió.
- **SE ROMPE SI:** una función nueva que lee las líneas de una compra o de un envío las une con `join retail.categorias` (no `left join`). Esa función
  se saltaría en silencio la prenda por definir, como pasaba en «Para mandar» antes de esta migración. Las lecturas que ya existían quedan cubiertas
  por los reemplazos de la migración y por las pruebas P8 y P10.

## Qué se construyó

1. **Anotar** (`registrar_compra_rapida`): cada línea puede decir `categoria_por_definir` y `precio_por_definir`. Lo vacío sin decirlo sigue siendo un error
   (`fn_compra_lineas_por_definir`), y la regla de las órdenes acepta la categoría vacía solo cuando una función de Mis compras lo pide dentro de su
   transacción (`retail.compra_por_definir`). La hoja «Algo nuevo» ofrece «Por definir» junto a «¿Qué es?» y «A la espera de precio sugerido» bajo «Se vende a».
   «Por definir» cuenta como respuesta para la guía de foco, y el ejemplo del nombre pasa al texto neutro (ADR-0290).
2. **Definir** (`definir_prenda_de_compra`): llena lo que falta de un modelo (todas sus líneas, una por tienda): la categoría, el precio o los dos. Basta uno
   de los dos. Funciona mientras la prenda no esté en la tienda: si ya salió y el envío no se abrió, la línea del envío lo sabe también. Lo puede hacer
   cualquiera de Compras («Revisar compras»), y la compradora solo lo suyo. Queda en `compra_correcciones` (quién y cuándo), y el mismo guardado otra vez
   (doble clic, corte) devuelve lo que ya quedó.
3. **El aviso** (`fn_compras_por_definir`): «Revisar compras» y «Mis compras» tienen la sección «Por definir» (`components/mi-plata/PorDefinir.tsx`), con
   «2 prendas a la espera de definir categoría · 1 también espera su precio» y un «Definir» por prenda. «Te toca» del Inicio tiene «Prendas por definir»,
   para quien ve «Revisar compras», y lleva a `/compras/fondos#por-definir`.
4. **Recibir:** la línea llega como «Por definir». La placa dice «Primero di qué es» y apaga el contador hasta que la tienda elige su categoría y su marca
   (`corregir_linea_al_contar`, que además se lo anota a la compra). Sin precio, la tienda lo pone al crear la prenda, como siempre. El papel pasa a los
   libros con la categoría que dijo la tienda.
5. **Lecturas que se saltaban la prenda:** «Para mandar», corregir la compra, el detalle de la orden y el envío y su resultado pasan a `left join`. Lo que agrupa
   por categoría (los proveedores para comprar, el plan de compra) no cuenta lo que espera. «Si se vende todo, ganas» dice «lo que tiene precio» cuando
   alguna prenda espera el suyo.

## Lo que no hace

No cambia nada de lo ya anotado. No deja «por definir» una prenda del catálogo. No le pone categoría a nada por su cuenta. No toca stock, movimientos ni dinero:
la plata de la compra se anota igual que antes.

## Cómo se pega en producción

Una sola parte, re-ejecutable, con `lock_timeout`. Hace dos `alter column … drop not null`, agrega una columna con su valor de fábrica (119 líneas el 2026-11-13),
dos `check`, dos disparadores (`create or replace trigger`) y funciones, con 19 reemplazos anclados que frenan sin cambiar nada si el texto vivo no es el esperado.
No crea políticas (ADR-0195) y no usa `select … into` dentro de textos (ADR-0288). La consulta de verificación está en la cabecera de la migración. Se pega
**antes** de publicar la web: con la web nueva y la base vieja, guardar «Por definir» da «La línea 1 necesita una categoría activa» y no queda nada a medias.
