# ADR-0512 — Tienda online: filtros de COLOR y TALLA en la lista (opción «Filtros que se abren»)

**Estado:** aceptada, construida en 8 actividades en su PR · **una migración sin pegar en producción** (`20261026145000_tienda_filtros.sql`, una sola parte) ·
**Fecha:** 2026-10-26 · **Decidió:** Felipe (eligió la opción 1 mirando las dos maquetas y aprobó la lista de 8 actividades; los valores por defecto de las 7 decisiones
los puso él al aprobar) ·
**Sigue a:** ADR-0408 (la puerta angosta de la tienda), ADR-0270 (la regla única de «hay»), ADR-0384 (qué se ofrece y a qué precio), ADR-0312 (colores en familias del
ERP), ADR-0446 (A · Muro), ADR-0431 (la hoja nativa de la tienda)

## Contexto

La lista de la tienda filtraba por grupo, categoría y orden. Comparada con Onitsuka Tiger (que filtra por categoría, modelo, color, talla…), lo que más le faltaba al
cliente de CAYLA era **el color**: con los datos de Trujillo (2026-10-25, 232 prendas con unidades) hay 80 colores distintos y el **71 %** de las prendas viene en 2 o
más; en cambio solo el 30 % tiene más de una talla (116 «Estándar» y 14 «Única»). Y apareció un hecho que manda sobre el diseño: **la unidad de un filtro no es la prenda,
es la variante**. «Negro y M» exige UNA variante negra en M; si color y talla se filtraran por separado, la lista mostraría **177 prendas de más** (negro en S y beige en M
no es «negro en M»: el cliente abre la prenda y el negro no está en M).

## Decisión

Felipe eligió, mirando, la **opción 1 «Filtros que se abren»** (dos palabras, COLOR y TALLA, que abren un panel en la computadora y, en el celular, un botón «Filtros»
con una hoja desde abajo) y aprobó estos valores por defecto: 13 familias de color; «Estándar / única» como UNA opción; la categoría **no** cuenta como filtro; los
filtros **reemplazan** el historial («Atrás» sale de la lista); el número de cada opción es cuántas prendas vienen en ese color; filtros en todas las listas salvo
«Tus favoritos»; las listas filtradas llevan `noindex`; en vivo, con ~300 ms de espera.

```
DECIDÍ:     una función NUEVA y aparte, `retail.tienda_filtros(p_sede)`, de solo lectura: las variantes (prenda, color, talla) que la tienda ofrece con unidades libres.
DESCARTÉ:   parchar `retail.tienda_catalogo` para que traiga las variantes, porque 17 migraciones la mencionan y varias la reemplazan por anclas (parches vivos que se
            pierden al recrearla): un parche más arriesga lo que ya funciona, y el catálogo (136 kB) engordaría para todos, aunque nadie filtre.
SE ROMPE SI: la regla de «hay» cambia y esta función no se entera. Por eso no la copia: llama a `fn_tienda_precios` (qué se ofrece) y `fn_tienda_disponible` (qué hay, ADR-0270).

DECIDÍ:     las 13 familias de color PARA QUIEN COMPRA viven en código compartido (`packages/shared/src/colores-de-la-tienda.ts`), por código de color; un color nuevo cae
            según la `familia_color` del ERP hasta que se afina en un deploy.
DESCARTÉ:   una columna nueva en `colores` (o cambiar `familia_color`, que ordena la carta de colores del ERP, ADR-0312): metía negro, blanco y gris en «neutro» y
            beige y marrón en «tierra», demasiado grueso para comprar; una columna era una migración de tablas para algo que cambia poco.
SE ROMPE SI: una Líder necesita reasignar un color de familia sin esperar un deploy.

DECIDÍ:     la LISTA la arma el servidor desde la dirección (`?color=negro,blanco&talla=M`, en orden fijo); el navegador solo lleva lo que la persona toca hasta ella.
DESCARTÉ:   filtrar en el navegador con toda la lista: se pierde la caché de 30 s, la dirección que se comparte y se corrige, y la lista del buscador y del filtro sería la misma.
SE ROMPE SI: cada toque tarda más de un segundo. Medido (tienda compilada, 230 prendas): de clic a lista nueva p50 0,38 s, p95 0,54 s, con los 300 ms de espera adentro.

DECIDÍ:     si el filtro falla, la lista se ve ENTERA y lo dice; la base corta esta lectura a los 2 s y un fallo se anota una vez cada 10 s (principio 9).
DESCARTÉ:   callar y mostrar la lista entera (parece que filtró) o dejar que la lista espere a la base como espera al catálogo (con la función dormida 6 s, la página tardaba 5,2 s).
SE ROMPE SI: la base está tan lenta que el catálogo mismo no llega: ahí no hay lista que mostrar con o sin filtros.
```

### Las ocho reglas de los filtros (`lib/filtros-color-talla.ts`, una sola para servidor y navegador)

1. La unidad es la **variante**. 2. Dentro de una faceta se **suma** (Negro o Blanco); entre facetas se **cruza** (y, en la misma variante). 3. Cada opción dice cuántas
prendas **daría**, contando lo demás elegido pero no su propia faceta. 4. Una opción que daría 0 **no se puede elegir**; una elegida que quedó sin prendas por lo otro
(«muerta») sigue a la vista y se quita con un toque. 5. «Estándar» y «Única» son una opción; «S/M» cuenta como S y como M. 6. La talla solo se pide donde hay dos o más
tallas de verdad. 7. Al cambiar de grupo o de categoría se suelta lo que ahí no existe y se **dice** qué («En Pantalones no hay talla M: quitamos esa talla · Deshacer»).
8. El estado va en la dirección, en un orden fijo; una dirección escrita a mano se corrige con una redirección y la corrección es estable (no hay bucle).

### Lo construido (8 actividades, un commit cada una)

1. **La base** (`20261026145000_tienda_filtros.sql`, ver más abajo): `retail.tienda_filtros`. `pnpm pruebas:tienda-filtros`: 22 escenarios y 10 mutantes muertos.
2. **La regla en TypeScript** (`lib/filtros-color-talla.ts`, `packages/shared`): 29 pruebas, una caminata de 4.000 toques contra un cálculo independiente y 10 mutantes.
3. **La lista filtra por la dirección** (`lib/filtros-servidor.ts`, `lib/filtros-lista.ts`, `app/(catalogo)/catalogo/page.tsx`): negro y M en Trujillo da las 3 prendas con un negro
   en M; los números de grupos y categorías salen de lo filtrado; el que da 0 se apaga y no se esconde; 28 direcciones hostiles responden sin 5xx.
4. **Escritorio** (`components/filtros/`): la fila COLOR · TALLA con su panel, las fichas de lo elegido, el aviso con «Deshacer» que cruza de una lista a otra, `GET /api/filtros`.
5. **Celular**: el botón «Filtros» y la hoja (la hoja nativa de la tienda, `HojaNativa`, que ahora acepta `arrastrable` y `claseHoja`); la barra pasa a tres hileras **(cambia algo que
   ya existía: la lupa y el orden ya no van al lado de los grupos, que ahora usan todo el ancho)**.
6. **La tarjeta y la ficha**: «En Negro · talla M», la muestra elegida marcada, la foto de ese color si la tiene, y la ficha que abre ya con ese color y esa talla.
7. **Fallas y gente** (informe con cifras en el backlog): el aviso honesto, el tope de 2 s en la base y el registro de una línea por fallo.
8. **Este cierre.**

### Fuera de esto (decidido que no entra)

Anotar el color de cada foto (**137 de las 200 fotos de tarjeta no tienen `producto_fotos.color_codigo`**: sin eso, un filtro de color muestra a veces la foto de otro color; es
tarea de catálogo, no de pantalla), tocar `tienda_catalogo`, el ERP (`apps/web`) y producción.

## Lo que hay que pegar en producción (UNA sola parte; **no se pegó nada**)

`supabase/migrations/20261026145000_tienda_filtros.sql`: crea una función, su comentario y sus permisos (solo `tienda_web`). Sin políticas, sin `alter`, sin disparadores: no choca
con el Asesor de seguridad (ADR-0195) y se pega entera en el SQL Editor; es idempotente. **Orden:** pegarla **antes** de fusionar el PR (Vercel despliega desde `main`): con el código
publicado y la función sin pegar, la lista se ve entera con su aviso y el panel dice que no pudo cargar. Se verifica **por efectos**, sin el archivo: la función existe y es solo de
`tienda_web`, y responde algo.

## Verificación

Pruebas (`pnpm --filter tienda test`: 58 archivos), `pnpm pruebas:tienda-filtros -- --mutantes` (base), `pnpm knip` y `pnpm knip:produccion`. A mano, en una pila local propia con 230
prendas: 1440, 1024, 375 y 360 px, claro y oscuro, teclado completo, y las cuatro formas de fallar con la tienda compilada. **Sin probar:** iPhone y Safari reales, lector de pantalla
real (VoiceOver, NVDA) y personas reales (la «persona sin contexto» de la maqueta fue un agente).
