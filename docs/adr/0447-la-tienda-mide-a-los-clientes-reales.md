# ADR-0447 · La tienda mide cuánto tarda en el celular de los clientes reales

- **Fecha:** 2026-10-17 · **Estado:** aceptado (Felipe eligió la ruta A). Sin migraciones ni base: entra al fusionar y publicar la tienda.
- **Pedido:** después de optimizar la tienda (PR #1163, #1165, #1170 y #1173, todo medido en un banco local con red lenta simulada), saber
  qué ven los clientes de verdad para decidir las próximas mejoras con datos, sin costo ni servicio nuevo.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0432 (cáscara armada por adelantado), ADR-0445 (esqueletos fieles; deja abierta la
  pregunta de la lista a la ficha), ADR-0424 (Sentry en el ERP: la tienda no lo tiene). Backlog: `docs/backlog/2026-10-17-distracted-vaughan-22269f.md`.

## Lo que se averiguó antes de elegir (no se supuso)

- **La cuenta de Vercel es Pro**: el equipo `cayla` (`vercel teams ls`: plan `pro`), y la tienda es un proyecto más de ese equipo
  (`cayla-tienda`, ADR-0408).
- **El registro de Vercel en Pro guarda 1 día.** Con Observability Plus ($10/mes más uso) guarda 30 días y deja consultar 14 seguidos.
- **Speed Insights cuesta $10 al mes por proyecto** en Pro, con 10.000 datos incluidos y $0,65 por cada 10.000 más; guarda 30 días.
- **Speed Insights solo mide las métricas de Google** (LCP, INP, CLS, FCP, TTFB), no el tiempo del toque a la respuesta dentro de la tienda.
- **`vercel logs` lee horas pasadas desde la CLI 64** (`--since`, `--query`, `--json`, hasta 10.000 registros por vez y `--next` para
  seguir), con `--scope cayla --project cayla-tienda` (sin el equipo dice «not_linked»). Cada registro trae el mensaje en `data.message`
  y la última línea es `{"type":"summary",…,"pagination":{"hasMore":…,"next":…}}` (visto con la 64.5.0). En la máquina de Felipe la CLI
  instalada era la 58.4.4, que solo mira lo que llega en vivo.
- **El `useReportWebVitals` de Next 16.4 trae web-vitals con `reportSoftNavs`**: en el Chrome que reconoce las navegaciones internas
  manda también LCP, FCP, CLS e INP de cada una (`navigationType: "soft-navigation"`, con su `navigationURL`). Visto en local: sí las manda.

## La decisión

Felipe eligió entre dos rutas (Ganas/Pagas, 2026-10-17): **A, medición propia escrita en el registro de Vercel ($0)**, o B, Speed Insights
($10/mes). Eligió A, con una muestra de 1 de cada 2 visitas.

1. **`components/Medicion.tsx`**, montado una vez en `app/layout.tsx`, no dibuja nada: sortea la visita (1 de cada 2, `lib/medicion-muestra.ts`,
   una vez por pestaña en `sessionStorage`; una recarga sigue en lo mismo) y solo si entra carga **aparte** `components/MedicionActiva.tsx`
   (`next/dynamic`, sin servidor), con web-vitals adentro. Medir no puede hacer más lenta la tienda que mide: la visita que no entra no
   baja nada más que el sorteo, y la que entra lo pide al hidratar, sin que nada de la página lo espere. La que entra junta en la pestaña:
   - **Al entrar**, LCP, FCP, TTFB, CLS e INP de la página por la que entró (`useReportWebVitals`), y en Chrome los de cada navegación
     interna (`suave`).
   - **Al tocar un enlace de la tienda**, la hora del toque (la del evento) y, cuadro a cuadro, cuándo cambió la dirección o salió el
     esqueleto (`respuesta`: lo primero que la persona ve que pasó) y cuándo se fue el esqueleto (`pagina`). El esqueleto se reconoce por
     `data-esqueleto` en el `<main>` de `EsqueletoDePagina`, que dibujan todos los `loading.tsx`. Si la persona vuelve a tocar el mismo
     enlace sin haber visto nada, se sigue midiendo desde el primer toque y queda `repetido` (la señal más directa de «no respondió»). Lo
     que a los 20 s no llegó se anota como 20 s (dejarlo fuera haría ver el percentil mejor justo en los peores toques). Un toque que la
     persona deja (vuelve atrás, toca otro enlace, cambia de pestaña) no se cuenta: no se sabe cuánto habría tardado.
2. **Sale en un solo envío** (`navigator.sendBeacon`, o un `fetch` con `keepalive` y sin cookies) cuando la pestaña se oculta o se cierra:
   así llegan los valores finales de CLS e INP y no hay una petición por toque. Su oyente va en `window` y sin captura, para correr
   después de los de web-vitals (que están en la captura) y encontrar sus valores ya en la cola. En tandas de 20 medidas como mucho.
3. **`POST /api/medicion`** (`app/api/medicion/route.ts`) valida campo por campo (`leerEnvio`, `lib/medicion.ts`) y escribe **una línea**
   en el registro: `medicion_tienda {"t":…,"envio":…,"conexion":…,"ancho":…,"m":[…]}`. Nada más: ni base, ni sesión. `proxy.ts` no la mira.
4. **Lo que viaja no es de nadie:** la página sin sus ids ni lo que va tras el `?` (`rutaDeMedicion` → una de `RUTAS_MEDIDAS` o «otra»), la
   métrica y su valor, el id al azar que web-vitals le da a la métrica de esa carga, el tipo de conexión que dice el navegador (4g, 3g; Safari
   y Firefox no lo dicen) y el ancho de la ventana redondeado a 10 px. Nunca la sesión, el correo, la dirección completa ni la IP (la ruta no
   la escribe). Por eso la página de privacidad no cambia: no es un dato personal.
5. **El lector, `pnpm --filter tienda medicion:leer`** (`scripts/medicion-leer.mjs` y lo puro en `scripts/medicion-resumen.mjs`): baja las
   últimas 24 h del registro de producción (`vercel logs … --query medicion_tienda --json`, página a página), las guarda en
   `apps/tienda/.medicion/` (fuera de git) y resume todo lo guardado de los últimos 7 días, cada envío una sola vez: p75 por página de
   entrada con la vara de Google, p75 por toque (de dónde a dónde) y la respuesta a «¿hace falta el esqueleto inmediato de la lista a la
   ficha?». Corrido una vez al día, junta semanas aunque Vercel guarde un día.

```
DECIDÍ:     medir con useReportWebVitals más el toque → esqueleto → página, una visita de cada dos, y escribirlo en el registro de Vercel.
DESCARTÉ:   Speed Insights ($10/mes por proyecto), porque no mide el toque y la pregunta abierta de ADR-0445 (¿hace falta el esqueleto
            inmediato de la lista a la ficha?) es justo del toque. Felipe lo eligió así.
DESCARTÉ:   guardar las medidas en la base (una tabla `retail.tienda_*`), porque pide una migración en producción y abre a la base del ERP
            una escritura de cualquier visitante anónimo, para un dato que no es del negocio.
DESCARTÉ:   Sentry (ya está en el ERP, ADR-0424), porque su librería del navegador pesa decenas de KB en una tienda que se acaba de
            adelgazar, y la tienda no lo tiene.
DESCARTÉ:   revisar el `Origin` en la ruta, porque quien quiera mandar números falsos los manda igual con curl; lo que la protege es la
            validación (nombres fijos, páginas de una lista, números en rango, 20 medidas y 4 KB como mucho). Y un `Origin` que no calza
            detrás de un dominio nuevo callaría toda la medición sin aviso.
DESCARTÉ:   cargar web-vitals en todas las visitas (con el sorteo adentro del mismo componente), porque la mitad que no se mide pagaba
            ~5 KB comprimidos para nada; medido al compilar, se separó en un archivo que solo baja la muestra.
DESCARTÉ:   un envío por métrica o por toque, porque serían decenas de peticiones por visita y los valores finales de CLS e INP solo se
            conocen al ocultarse la pestaña.
SE ROMPE SI: Vercel cambia el formato de `vercel logs --json`: el lector busca la etiqueta en todos los textos de cada registro, así que
            solo se rompe si el mensaje deja de venir como texto. Síntoma: «Vercel no tiene envíos» con la tienda en uso.
SE ROMPE SI: nadie corre el lector en un día: ese día se pierde (el registro guarda uno). No rompe nada más.
SE ROMPE SI: una página nueva no se suma a `RUTAS_MEDIDAS`: se mide como «otra». `lib/medicion.test.ts` falla hasta que se sume.
SE ROMPE SI: un `loading.tsx` nuevo no usa `EsqueletoDePagina`: sin `data-esqueleto`, sus toques se miden como si no hubiera esqueleto
            (`respuesta` = `pagina`).
```

## Cifras

- **Peso:** lo que se mide (web-vitals, que ya trae Next, el componente y sus reglas) es un archivo aparte de 5,4 KB comprimidos (medido en
  `next build`; web-vitals solo, 3,6 KB) que baja únicamente la visita de la muestra. Toda visita baja el sorteo, unas pocas líneas dentro
  del archivo del layout (que quedó 0,45 KB más liviano que con las reglas adentro).
- **Peticiones:** una por visita en la muestra (más una por cada vez que la pestaña se oculta con algo nuevo), de unos 0,5 a 3 KB, sin
  esperar respuesta. Cada una es una invocación de función en Vercel (el plan Pro trae un millón al mes).
- **Registro:** una línea por envío, bajo 4 KB.

## Qué se verificó y qué no

- **Verificado:** pruebas puras (`lib/medicion.test.ts`: la muestra, las páginas contra las carpetas de `app/`, la validación, la línea, el
  proxy, la marca del esqueleto y que la compuerta no importe lo que mide; `scripts/medicion-resumen.test.mjs`: leer el registro de
  `next start` y el de `vercel logs --json`, contar una vez, percentiles, umbrales, «no llegó», «tocó de nuevo» y la decisión). `tsc`,
  ESLint, Vitest (593) y Knip (normal y de producción) en verde. Con la tienda compilada (`next start`, configuración `tienda-compilada` de
  `.claude/launch.json`):
  - En un celular simulado (Playwright, Pixel 7, toques con el dedo): al cambiar de app sale UN `POST /api/medicion → 204` con FCP, TTFB,
    LCP, CLS e INP de la entrada (56, 3, 108, 0 y 32 ms), los de cada navegación interna y los dos toques (Inicio → Catálogo con esqueleto:
    64 ms y 380 ms; de una lista a otra, sin esqueleto: 98 ms). Ancho 410, conexión 4g.
  - En el navegador del app: con la muestra en «no», el archivo de la medición no se baja y no sale ningún envío; con «sí», se baja. Un
    toque doble queda `repetido`; el ancho llega aunque el envío salga al cerrar la página; uno de la lista a la bolsa tardó 1 s sin
    ningún cambio en pantalla (lo que esta medición viene a contar).
  - El lector resume ese registro (`--archivo`), cuenta una vez el envío repetido, y avisa si la CLI es vieja. Contra Vercel, con la CLI
    64.5.0 (`npx vercel@latest`): `logs --scope cayla --project cayla-tienda --query medicion_tienda --json` responde su `summary` con 0
    registros (aún no publicado).
  - La base y el proyecto de clientes locales no estaban (sin las funciones de la tienda; la CLI de Supabase 2.109 no levanta la pila de
    clientes por la ruta de sus plantillas): la tienda se probó degradada, con sus lecturas de respaldo. No cambia lo medido.
- **NO verificado:** el lector con mediciones reales de producción (no hay hasta publicar). **Cómo lo verificas:** tras publicar, navega la
  tienda en el celular hasta entrar a la muestra (la mitad de las visitas; una ventana privada nueva vuelve a sortear), cambia de app y, en
  la computadora, `npm i -g vercel@latest` y `pnpm --filter tienda medicion:leer`: tiene que salir tu visita.
