# ADR-0424 · Un error de pantalla avisa solo: Sentry, como Dynamic

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado en local contra un Sentry de mentira; **apagado en producción hasta que Felipe
  cree el proyecto y ponga dos variables en Vercel** (abajo, «Para encenderlo»). Rama `claude/no-view-page-image-animation-972032`.
- **Pedido:** Felipe, 2026-10-15, después de que el meme de Aventurero dijera «lo está dando todo para solucionarlo»: que un error de
  pantalla avise solo. Elegido entre tres opciones: **Sentry, como Dynamic** (las otras: registro propio con aviso en el Inicio, o las dos).
- **Extiende:** el principio 9 (todo puede fallar) y `lib/errores.ts` (`capturarError`, Lucode/SUNAT), cuyo propio comentario anunciaba que
  «el paso siguiente es Sentry». **Complementa:** ADR-0136 act. 2026-10-15 (Aventurero), ADR-0149 (el loader, que no cambia).

## El problema

Cuando una pantalla se caía, nadie se enteraba salvo que la persona avisara. El ERP no manda correos ni notificaciones de ninguna clase. Un
error del navegador quedaba en la consola de quien lo vio; uno del servidor, en los logs de Vercel, que duran poco y no avisan a nadie; y los
errores que no pueden perderse (`capturarError`: un comprobante que SUNAT aceptó y la base no guardó) también iban solo a esos logs.

## La decisión

**Sentry**, en la misma cuenta que Dynamic (`cayla.sentry.io`), con un proyecto propio, `cayla-retail`. Dynamic manda ~290 errores en 30 días
sin tocar el tope; retail cabe de sobra. Sentry agrupa los repetidos, le escribe a Felipe cuando aparece uno nuevo, y con los mapas del código
dice la línea exacta. Claude Code puede leerlo (la conexión con Sentry ya existe) y arreglarlo.

Tres caminos, todos con la misma limpieza (`lib/errores-reglas.ts`):

| Dónde revienta | Quién avisa | Archivo |
|---|---|---|
| En el servidor (una pantalla, una acción, una API) | `onRequestError`, con el mensaje real y el `digest` como etiqueta | `instrumentation.ts` |
| En el navegador (una barrera de error) | la barrera, solo si el error NO trae `digest` (el servidor ya lo avisó: avisarlo otra vez lo duplicaría, y sin el mensaje) | `lib/errores-navegador.ts` (`avisarError`) |
| En el navegador, sin barrera (un botón, una promesa) | Sentry mismo, al cargarse; lo de antes, guardado y mandado al llegar | `instrumentation-client.ts` |
| Un error que no puede perderse (Lucode, SUNAT, las tareas programadas) | `capturarError`, agrupado por su `donde` | `lib/errores.ts` |

- **Solo en producción** (`NEXT_PUBLIC_ENTORNO`, que `next.config.ts` toma de `VERCEL_ENV`) y solo con `NEXT_PUBLIC_SENTRY_DSN` puesta. En local y
  en las vistas previas quien prueba ya ve el error; un aviso ahí sería ruido.
- **Sin los parpadeos de red del navegador** («Failed to fetch», «Load failed»…): en una tienda con wifi irregular son decenas al día y no son
  una pantalla rota (en Dynamic son la mitad de sus avisos). El «fetch failed» del SERVIDOR sí avisa: es Vercel sin llegar a Supabase.
- **Quién y dónde:** el id de la cuenta (un uuid, sin nombre), la sede y el rol (`components/ContextoDeErrores.tsx`, en el layout de la app).
- **Qué ve la persona:** con Sentry encendido, la tarjeta dice «Reintenta. A Felipe le llega un aviso de este error; si te urge, escríbele.»;
  sin él, lo de antes, «Reintenta; si sigue igual, avisa a Felipe.» (`siSigueIgual`). El código (`digest`) sigue a la vista: en Sentry se busca
  con `digest:<código>`.

## Lo que la prueba encontró (y por qué la limpieza es una lista blanca)

Verificado el 2026-10-15 con un Sentry de mentira en `localhost` que anotaba cada envío, provocando a propósito un error del servidor, uno del
navegador, uno antes de que Sentry cargara y un `capturarError`:

- **`sendDefaultPii: false` NO alcanza.** Un error del servidor llevaba **todos los encabezados, con la cookie de sesión de Supabase** (el token
  y el correo de la cuenta); las migas de la consola, el error crudo; y Next guardaba aparte la dirección con su búsqueda (`?q=Juana+Perez`).
- Por eso la limpieza (`limpiarEvento`, `limpiarMiga`) va por **lista blanca**: de la petición solo sale la pantalla (sin `?…`), el método y el
  navegador; de una miga, su dirección, método y estado. Un campo nuevo que el SDK agregue mañana no sale. Además se borran del mensaje los
  correos y los números largos (DNI, celular, RUC, tarjeta). Repetida la prueba: cero fugas en los cuatro casos.
- **Con Sentry caído** (el servidor de mentira apagado), las dos pantallas de error se muestran enteras —el gato, el título, «Reintentar»— y
  los envíos fallidos no rompen nada.

## Lo que pesa en el navegador

Medido con builds de producción del mismo commit, en lo que descarga TODA pantalla (`rootMainFiles`, comprimido):

| | KB |
|---|---|
| Antes de Sentry | 167,8 |
| Sentry importado de entrada | 225,4 (+57,6) |
| Sentry cargado después, entero | 170,3, más un pedazo aparte de 157,6 |
| **Sentry cargado después, solo lo que se usa (lo elegido)** | **170,3 (+2,5), más un pedazo aparte de 49,6** |

Los 57,6 KB eran casi todo código para medir tiempos (LCP, INP, «replay») que aquí no se usa y que Turbopack no descarta (las banderas
`__SENTRY_TRACING__` no tuvieron efecto). Por eso Sentry se descarga cuando la pantalla ya está lista (`requestIdleCallback`, a lo más 3 s), en
un pedazo aparte que queda guardado, y solo en producción. A Felipe se le había estimado «~25 KB» al elegir: la medida corrigió la cifra y el
diseño.

## Lo que se descartó

- **Registro propio en la base con aviso en el Inicio:** sin correo (si no se abre el ERP, nadie se entera), sin la línea del código en
  producción, una migración en producción y código propio para agrupar, limpiar y frenar una avalancha: reinventar Sentry peor.
- **Solo los logs de Vercel (o un drenaje):** duran poco y no avisan a nadie; es lo que había.
- **Importar Sentry de entrada:** +57,6 KB en cada pantalla, también en el celular del mostrador. **Cargarlo entero después:** 157,6 KB.
- **La versión 11 del SDK:** salió el 2026-09-23 y lleva ocho versiones en tres semanas. Se fijó **10.75.3** (la rama madura, con 3 semanas).
  El `withSentryConfig` ya se importa de `@sentry/nextjs/config`, la forma que sigue en la 11.
- **El script de instalación de `@sentry/cli`:** bloqueado en `pnpm-workspace.yaml`; su binario llega como dependencia opcional por plataforma.

## Se rompe si

- **Un error del navegador ocurre y la persona cierra la pestaña antes de que Sentry termine de cargar** (los primeros ~3 s): ese aviso se pierde.
  Lo del servidor no depende de eso.
- **Alguien arma un mensaje de error con el nombre de una persona** (`throw new Error(\`No se pudo cobrar a ${clienta.nombre}\`)`): la limpieza
  borra números y correos, no nombres sueltos. Regla: un error lleva ids, nunca nombres.
- **Felipe no pone `SENTRY_AUTH_TOKEN`:** los avisos llegan igual, pero con la línea del código comprimido (sin mapas).

## Para encenderlo (Felipe)

1. En `cayla.sentry.io`: **crear el proyecto** `cayla-retail` (plataforma Next.js) y copiar su **DSN**.
2. En Vercel, proyecto del ERP, entorno **Production**: `NEXT_PUBLIC_SENTRY_DSN` = el DSN, y `SENTRY_AUTH_TOKEN` = una llave de organización de
   Sentry (Settings ▸ Auth Tokens) para subir los mapas del código. La llave es secreta: va solo en Vercel.
3. Volver a publicar. En Sentry, la alerta por defecto («un problema nuevo de prioridad alta») ya manda el correo; se puede ajustar ahí.

Sin el paso 2, la web funciona igual que antes y la tarjeta sigue diciendo «avisa a Felipe».

## Dónde vive

`apps/web/lib/errores-reglas.ts` (+ prueba: qué se avisa, qué se borra, qué se dice), `lib/errores.ts` (`capturarError`, servidor; + prueba),
`lib/errores-navegador.ts` y `lib/errores-sentry-navegador.ts` (la carga diferida), `instrumentation.ts`, `instrumentation-client.ts`,
`components/ContextoDeErrores.tsx`, `next.config.ts` (`withSentryConfig` y `NEXT_PUBLIC_ENTORNO`), y las tres barreras: `app/(app)/error.tsx`,
`app/(app)/vender/comprobantes/error.tsx`, `app/global-error.tsx`.
