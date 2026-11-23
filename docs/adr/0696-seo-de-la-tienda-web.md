# ADR-0696 — Lo que la tienda web le dice a Google y a WhatsApp: la puerta con un 307, la tienda canónica y los datos de cada página

- **Fecha:** 2026-11-23 · **Estado:** aceptado (Felipe respondió D1, D2 y D3 el 2026-11-23). Solo código de `apps/tienda`: sin migraciones.
  **Fuera del repo y de Felipe:** registrar `cayla.pe` en Search Console y enviar el mapa, la prueba de resultados enriquecidos de Google y el
  depurador de vista previa de Meta (WhatsApp), y leer la medición de clientes reales (ver «Lo que queda»).
- **Relacionados:** ADR-0408 (la tienda online), ADR-0432 (cáscara armada por adelantado: por qué la redirección quedaba escondida), ADR-0447
  (medición de clientes reales), ADR-0512 (filtros de color y talla con `noindex`), ADR-0595 (la tienda pasa a `cayla.pe`; ya anotaba que
  faltaban `robots.txt` y `sitemap.xml`), ADR-0616 (la tienda tiene sus estilos). Auditoría y tareas: `docs/backlog/2026-11-19-seo-tienda-web.md`.

## El problema (medido en `cayla.pe` el 2026-11-23)

1. **Sin `?sede=`, las páginas del catálogo salían vacías.** `/catalogo`, cada ficha, el Inicio y los looks respondían 200 con el esqueleto y
   `<meta http-equiv="refresh" content="1;url=…?sede=arequipa">`: `sedeDeLaPagina` pedía redirigir cuando la cáscara (ADR-0432) ya había
   salido, así que Next solo podía esconder la redirección en la página. Quien no corre JavaScript —y Google en su primera pasada— veía una
   página sin prendas ni enlaces; la portada eran tres saltos (`/` → 307 → `/inicio` → refresh → `/inicio?sede=arequipa`).
2. **No había `robots.txt`, `sitemap.xml`, `metadataBase` ni canonical.** Cada prenda vivía en 3 o más direcciones (una por tienda, más color,
   talla y orden) y la tienda entera también en `cayla-tienda.vercel.app`.
3. **La ficha solo tenía título.** Ni frase propia (todas las páginas heredaban la del layout), ni imagen para WhatsApp, ni datos de producto.

## Las decisiones

1. **La puerta la cierra el proxy con un 307 de verdad** (`lib/puerta-sede.ts`, `proxy.ts`). A una página del catálogo que llega sin `?sede=`
   (`/inicio`, `/catalogo`, `/catalogo/<id>`, `/looks`, `/looks/<id>`, `/looks/arma`, `/looks/guardado/<id>`, `/bolsa`; solo la página, no lo
   que cuelga de ella como su imagen) le responde 307 con la tienda de la cookie o, sin ella, la principal, conservando los demás parámetros.
   `/` llega a `/inicio?sede=…` en un salto. El proxy no le pregunta a la base: una clave que ya no existe la sigue corrigiendo la página, que
   conserva su redirección como respaldo. Es 307 y no 308 porque el destino depende de la cookie.
2. **La tienda principal es Trujillo** (D1, Felipe): `SEDE_PRINCIPAL` en `lib/sede-elegida.ts`. Es la de quien llega sin elegir, la que ve
   Google y la de la dirección canónica. Si deja de verse en la web, manda la primera en orden (`sedePrincipal`): nunca una dirección a una
   tienda que no está. Las píldoras siguen en orden alfabético.
3. **Cada página indexable lleva su canonical en `cayla.pe`** (`lib/seo.ts`, `canonicalDe`): las del catálogo con `?sede=trujillo` y solo lo que
   cambia el contenido (`lista`, `categoria`, `grupo`, `menu`, `campana`, `pagina` > 1); fuera quedan `orden`, `color`, `talla`, `utm_*` y
   `volver`. `metadataBase` sale de una constante (el mismo dominio de `DOMINIO_A_LA_VISTA`), no de una variable de Vercel. El layout pone la
   plantilla `%s · CAYLA`, `og:locale es_PE` y `<html lang="es-PE">`; nunca la canonical (la heredarían todas).
4. **La ficha dice su frase, su vista previa y sus datos de producto** (`lib/seo-ficha.ts`, `opengraph-image.tsx`). La frase es la descripción
   de la prenda o una armada con nombre, precio en soles y tienda; dice «en CAYLA», nunca «de CAYLA». La imagen (1200×630) lleva foto y nombre,
   **sin precio** (D2, Felipe: cambia por tienda y por campaña y WhatsApp guarda la vista días). Los datos son `Product` + `Offer` (o
   `AggregateOffer` si las tallas cuestan distinto) en PEN, con la disponibilidad de la tienda de la página, `OnSitePickup` y la tienda como
   `availableAtOrFrom`, **sin `brand`** (D3, Felipe: no todo lo que se vende es CAYLA), más el `BreadcrumbList`. El JSON escapa `<`.
5. **`sitemap.xml` y `robots.txt`** (`lib/mapa-del-sitio.ts`). El mapa lista con su canonical cada prenda publicada en la web (de todas las
   tiendas), cada categoría, las listas, los looks y las páginas fijas; Next 16 escribe `<loc>` sin escapar, así que el `&` va como `&amp;`.
   `robots.txt` solo cierra `/api/` y `/auth/`: lo que dice `noindex` no se bloquea, o el buscador nunca vería el `noindex`.
6. **La marca y las tiendas para Google** (`lib/seo-marca.ts`): `Organization` y `WebSite` en el Inicio (el logo es el colibrí de la app, tal
   cual), y una `ClothingStore` por tienda en «Nuestras tiendas», con su horario de la semana.
7. **Cada página dice si se indexa** (`lib/seo-paginas.test.ts`, que es el registro y su prueba): toda `page.tsx` se declara `indexa` (con su frase y su canonical) o no
   (con `noindex` y su motivo). Una página nueva no puede nacer sin declararse.

## Lo que descarté

- **Que la ficha sin `?sede=` se vea sin redirigir** (una sola dirección por prenda): más limpio para Google, pero reabre la regla del
  2026-10-19 («siempre se debe elegir una tienda») y, con ~100 prendas, la ganancia es chica.
- **Escribir la tienda principal solo en el proxy**: la página y la canonical la necesitan igual; es una sola constante con su respaldo.
- **`hreflang`**: hay una sola versión (español del Perú); `lang` y `og:locale` alcanzan.
- **`InStoreOnly`** como disponibilidad: es verdad que se paga en tienda, pero se pierde «quedan pocas» y «agotado».
- **`ProductGroup` con variantes por color y talla**: es para fichas con pago en línea; aquí sobra.
- **El cuadro de búsqueda (`SearchAction`)**: Google lo retiró en 2024.
- **Distinguir en el proxy la navegación de React (cabecera `RSC`)**: Next no se la muestra al proxy; esa navegación sigue el 307 como
  cualquier redirección del proxy.

## Lo que queda (de Felipe, fuera del repo)

- **Search Console:** la propiedad de dominio `cayla.pe` (el TXT de verificación ya está en el DNS, ADR-0595), enviar
  `https://cayla.pe/sitemap.xml` y mirar el informe «Páginas» a la semana.
- **Prueba de resultados enriquecidos** (`search.google.com/test/rich-results`) sobre una ficha y sobre `/tiendas`, y **el depurador de Meta**
  (`developers.facebook.com/tools/debug`, el lector que usa WhatsApp) sobre una ficha: también sirve para que WhatsApp vuelva a leer una vista
  vieja.
- **Perfil de Empresa de Google** de cada tienda, con la misma dirección, horario y WhatsApp de `/tiendas`.
- **La medición de clientes reales** (`pnpm --filter tienda medicion:leer`, ADR-0447) necesita la CLI de Vercel 64 o más nueva con la cuenta de
  CAYLA; en esta máquina había la 58 con otra cuenta.

## Cómo se verifica

`pnpm --filter tienda test` (`puerta-sede`, `sede-elegida`, `seo`, `seo-ficha`, `seo-marca`, `mapa-del-sitio`, `seo-paginas`). En local, contra
una copia de la base: `curl -sI localhost:3100/catalogo/<id>` → `307` a `?sede=trujillo`; la ficha final trae `canonical`, `description`,
`og:image` y un `application/ld+json` con `Product`; `/sitemap.xml` es XML válido; `/robots.txt` apunta a él. Tras publicar, lo mismo contra
`cayla.pe` y las herramientas de «Lo que queda».
