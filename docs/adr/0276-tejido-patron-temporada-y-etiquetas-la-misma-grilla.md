# ADR-0276 · Tejido, Patrón, Temporada y Etiquetas: la misma grilla en el paso 3 del alta

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Solo web, **sin migración**.
- **Pedido:** Felipe, 2026-09-29, sobre dos capturas del paso 3 de «Nuevo producto»: «quiero que tejido, patrón,
  temporada y etiqueta se muestren de la misma manera uniforme así como tejido y patrón con su imagen y ver más» +
  «[Etiquetas] quitar la barra de búsqueda y mostrar eso como sus pares visualmente». Afinado con `AskUserQuestion`
  antes de tocar código (qué de Patrón y qué de Etiquetas corregir, exactamente).
- **Complementa:** ADR-0109 (etiquetas con dibujo), ADR-0209 (buscador y paginado de combos — Temporada seguía siendo
  un `<select>` con lectura nativa, el único que quedaba en el paso 3), ADR-0246 (Temporadas como atributo), ADR-0256
  (detalle de Tejidos y Patrones), ADR-0261 (el mismo problema, resuelto en Atributos, no en el alta).

## Qué había

Tejido y Patrón ya compartían el molde de `ElegirMuestra.tsx`: grilla de tarjetas de 92 px con su imagen o dibujo
automático, y una tarjeta punteada «Ver todos · N» que abre una hoja con buscador. Temporada y Etiquetas, al lado, no:

- **Temporada** era un `<select>` con la temporada heredada de la categoría escondida en su primera opción.
- **Etiquetas** ponía TODO el vocabulario a la vista, agrupado (Rotación/Artesanal/Campaña/General), con un buscador
  siempre visible arriba para filtrar esa lista larga.

Cuatro filas de un mismo paso, resolviendo «elegir de una lista con imagen» de tres maneras distintas — el mismo
problema que ADR-0261 ya había resuelto en Atributos, pero sin tocar el alta.

## Decisión

1. **El molde vive en un solo archivo: `components/alta-producto/GrillaMuestras.tsx`.** `GrillaMuestras` (el grid),
   `TarjetaMuestraBase` (el marco de una tarjeta, con sus tres estados: normal, elegida, cubierta) y `TileVerTodos`
   (la tarjeta punteada final). `ElegirMuestra.tsx` (Tejido/Patrón) se reescribió sobre estas piezas sin cambiar su
   comportamiento — es una extracción, no un rediseño: mismas clases, mismo pixel a pixel.
2. **Temporada gana `ElegirTemporada.tsx`.** Reemplaza el `<select>` por la misma grilla, con `MuestraTemporada`
   (ya existía, ya se usaba en Atributos ▸ Temporadas — ADR-0261 — con OTRO marco de tarjeta; ahora comparte este). A
   diferencia de Tejido/Patrón, temporada es una lista PLANA de 9 (`retail.fn_temporadas()`, sin relación por
   categoría) y elegir una no escribe nada en la categoría: su hoja «Ver todos» no tiene buscador, secciones ni
   «Proponer un valor» — las 9 entran de sobra en una sola grilla. La opción «Ninguna» (heredar la temporada de la
   categoría) es una tarjeta más, con un dibujo punteado igual al «Sin muestra» de Tejido/Patrón cuando falta una
   foto; el texto de qué hereda (el nombre de la temporada de la categoría) sigue en la ayuda del campo, como ya se
   había decidido al simplificar la opción del `<select>` (spike v2) — no se repitió acá.
3. **Etiquetas se parte en grilla chica + hoja**, igual que Tejido/Patrón: `ElegirEtiquetas.tsx` muestra hasta 5
   tarjetas (lo marcado y lo que «ya aplica sola» nunca se esconden — `etiquetasALaVista`, `lib/etiquetas-alta-reglas.ts`)
   + «Ver todos · N etiquetas»; la hoja (`HojaEtiquetas`, interna del mismo archivo) trae el buscador («Buscar o crear
   una etiqueta…», el mismo de antes, solo que ya no vive en la grilla chica), el vocabulario agrupado por
   Rotación/Artesanal/Campaña y festividad/General (`agruparEtiquetas`, sin cambios) y el panel de «+ Crear». A
   diferencia de Tejido/Patrón/Temporada, de etiquetas se elige más de una: tocar una tarjeta en la hoja NO la cierra.
4. **Lo que NO cambió:** el tooltip de cada etiqueta (qué es, si descuenta, si ya rige), la insignia de descuento, el
   candado de campaña («ya aplica sola», línea punteada), el combo «Responsable» al crear (ADR-0161), ni ningún RPC —
   `p_temporada` y `p_etiqueta_ids` viajan igual que antes a `crear_producto_con_stock_inicial`.

## Se rompe si

Alguien agrega un quinto campo de este tipo al paso 3 copiando las clases de `TarjetaMuestraBase` a mano en vez de
importar el archivo — que es exactamente el error que esta ADR corrige (la integridad conceptual de cuatro campos
depende de que compartan la MISMA definición, no cuatro copias que empiezan iguales y divergen).

## Cómo se verificó

Sin base de datos (Docker de este repo con otras sesiones encima; ver `docs/backlog` sobre no tocar el stack
compartido): página temporal `app/login/preview-uniforme` (bajo `/login`, fuera del `proxy.ts` de sesión — se borró
al cerrar la tarea) con `ElegirMuestra`, `ElegirTemporada` y `ElegirEtiquetas` montados con datos de mentira (9
temporadas reales, 11 etiquetas de las tres familias, categoría con `categoriaIds` cubriendo una). A 1440 px y a
375 px: Patrón pixel-igual al de antes; Temporada con «Ninguna» + 9 temporadas + «Ver todos», selección cierra la
hoja; Etiquetas con grilla chica (marcada + cubierta + relleno), hoja con buscador funcionando («navi» filtra a
Navidad y ofrece «+ Crear «navi»»), selección múltiple sin cerrar la hoja, Escape en dos tiempos (borra el texto,
después cierra). Suite web completa: 227 archivos, 152 704 pruebas en verde; `pnpm typecheck` y `pnpm lint` limpios.
