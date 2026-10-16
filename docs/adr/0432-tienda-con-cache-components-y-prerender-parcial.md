# ADR-0432 — La tienda online arma por adelantado lo que es igual para todos (Cache Components + prerender parcial)

- **Fecha:** 2026-10-16 · **Estado:** aceptado (Felipe aprobó migrar por fases, empezando por las páginas públicas). Sin migraciones ni
  cambios en producción: entra al fusionar y publicar la tienda.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0426 (frenos), `docs/bitacora/2026-10-16-tienda-cache-components.md`.

## El problema

Felipe pidió que la tienda cargue rápido sin mostrar datos viejos. Ya estaban bien lo estático, las fotos y las lecturas compartidas de
la base (`lib/compartido-servidor.ts`). Lo que faltaba: cinco páginas públicas (`/tiendas`, `/como-separar`, `/privacidad`,
`/terminos-del-club`, `/cambios-y-devoluciones`) salían dinámicas (`ƒ`, sin caché) solo porque su marco leía las cookies para elegir la
cabecera con o sin cuenta, y en las páginas con cuenta cada navegación esperaba al servidor para pintar algo.

## Decisión

Se activan `cacheComponents` y `partialPrefetching` en `apps/tienda/next.config.ts` (Next 16.4.1) y la tienda pasa a «cáscara armada por
adelantado + lo de la persona por detrás». Se descartó `staleTimes` (experimental: deja el stock hasta ~60 s viejo).

- **Lo compartido** (campaña, tiendas, ayuda, catálogo, beneficios del Club, texto de la casilla de avisos): cada lectura sigue en su
  `unstable_cache` (persiste entre instancias de Vercel) y ahora tiene encima una función con `"use cache"` para que Next pueda armar por
  adelantado la página que la usa. Si la base no responde **no lanza**: devuelve `null` y esa copia dura 5 s (un error lanzado habría
  tumbado el armado de toda la tienda al publicar). Los plazos son los de siempre (30 a 300 s).
- **Lo de una persona** (cuenta, favoritos, bolsa, pedidos, sesión): nunca se guarda. Se lee dentro de `<Suspense>`.
- **Páginas públicas que sirven a quien tiene cuenta y a quien no:** `MarcoCuenta segunSesion` arma la cabecera y el pie del visitante por
  adelantado y `SegunSesion` pone lo de quien tiene cuenta por detrás. Mientras el servidor lee la cookie, `ElegirPorCookie` (cliente) mira
  la cookie de sesión del navegador (no es `httpOnly`) y pinta la cabecera sin números, para que quien navega no vea un instante la del
  visitante. La cuenta de verdad se sigue validando donde se muestran sus datos.
- **Páginas con cuenta:** el layout del catálogo lee la campaña fuera del `Suspense` y la sesión dentro, con el esqueleto (`EsqueletoDePagina`)
  mientras tanto. `/recomendaciones` gana su `loading.tsx`.
- **El reloj:** Next no deja leer `new Date()` al armar una página. El año y el día de Lima salen de `lib/hoy-servidor.ts` (guardados 1 h;
  la regla de los 18 años la vuelve a revisar el servidor al crear la cuenta) y las cuentas regresivas toman la hora del aparato con
  `useAhora`.
- **Últimas páginas escondidas:** con Cache Components, Next deja las últimas páginas visitadas escondidas (`display: none`) en vez de
  desmontarlas. Las búsquedas globales del DOM usan `lib/visible.ts` y los ids repetidos entre páginas se hicieron únicos.
- **Se queda dinámica a propósito:** `/nueva-contrasena` (lo que muestra depende del código de la dirección; `instant = false`) y las rutas
  `/api/*`.

No se tocó `proxy.ts`, las redirecciones por sesión, las cabeceras de seguridad ni la CSP, ni se lee ninguna cookie en el 404 raíz ni en el
layout raíz.

## Qué se midió

Ver `docs/bitacora/2026-10-16-tienda-cache-components.md`. Resumen: `next build` pasa de 5 a 20 rutas armadas por adelantado (○/◐); en
local, sin red ni CDN, nada empeoró y las dos versiones se sienten igual; la ganancia real (primer byte de las páginas públicas desde el
CDN de Vercel, ~0,12–0,4 s en vez de ~0,6 s) solo se puede medir publicando, y eso espera el OK de Felipe.

## Lo que se arriesga

`next start` sigue contestando `private, no-store` en las páginas ◐; Vercel las sirve desde su CDN (la cáscara) y transmite el resto. Se
confirma después de publicar, con `curl -I` a las cinco páginas públicas. Si algo sale mal, quitar los dos flags de `next.config.ts` vuelve
a la tienda de antes (los `"use cache"` sin el flag no hacen nada).
