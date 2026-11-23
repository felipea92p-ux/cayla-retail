## 🔎 SEO técnico de la tienda web: auditoría y tareas (2026-11-23, ADR-0696) — solo código de la tienda, sin migraciones; rama `claude/quizzical-murdock-3ce65d`

Salió de revisar el repo de skills `affaan-m/ecc`: su skill `seo` es genérica y no se instala, pero al cruzarla con `apps/tienda` se vio
que a la tienda le falta lo básico para Google y para la vista previa de WhatsApp. Felipe respondió D1–D3 el 2026-11-23 y T1–T7 quedaron
construidas ese día (ver «Lo hecho»), cada una con su commit; lo que queda es de Felipe, fuera del repo.

### Lo hecho (2026-11-23)

- [x] **T1** `0d83de5d6` — 307 desde el proxy (`lib/puerta-sede.ts`) con la tienda de la cookie o Trujillo. Local: `/` → `/inicio?sede=trujillo`
  en un salto; `/catalogo/<id>` → 307; la página final ya no trae `__next-page-redirect` y sí sus prendas.
- [x] **T2** `eae8a7e0a` — `metadataBase`, canonical en cada página indexable (`lib/seo.ts`), plantilla `%s · CAYLA`, `lang="es-PE"`, `og:locale es_PE`.
- [x] **T3** `ffa3ef46d` — la ficha con su frase, `opengraph-image.tsx` (1200×630, sin precio) y `Product`/`Offer` + `BreadcrumbList` (sin `brand`).
  En la compilación de producción `og:image` apunta a `https://cayla.pe/…`.
- [x] **T4** `b511ff80b` — `/sitemap.xml` (XML válido, `&` escapado: Next 16 no lo escapa) y `/robots.txt`.
- [x] **T5** `7157646f4` — `Organization` + `WebSite` en el Inicio y una `ClothingStore` por tienda en `/tiendas`.
- [x] **T6** `cd665115c` — frase propia en cada página que se indexa, `noindex` en Entrar, Crear cuenta, Olvidé mi contraseña, el look
  guardado, `/tu-look` y los favoritos; candado `lib/seo-paginas.ts` + su prueba.
- [x] **T7** medida, sin cambio de código: la ficha de `cayla.pe` pesa **35,5 kB en el cable** (brotli; los 496 kB eran sin comprimir) y el
  catálogo 50 kB; en la compilación local, 24 kB (documento) y 14,5 kB (flujo RSC). No hay motivo para tocar `MarcoCatalogo` sin datos de
  clientes reales.
- [ ] **Sin hacer:** la imagen de WhatsApp de un look de CAYLA (`/looks/[id]`): hoy comparte la del sitio. Puede reutilizar la vista de
  `/tu-look/vista` armando el código del look; queda para cuando se toque Outfits listos.

### Lo que hace Felipe (fuera del repo)

- [ ] **Search Console:** propiedad de dominio `cayla.pe` (el TXT ya está en el DNS), enviar `https://cayla.pe/sitemap.xml`, mirar «Páginas» a
  la semana y, en «Inspección de URLs», que la canónica elegida por Google sea la de `?sede=trujillo`.
- [ ] **Prueba de resultados enriquecidos** (`search.google.com/test/rich-results`) sobre una ficha y sobre `/tiendas`, ya publicadas.
- [ ] **Depurador de Meta** (`developers.facebook.com/tools/debug`, el que lee WhatsApp) sobre una ficha: la imagen y la frase. Sirve también
  para que WhatsApp vuelva a leer un enlace que guardó sin imagen.
- [ ] **Perfil de Empresa de Google** de cada tienda, con la dirección, el horario y el WhatsApp de `/tiendas`.
- [ ] **Medición de clientes reales:** `pnpm --filter tienda medicion:leer` (ADR-0447) con la CLI de Vercel 64 o más nueva y la cuenta de
  CAYLA (en esta máquina había la 58 con otra cuenta). Si el LCP de la ficha pasa de 2,5 s o el INP de 200 ms al 75 %, se abre la parte de T7
  que toca `MarcoCatalogo`.

**Cómo se auditó.** El código de `apps/tienda` en `origin/main` (`2a8ef513a`) y la tienda en vivo, `https://cayla.pe`, con `curl`
(solo peticiones GET a páginas públicas: no se mandó ningún dato de CAYLA a ningún servicio externo, ni a PageSpeed ni al validador de
Google). Lo de esta página está **medido** (lo devolvió `cayla.pe`) u **observado** en el código; las opiniones van marcadas.

### Lo que se encontró

| # | Hallazgo | Evidencia |
|---|---|---|
| H1 | **Sin `?sede=`, el catálogo, la ficha, el Inicio y los looks devuelven 200 con un esqueleto vacío** y una redirección escondida en la página: `<meta http-equiv="refresh" content="1;url=…?sede=arequipa">`. Quien no corre JavaScript (y Google en su primera pasada) ve una página sin prendas, sin fotos y sin enlaces a fichas | Medido: `curl https://cayla.pe/catalogo` → 200, 0 enlaces `/catalogo/<id>`, 0 `<img>`, `NEXT_REDIRECT;replace;/catalogo?sede=arequipa;307` dentro del payload. Causa: `lib/sede-servidor.ts` (`sedeDeLaPagina` llama `redirect()` cuando la cáscara de la página ya salió, ADR-0432) |
| H2 | **La portada son tres saltos:** `/` → 307 → `/inicio` → refresh de 1 s → `/inicio?sede=arequipa`. Un enlace viejo de Shopify, igual: `/products/x` → 308 → `/catalogo` → refresh | Medido con `curl -w %{redirect_url}`. `/` lo manda `redireccionDelProxy` (`lib/sesion.ts:60`) |
| H3 | **No hay `robots.txt` ni `sitemap.xml`** (ya lo anotaba ADR-0595, «Qué pasa con el SEO») | Medido: los dos dan 404. No existen `app/robots.ts` ni `app/sitemap.ts` |
| H4 | **No hay `metadataBase` ni canonical en ninguna página.** Cada prenda vive en al menos 3 direcciones (`?sede=arequipa`, `trujillo`, `lima`), más las de `color`, `talla` y `orden`, y la tienda entera se ve también en `cayla-tienda.vercel.app` (200, sin `X-Robots-Tag`) | Medido: ningún `<link rel="canonical">` en Inicio, catálogo ni ficha; en el catálogo de Arequipa los enlaces internos llevan 470 veces `sede=arequipa` |
| H5 | **La ficha de una prenda solo tiene título.** Su descripción es la de fábrica, igual en todas las páginas («Separa tus prendas de CAYLA y recógelas en tu tienda.»), no tiene `og:image` (por WhatsApp llega un enlace sin foto) ni datos de producto (`Product`/`Offer` con precio en soles y disponibilidad) | Medido en `/catalogo/a2724800…?sede=arequipa`: `<title>Falda Alana · CAYLA</title>`, 0 `og:*`, 0 `application/ld+json`. Código: `generateMetadata` de `app/(catalogo)/catalogo/[id]/page.tsx:45` |
| H6 | **Casi todas las páginas heredan la descripción de fábrica** del `layout.tsx`: Inicio, las listas, cada categoría, los looks, cada look, Entrar, Crear cuenta, Privacidad, Términos. Solo Club, Tiendas, Cómo separar, Cambios, Preguntas frecuentes y Libro de Reclamaciones escriben la suya | Observado: `grep` de `metadata`/`generateMetadata` en `app/**/page.tsx` |
| H7 | **Sin `noindex` donde haría falta:** `/entrar`, `/crear-cuenta`, `/olvide-mi-contrasena`, `/looks/guardado/[id]` (los looks de UNA persona) y `/tu-look?p=…` (combinaciones sin fin). Lo de la cuenta, la bolsa, las notificaciones y los filtros de color/talla sí lo tienen (ADR-0512) | Observado en cada `page.tsx` |
| H8 | `<html lang="es">` y el manifiesto con `lang: "es"`: no dice Perú. Sin `og:locale`. Títulos con la marca dos veces: «Club CAYLA · CAYLA», «Términos del Club CAYLA · CAYLA» | Observado: `app/layout.tsx`, `app/manifest.ts`, `app/club/page.tsx`, `app/terminos-del-club/page.tsx` |
| H9 | **Ningún dato de la marca ni de las tiendas para Google** (`Organization`, `ClothingStore` con dirección, horario y WhatsApp), aunque `/tiendas` ya tiene todo eso de la base (`lib/tiendas.ts`) y las redes están en `lib/redes.ts` | Observado |
| H10 | **Lo que pesa la ficha:** 496 KB de HTML, de los que 275 KB son el payload de React (105 ids de prenda distintos: lo que `MarcoCatalogo` le pasa a la cabecera en cada página); el catálogo de una tienda, 785 KB. La foto principal sí va bien: con `preload`, sin `lazy`, con `srcSet` | Medido con `curl` (sin comprimir). No se midió a clientes reales: eso lo da `medicion:leer` (ADR-0447) |
| H11 | Una prenda que no existe responde **200 con `noindex`** (no 404), y una ficha que no se pudo leer («No pudimos cargar esta prenda», la base no respondió) responde 200 **sin** `noindex`: si Google pasa justo en un corte, podría guardar esa página de error en lugar de la prenda | Medido: `/catalogo/no-es-un-id` → 200 + `noindex`. Código: `page.tsx:45` no mira `ficha === null` |

**Lo que está bien y no se toca:** los textos alternativos de las fotos (`alt="Falda Alana, foto 1"` en la ficha, el nombre en cada tarjeta;
los `alt=""` son la segunda foto, escudos y adornos: decorativos de verdad), `noindex` en cuenta, bolsa y filtros, `www` y `tienda.cayla.pe`
con 308 a `cayla.pe`, y las redirecciones permanentes de Shopify (ADR-0595 decidió no mapear prenda por prenda; se respeta).

### Decisiones de Felipe antes de empezar

**Respondidas el 2026-11-23** (las trajo la sesión que pidió la auditoría):
- **D1 → Trujillo.** La dirección canónica de cada página del catálogo lleva `?sede=trujillo`, y la puerta sin `?sede=` (el 307 de
  `proxy.ts`) manda ahí a quien no eligió una tienda. Con una sola constante (`SEDE_PRINCIPAL`) y, si Trujillo deja de verse en la web, la
  primera en orden: nunca una dirección a una tienda que no existe.
- **D2 → sin precio** en la imagen de WhatsApp.
- **D3 → sin `brand`**: no todo lo que se vende es CAYLA.

Lo que sigue es como estaba la pregunta:

- [x] **D1 · Qué tienda le muestra CAYLA a Google.** Google entra sin cookie, así que siempre ve la primera tienda de `sedesEnOrden` (hoy
  Arequipa) con su precio y su stock. **Recomiendo** que esa misma sea la tienda «canónica» de cada dirección (T1, T2): es la que Google ya
  ve, y no reabre la regla del 2026-10-19 («siempre se debe elegir una tienda»). Si prefieres que la cara sea Trujillo, se cambia el
  orden de las tiendas en la web, no un número escrito en el código. DESCARTÉ que la ficha sin `?sede=` se vea sin redirigir (una sola
  dirección por prenda): es más limpio para Google, pero reabre tu decisión del 2026-10-19 y con ~100 prendas la ganancia es chica.
- [x] **D2 · ¿La imagen de WhatsApp de una prenda lleva el precio?** **Recomiendo que no:** el precio cambia por tienda y por campaña, y
  WhatsApp guarda la vista previa días; una imagen con «S/ 79.90» mentiría cuando la campaña termine. El precio va en el texto y en los
  datos de producto.
- [x] **D3 · ¿Todo lo que se vende en la web es marca CAYLA?** Los datos de producto llevan `brand`. Si hay accesorios de proveedor (o
  prendas de CLAURE en Lima), sin una respuesta clara no se escribe `brand` (es recomendado, no obligatorio).

### Tareas, de mayor a menor impacto

- [x] **T1 · La puerta sin `?sede=`: un 307 de verdad desde el proxy, no una redirección escondida en la página** (H1, H2). Impacto: alto,
  todo lo demás se apoya en esto. Esfuerzo: medio.
  - **Archivos:** `proxy.ts`, `lib/sesion.ts` (`redireccionDelProxy`), `lib/sede-servidor.ts` (sigue como respaldo).
  - **Qué se escribe:** para una navegación GET/HEAD a una ruta del catálogo que no trae un `?sede=` válido (`/inicio`, `/catalogo`,
    `/catalogo/<id>`, `/looks`, `/looks/<id>`, `/looks/arma`), el proxy responde **307** a la misma ruta con `sede=` = la de la cookie
    `COOKIE_SEDE` o, sin cookie, la primera tienda (D1), conservando los demás parámetros y las marcas `utm_*`. `/` va directo a
    `/inicio?sede=…` (un salto, no tres). El proxy necesita los nombres de las tiendas: los lee de `tienda_sedes` con un recuerdo en
    memoria de unos minutos; **si la base no contesta, deja pasar** y la página redirige como hoy (principio 9). DESCARTÉ escribir
    «arequipa» en el proxy: si cambia el orden o cierra una tienda, mandaría a una tienda que no existe.
  - **Cómo se verifica:** casos nuevos en `lib/sesion.test.ts` (con cookie, sin cookie, con `?sede=` inválida, con `utm_*`, POST no se
    toca); en local, `curl -sI localhost:<puerto>/catalogo/<id>` → `307` con `location: /catalogo/<id>?sede=…`, y en el HTML de la página
    final ya no aparece `__next-page-redirect`. En producción, el mismo `curl` contra `cayla.pe` y «Inspección de URLs» en Search Console.

- [x] **T2 · Canonical, `metadataBase`, `es-PE` y la plantilla del título** (H4, H8). Impacto: alto (deja una dirección por página y es
  la base de las direcciones completas de T3 y T4). Esfuerzo: bajo-medio. Depende de D1.
  - **Archivos:** `app/layout.tsx`, `app/manifest.ts`, un `lib/seo.ts` nuevo con su `lib/seo.test.ts`, y el `generateMetadata` de cada
    página del grupo `(catalogo)`.
  - **Qué se escribe:** `metadataBase: new URL("https://cayla.pe")` desde una constante (la misma fuente que `DOMINIO_A_LA_VISTA` de
    `lib/compartir-look.ts`; no una variable de Vercel, que `lib/candados.test.ts` no deja leer); `title: { default: "CAYLA · Tienda
    online", template: "%s · CAYLA" }` (y los títulos dejan de escribir «· CAYLA» a mano, lo que corrige «Club CAYLA · CAYLA»);
    `openGraph: { siteName: "CAYLA", locale: "es_PE", type: "website" }`; `<html lang="es-PE">` y `lang: "es-PE"` en el manifiesto.
    En `lib/seo.ts`, una función pura `canonicalDe(ruta, parametros, sedeCanonica)` que deja solo lo que cambia el contenido
    (`lista`, `categoria`, `grupo`, `menu`, `pagina` > 1), pone `sede=` canónica y quita `color`, `talla`, `orden`, `utm_*` y `volver`;
    cada página la usa en `alternates.canonical`. Las páginas fijas (Tiendas, Club, ayuda) llevan su canonical sin parámetros. Eso
    también resuelve el duplicado de `cayla-tienda.vercel.app`. **hreflang: DESCARTÉ** — hay una sola versión (español, Perú) y una
    etiqueta que se apunta a sí misma no agrega nada; `lang` y `og:locale` alcanzan.
  - **Cómo se verifica:** la prueba recorre cada parámetro; `curl -s "localhost:<puerto>/catalogo/<id>?sede=trujillo&color=x" | grep
    canonical` → `https://cayla.pe/catalogo/<id>?sede=<canónica>`. Tras publicar, Search Console ▸ Inspección: «URL canónica
    seleccionada por Google» debe coincidir.

- [x] **T3 · La ficha de una prenda: descripción, vista previa de WhatsApp y datos de producto** (H5, H11). Impacto: alto (WhatsApp es por
  donde se comparte; Google puede mostrar precio y «En stock» en el resultado). Esfuerzo: medio. Depende de T2, D2 y D3.
  - **Archivos:** `app/(catalogo)/catalogo/[id]/page.tsx`, `app/(catalogo)/catalogo/[id]/opengraph-image.tsx` (nuevo), `lib/seo-ficha.ts`
    (nuevo, puro, con su prueba), `lib/ficha.ts` (exponer `codigo`, que la base ya manda y `interpretarFicha` hoy descarta).
  - **Qué se escribe:**
    1. `description`: la descripción de la prenda recortada a ~155 letras; si no tiene, una frase armada con lo que hay («Falda Alana de
       CAYLA a S/ 79.90 en Arequipa. Sepárala online sin pagar y recógela en tienda.»). Si `ficha === null`, `robots: { index: false }`.
    2. `openGraph`/`twitter` con título, descripción, canonical y la imagen de `opengraph-image.tsx` (1200×630, `next/og`): la primera
       foto con el nombre, armada con lo que ya usa la vista de un look compartido (`lib/fuentes-og.ts`, `lib/imagenes-del-look.tsx`,
       `app/tu-look/vista/route.tsx`, que ya funciona en WhatsApp) y la identidad de `apps/tienda/app/globals.css`. El logo y el colibrí
       se usan tal cual, no se redibujan. Si se quiere una composición nueva, van 2 o 3 maquetas en `docs/maquetas/` para elegir mirando.
    3. `<script type="application/ld+json">` en el HTML del servidor, armado por `jsonLdDeFicha(ficha, sede, url)`: `Product` (`name`,
       `description`, `image` con las URL completas de las fotos, `sku` = código, `category`, `brand` según D3) con su `Offer`: `price` =
       precio final con dos decimales, `priceCurrency: "PEN"`, `availability` según el nivel de la tienda (`"hay"` → `InStock`, 1–3 →
       `LimitedAvailability`, 0 → `OutOfStock`), `priceValidUntil` = último día de la campaña si tiene, `itemCondition: NewCondition`,
       `availableDeliveryMethod: OnSitePickup`, `availableAtOrFrom` = la tienda (nombre y dirección) y `seller` = CAYLA. Más un
       `BreadcrumbList` igual a la ruta que ya se ve (Inicio › Categoría › Prenda). El JSON escapa `<` (`<`): la descripción la
       escribe el equipo y no debe poder cerrar el `<script>`. DESCARTÉ `InStoreOnly` (es verdad que se paga en tienda, pero se pierde
       «quedan pocas» y «agotado») y `ProductGroup` con variantes por color y talla (es para fichas de comercio con pago en línea; aquí
       sobra).
  - **Cómo se verifica:** la prueba de `jsonLdDeFicha` (precio con dos decimales y en PEN, cada nivel, sin descripción, campaña con y sin
    fecha, `<` escapado); `curl` local de la ficha con `grep 'og:image\|ld+json'`. Tras publicar (o pegando el HTML, **con tu OK: es un
    servicio de Google**): la Prueba de resultados enriquecidos (`search.google.com/test/rich-results`) sin errores en «Fragmentos de
    productos» y «Rutas de exploración», y `validator.schema.org`. Para WhatsApp: mandarte el enlace a ti mismo, o el depurador de Meta
    (`developers.facebook.com/tools/debug`, WhatsApp usa el mismo lector), que también sirve para que WhatsApp vuelva a leer una vista vieja.

- [x] **T4 · `app/sitemap.ts`, `app/robots.ts` y Search Console** (H3). Impacto: alto. Esfuerzo: bajo. Depende de T2.
  - **Qué se escribe:** `sitemap.ts` con las direcciones canónicas: Inicio, Toda la tienda, cada categoría, Outfits listos y cada look,
    cada prenda publicada (todas, no solo las que tienen stock en la tienda canónica: `leerCatalogo(null)`), con su foto (`images`), y las
    páginas fijas (Tiendas, Cómo separar, Cambios y devoluciones, Preguntas frecuentes, Club, Libro de Reclamaciones, Privacidad, Términos
    del Club). Si la base no responde, sale solo con las fijas y se guarda poco tiempo, nunca un 500 (principio 9). `robots.ts`: todo
    permitido salvo `/api/` y `/auth/`, y `Sitemap: https://cayla.pe/sitemap.xml`. Lo que ya tiene `noindex` **no** se bloquea en
    `robots`: si Google no puede entrar, no ve el `noindex`. El `matcher` de `proxy.ts` ya deja pasar `.xml` y `.txt` sin redirigir.
  - **Lo que haces tú (Felipe), fuera del repo:** en Search Console, la propiedad de dominio `cayla.pe` (el TXT de verificación ya está en
    el DNS, ADR-0595), enviar el sitemap y mirar el informe «Páginas» a la semana.
  - **Cómo se verifica:** `curl localhost:<puerto>/robots.txt`; `curl localhost:<puerto>/sitemap.xml | grep -c '<url>'` = prendas publicadas
    + páginas fijas; una prueba de la función que arma la lista; Search Console ▸ Sitemaps en «Correcto».

- [x] **T5 · Las tiendas y la marca para Google** (H9). Impacto: medio-alto en búsquedas locales («tienda de ropa en Trujillo»). Esfuerzo: bajo.
  - **Archivos:** `app/tiendas/page.tsx`, `app/layout.tsx` (o `app/(catalogo)/inicio/page.tsx`), `lib/seo.ts`.
  - **Qué se escribe:** en `/tiendas`, un `ClothingStore` por tienda desde `leerSedes()`: nombre («CAYLA Trujillo»), dirección
    (`addressLocality`, `addressCountry: "PE"`), `telephone` (+51 del WhatsApp), `openingHoursSpecification` desde `dias`,
    `hasMap`, `image` (la foto de la tienda) y `parentOrganization`. En el Inicio, un `Organization` (nombre, `url`, `logo` =
    `/cayla-app-512.png`, `sameAs` desde `lib/redes.ts`). DESCARTÉ el cuadro de búsqueda (`SearchAction`): Google lo retiró en 2024.
  - **Lo que haces tú (Felipe), fuera del repo y lo que más pesa aquí:** el Perfil de Empresa de Google de cada tienda, con la misma
    dirección, horario y WhatsApp que muestra `/tiendas`.
  - **Cómo se verifica:** `validator.schema.org` y la Prueba de resultados enriquecidos sobre `/tiendas` (con tu OK); una prueba que arma
    el horario desde `dias` y cuida que una tienda sin horario no rompa el bloque.

- [x] **T6 · Una descripción propia en cada página que se indexa, y `noindex` donde falta** (H6, H7). Impacto: medio (el texto bajo el
  enlace en Google; hoy todas dicen lo mismo). Esfuerzo: bajo.
  - **Qué se escribe:** descripción propia en Inicio, cada lista (Lo nuevo, Ofertas, Más vendidos), cada categoría (armada con datos, en
    `lib/seo.ts` con su prueba: «Blusas CAYLA en Arequipa: 12 modelos desde S/ 54. Sepáralas online y recógelas en tienda.»), Outfits
    listos y cada look (este último también con `og:image`, como `/tu-look`), Privacidad y Términos. **El texto lo eliges tú:** las frases
    de aquí son ejemplos y no dicen «de mujer» ni nada que no sepamos; le hablan igual a cualquiera (regla de vocabulario). `noindex` en
    `/entrar`, `/crear-cuenta`, `/olvide-mi-contrasena`, `/looks/guardado/[id]` y `/tu-look` cuando trae `?p=` (la vista previa de
    WhatsApp sigue igual: `noindex` no la toca).
  - **Candado (como los del ERP):** un registro `lib/seo-paginas.ts` con cada `page.tsx` declarado `indexa` (con su descripción) o
    `noindex` (con su motivo), y una prueba que falla si una página nueva nace sin declararse. Así no vuelve a pasar.
  - **Cómo se verifica:** la prueba del registro; `curl` de cada página con `grep 'name="description"\|name="robots"'`.

- [x] **T7 · Core Web Vitals de la ficha: medir antes de tocar** (H10). Impacto: por saber. Esfuerzo: la medición, bajo.
  - **Qué se hace:** primero los datos de clientes reales, `pnpm --filter tienda medicion:leer` (ADR-0447: el registro de Vercel guarda
    1 día): LCP, INP y CLS al 75 % de `/catalogo/[id]` en celular. T1 ya quita una carga entera (el esqueleto con el refresh de 1 s) a
    quien llega sin `?sede=`. **Solo si** el LCP pasa de 2,5 s o el INP de 200 ms, se mira lo que `MarcoCatalogo` manda en cada página
    (los 275 KB del payload: el menú con las prendas de la tienda) para traerlo cuando se abra, no siempre.
  - **Cómo se verifica:** la misma lectura antes y después, y el banco local con red lenta que usaron los PR #1163–#1173.

### Al implementar

- T1 + T2 son una decisión estructural (la tienda canónica y la puerta): llevan su ADR, con número reservado con `pnpm reservar adr`.
- Cada PR se abre con `/abrir-pr`. Ninguna tarea toca la base, el dinero ni los comprobantes; T1 lee las tiendas desde el proxy, sin
  escribir nada.
- Ninguna mueve piezas a la vista salvo la imagen de WhatsApp (T3), que sigue la identidad de la tienda (CLAUDE.md, «Skills de diseño
  de afuera», punto 3).
