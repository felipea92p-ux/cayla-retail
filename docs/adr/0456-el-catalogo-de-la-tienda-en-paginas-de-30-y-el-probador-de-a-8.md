# ADR-0456 — El catálogo de la tienda en páginas de 30, y las opciones de «Arma el tuyo» de 8 en 8

- **Fecha:** 2026-10-19 · **Estado:** aceptado (Felipe lo aprobó mirándolo en local)
- **Relacionados:** ADR-0408 (la tienda online), ADR-0434 (el probador «Arma el tuyo»), ADR-0455 (la tienda minimalista), ADR-0136 (movimiento).
- **Reemplaza:** el catálogo «en tandas» del 2026-10-17 (`lib/tandas.ts`, `components/MasPrendas.tsx`: 24 → 60 → 156 prendas que se pedían solas al bajar).

## El problema

«Toda la tienda» y cada lista de prendas se dibujaban con scroll sin fondo: nadie sabía cuánto faltaba, «atrás» volvía a medias y el pie de la tienda (ayuda, tiendas, Club)
quedaba fuera de alcance. En «Arma el tuyo», la tira de opciones de una zona crecía con todo el catálogo (más de 30 prendas en «Arriba») y empujaba hacia abajo el total y el botón
«Agregar a la bolsa».

## Lo que se decidió

1. **Todo lo que sea prendas en el catálogo se parte en páginas de 30** (`lib/paginas.ts`, `POR_PAGINA`): toda la tienda, la ropa, los accesorios, lo nuevo, las ofertas, los más vendidos y
   los favoritos. 30 llena filas completas en las 2 columnas del celular y las 3 de la computadora. La página va en la dirección (`?pagina=`): «atrás» vuelve a la misma página y se puede
   compartir. Cambiar un filtro, el orden o la tienda empieza por la página 1 (el enlace de cada filtro no trae `pagina`). Una página que ya no existe (bajó el stock, un enlace viejo) cae en
   la última, nunca en una lista en blanco. El pie del catálogo (`components/Paginacion.tsx`): «‹ 1 … 4 5 6 … 12 ›» y «31–60 de 128 prendas»; el ranking de «Más vendidos» sigue contando
   (la prenda 31 es el puesto 31).
2. **Las opciones de «Arma el tuyo» van de 8 en 8** (`POR_PAGINA_PROBADOR`, `components/probador/TiraDeOpciones.tsx`): en la computadora, dos filas de cuatro que entran en una sola vista
   junto al paginador («1 de 2» con sus flechas) y «Buscar otra». «Sin …» ocupa un lugar de la primera página; «o un vestido» rotula las de la otra zona en la página donde caigan. Al
   cambiar de zona la tira abre en la página de la prenda puesta. En pantallas de menos de 820 px de alto, la foto de cada opción baja de 178 a 122 px para que sigan entrando.
3. **No se suma una capa: se borra una.** `lib/tandas.ts`, su prueba y `MasPrendas.tsx` salen; las páginas se calculan con una función pura (`paginaDe`).

## Descarté

- **Dejar el scroll infinito y solo acortar la primera tanda:** no dice cuánto falta, rompe «atrás» y el pie sigue inalcanzable. Es lo que se quería arreglar.
- **Guardar la página en el estado del navegador (sin `?pagina=`):** «atrás», recargar o mandar el enlace por WhatsApp volvían a la página 1.
- **Paginar la tira del probador en la dirección:** cada toque de flecha recargaría la página y movería la figura; es estado de la pantalla, no del enlace.

## Se rompe si

- El catálogo de la web pasa de ~3.000 prendas: `leerCatalogo` entrega todas las prendas de una vez y las páginas solo recortan lo que se dibuja (hoy, 298 prendas en producción = 10 páginas). Ahí
  habría que paginar en la base, no en la página.
- Una dirección trae `?pagina=` de otra sesión con otra tienda: cae en la última página que exista, y es lo correcto.
- Alguien agrega una cuarta columna a la grilla del catálogo: 30 deja una fila a medias (7,5 filas); habría que subir a 32 o 36.

## Pruebas

`lib/paginas.test.ts` (13 casos: lectura de la dirección, límites de la página, una página que ya no existe, los números de la barra sin saltar nunca una sola página);
`pnpm --filter tienda test`, typecheck, lint y `pnpm knip`. Medido en local con 74 prendas: tres páginas (30, 30, 14), el clic en un número vuelve al comienzo de la lista, a 375 px no hay
desborde, y «Arma el tuyo» a 1440×900 y 1366×768 muestra las 8 opciones con su paginador sin bajar.
