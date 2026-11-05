# ADR-0595 — La tienda web pasa de tienda.cayla.pe a cayla.pe, y la tienda de Shopify se da de baja

- **Fecha:** 2026-10-31 · **Estado:** propuesto (el código, la migración y las redirecciones están listos y probados; **el corte de DNS, la baja
  de Shopify y la migración en producción son de Felipe**: ver «Orden del corte»)
- **Relacionados:** ADR-0408 (la tienda online, app aparte), ADR-0288 (el cartel del Club lleva a la tienda), ADR-0463 (`empresas.web`),
  ADR-0450 (el vigía de salud de la tienda), ADR-0495 (medición propia de visitas), CLAUDE.md principio 9 («todo puede fallar»).

## El problema

`cayla.pe` lo ocupaba una tienda Shopify (51 prendas, 42 colecciones, 25 páginas, 9 blogs, 18 artículos) y la tienda web propia vivía aparte en
`tienda.cayla.pe`. Felipe (2026-10-31): no quiere seguir con Shopify; la tienda propia debe quedarse con `cayla.pe`, y quien entre a
`tienda.cayla.pe` debe llegar a `cayla.pe`.

El DNS está en GoDaddy (`ns31/ns32.domaincontrol.com`). Hoy: `cayla.pe` (A `23.227.38.65`) y `www` (CNAME `shops.myshopify.com`) son de Shopify;
`tienda` es de Vercel (proyecto `cayla-tienda`); `retail.cayla.pe` es el ERP. El correo es Zoho (MX, SPF y verificaciones en `cayla.pe`).

## Decisión

1. **`cayla.pe` es la tienda web.** `www.cayla.pe` redirige (308) a `cayla.pe`; `tienda.cayla.pe` también, conservando ruta y parámetros, para que
   los QR de los carteles ya impresos (`tienda.cayla.pe/?utm_source=qr`) y las etiquetas sigan sirviendo.
2. **En el código**, todo lo que nombraba `tienda.cayla.pe` pasa a `cayla.pe`: `DIRECCION_TIENDA_ONLINE` (QR del cartel),
   `WEB_DE_LA_ETIQUETA`, `DOMINIO_A_LA_VISTA` (imagen de «Compartir tu look»), el cartel y la página legal del Club.
3. **En la base** (`20261031205000`): `empresas.web` y el cierre de los avisos del Club (y los cuatro mensajes, que guardan el texto completo).
   Versiones nuevas; las viejas no se editan.
4. **Los enlaces viejos de Shopify no dan 404** (`apps/tienda/lib/redirecciones-shopify.ts`, 308): `/products/*`, `/collections/*` → `/catalogo`;
   `/pages/ubicacion-cayla` y `/pages/store-locator` → `/tiendas`; el resto de `/pages/*` y `/blogs/*` → `/`; `/cart` → `/bolsa`;
   `/account/*` → `/cuenta`; `/policies/refund-policy` → `/cambios-y-devoluciones`, `/policies/privacy-policy` → `/privacidad`.

DESCARTÉ mapear prenda por prenda de Shopify al catálogo del ERP: no comparten identificador, y llevar a una prenda equivocada es peor que llevar al
catálogo.
DESCARTÉ dejar Shopify en un subdominio: Felipe dio de baja la tienda; sostenerla es pagar un plan por nada.

## Orden del corte (importa: cada paso depende del anterior)

1. **Antes de tocar nada, en Shopify:** exportar clientes y pedidos (CSV), cerrar pedidos pendientes y reembolsos, y bajar lo que se quiera
   conservar (fotos, textos de las páginas, el blog). Al cerrar la tienda, el admin deja de existir.
2. **Vercel (hecho 2026-10-31):** `cayla.pe` y `www.cayla.pe` agregados al proyecto `cayla-tienda`. Sin DNS, no sirven nada todavía.
3. **GoDaddy:** `A @` → `216.150.1.1` (y `216.150.16.1`); `CNAME www` → `58fb811e4c45e238.vercel-dns-016.com`. **No tocar MX ni TXT** (Zoho).
4. **Verificar** que `cayla.pe` y `www.cayla.pe` muestran la tienda web con certificado.
5. **Pegar en producción** la migración `20261031205000` (SQL Editor, entera: no tiene políticas ni `alter`, no hay riesgo de deadlock).
6. **La variable de GitHub `URL_SALUD_TIENDA`** (la del vigía de salud, ADR-0450) **no estaba definida el 2026-10-31**, así que no hay nada que cambiar; si se activa, debe ser `https://cayla.pe/api/salud` y nunca la dirección vieja (el vigía no sigue redirecciones).
7. **Vercel:** convertir `tienda.cayla.pe` en redirección 308 a `cayla.pe`.
8. **Fusionar este PR** (el código nuevo ya apunta a `cayla.pe`).
9. **Cerrar Shopify** cuando no se dependa de su admin.

## Lo que queda abierto y es de Felipe

- **Supabase Auth del proyecto de clientes:** agregar `https://cayla.pe/**` a «Redirect URLs» (y dejar `tienda.cayla.pe`). Sin eso, el enlace del
  correo de «Olvidé mi contraseña» y la confirmación de cuenta rebotarían. También el origen autorizado en Google Cloud si hay «Entrar con Google».
- **Variables de entorno de Vercel** que lleven la dirección (`TIENDA_URL` en el ERP, usada por el enlace de la vista previa de campañas).
- **Textos legales del Club** (`club`, `mensaje_personal`, `pagina_publicidad`, `terminos`; ver `docs/club/*.sql`): nombran `tienda.cayla.pe`. Son lo
  que la persona aceptó; cambiar su letra pide versión nueva y revisión del abogado. La redirección cubre el enlace mientras tanto.
- **Qué pasa con el SEO:** la tienda web no tiene `robots.txt` ni `sitemap.xml`; las redirecciones traspasan lo ganado, pero conviene crearlos y
  registrar `cayla.pe` en Google Search Console (ya estaba verificado: hay un TXT `google-site-verification` en el DNS).
- **Boletas e impresos** con `www.cayla.pe`: siguen funcionando por la redirección de `www`.

## Cómo se verifica

`pnpm --filter tienda test` (redirecciones: cada destino existe y ningún origen tapa una pantalla propia) y `apps/web` (QR, etiqueta). La
migración se probó con `begin … rollback` en el Postgres local: cambia `empresas.web` y los cinco avisos, y pegarla otra vez no hace nada.
Después del corte: `curl -sI https://tienda.cayla.pe/catalogo?x=1` debe dar `308` a `https://cayla.pe/catalogo?x=1`, y
`curl -sI https://cayla.pe/products/jean` debe dar `308` a `/catalogo`.
