# ADR-0654 · El cronómetro del clic: cuánto tarda en llegar cada pantalla, por sede

- **Fecha:** 2026-11-13 · **Estado:** aceptado (Felipe aceptó `cambiar-de-modulo#6` el 2026-11-13; este ADR es su **paso 1**). Sin
  migraciones ni base: entra al fusionar y publicar la web.
- **Pedido:** la corrida de `/innovar` sobre «cambiar de módulo tarda en cargar» (`docs/innovacion/2026-11-13-cambiar-de-modulo.md`, #6).
- **Relacionados:** ADR-0628 (entrar al módulo al instante: el esqueleto del marco y su tope de 15 s), ADR-0623 (el esqueleto de cada
  `loading.tsx`), ADR-0149 (el loader único), ADR-0424 (qué datos pueden salir del navegador), ADR-0447 (la tienda mide a sus clientes:
  mismo camino, al registro de Vercel), ADR-0013 (`staleTimes`).

## El problema

Una vendedora dice «el sistema está lento» un sábado a las 7 p. m. en AQP y nadie puede saber si es Existencias, el wifi de la tienda o la
base. Las cifras de ADR-0628 (0,8 s Historial, 1,4 s Caja, 3 s Existencias) se tomaron a mano, una vez; `pg_stat_statements` dice cuánto
tarda cada consulta, no cuánto espera la persona frente a la pantalla (que suma el viaje desde Perú, el armado en Vercel y lo que dibuja el
navegador). Sin ese número por módulo y por sede, lo próximo que se arregle (#3, #4, #7 del informe) se elige a ojo, y no hay forma de ver
si mejoró.

## La decisión

1. **Empieza** cuando Next empieza la navegación: `onRouterTransitionStart` en `apps/web/instrumentation-client.ts`, con
   `experimental.instrumentationClientRouterTransitionEvents` encendido en `next.config.ts` (Next 16.3+; en la 16.4.6 instalada entrega
   `{ id, timestamp, fromRoutes, prefetchIntent }`, visto en `next/dist/client/components/router-transition.js`). Se usa `timestamp`.
2. **Solo se mide cambiar de pantalla** (`destinoDeLaNavegacion`): otra ruta de la app, en esta pestaña. No se miden «atrás» y «adelante»
   (dibujan la copia guardada, siempre al instante: bajarían el p75 sin decir nada), ni la misma pantalla con otro `?…` (un filtro, una
   búsqueda que se escribe, el mes), ni fuera del marco del ERP (el login, el club).
3. **Termina** en el primer cuadro (`requestAnimationFrame`) en que la dirección ya es otra, no hay ningún esqueleto de pantalla en la página
   (`[data-esqueleto-pantalla]`: el del marco de ADR-0628 y el de cada `loading.tsx`, los dos son `EsqueletoPantalla`) y el marco ya anotó la
   ruta nueva (`pasoDelCronometro`, puro). Una pantalla que llega sin esqueleto (la copia del router, una hoja interceptada) se mide igual y
   lo dice: `sin_esqueleto: true`. Pasados **15 s** (el tope de ADR-0628) se descarta: no es una pantalla lenta, es una que no llegó. Si la
   pestaña se oculta a mitad de camino, también se descarta (el navegador deja de dibujar y ese tiempo no es de la pantalla). Una navegación
   nueva reemplaza a la que no llegó.
4. **El patrón de la ruta**, nunca la dirección: `CronometroDelClic` (montado una vez en `app/(app)/layout.tsx`) anota la ruta y
   `useParams()`, y `patronDeRuta` cambia cada parámetro por su nombre (`/compras/factura/[compraId]`); si queda un uuid o un número suelto,
   lo tapa como `[id]`. Los «atrapa todo» no se traducen: en el ERP solo existen en las ranuras `@modal/[...catchAll]` y `useParams()` los
   mezcla con los de la pantalla (visto en local: Proveedores salía como `/compras/[...catchAll]`).
5. **Viaja en lote**, cada 30 s si hay algo y siempre al ocultar o cerrar la pestaña, con `navigator.sendBeacon` (no pasa por el `fetch`
   que vigila el loader, ADR-0149; visto en local: el `fetch` vigilado nunca se llamó); si el navegador no lo acepta, un `fetch` con
   `keepalive` y `x-espera: no`. Hasta 50 por envío y como mucho 200 esperando; lo que no llega se pierde en silencio, nunca se reintenta
   (principio 9: medir no puede costarle nada a la pantalla).
6. **`POST /api/tiempos`** (`app/api/tiempos/route.ts`), con sesión (el proxy da 401 sin ella; no está en `rutas-publicas.ts`): valida cada
   medición campo por campo (`leerLote`: patrón de ruta, ms enteros de 0 a 15 000, sede como uuid o `global`, versión corta; 16 KB como
   mucho) y escribe **una línea por medición** en el registro, como `finanzas_resumen_ms`:
   `{"evento":"tiempo_de_pantalla","ruta":"/caja","ms":1015,"sede_id":"…","sin_esqueleto":false,"version":"98b9137f3a1c"}`. No toca la
   base ni pregunta quién es la persona (serían las 6 RPC de identidad, justo lo que se quiere medir). Responde 204 siempre.
7. **Qué lleva y qué no (ADR-0424):** el patrón de la ruta, los ms, el id de la sede activa (`global` en CAYLA Global) y la versión del ERP
   que lo midió (los 12 primeros caracteres del commit: así se separa el antes y el después de una publicación aunque una pestaña vieja
   siga abierta). Nunca nombres, la cuenta, la sesión, una búsqueda ni la dirección con su `?…`.

```
DECIDÍ:     medición propia con el gancho de Next, cerrada por el esqueleto de ADR-0628/0623, escrita en el registro de Vercel.
DESCARTÉ:   solo Speed Insights (ver el informe): mide LCP de la carga, no «hasta que llegó el módulo», y su desglose por ruta es de pago.
DESCARTÉ:   tomar el patrón de `fromRoutes` de la navegación siguiente (Next solo da el patrón de DONDE SE SALE): la última pantalla de cada
            pestaña quedaría sin patrón, y la medición dependería de un clic que puede no llegar.
DESCARTÉ:   una lista de patrones escrita a mano contra la carpeta `app/`: otro registro que mantener; `useParams()` ya lo sabe.
DESCARTÉ:   que el esqueleto avise al montarse y desmontarse (un `useEffect` en `EsqueletoPantalla`): volvería cliente una pieza sin
            estado; la marca `data-esqueleto-pantalla` ya existe y mirarla un cuadro a la vez por 15 s como mucho no cuesta nada.
DESCARTÉ:   leer la sede de la cookie en el servidor: es `httpOnly`, falta cuando se usa la sede de la persona, y el lote se manda hasta
            30 s después (la sede pudo cambiar). El marco ya la sabe al dibujarse.
DESCARTÉ:   guardarlo en la base ya (el paso 2 de la propuesta: tabla por hora y lente «p75 por módulo y sede» en el Observatorio): espera
            el OK de Felipe con datos de una semana en la mano.
SE ROMPE SI: un `loading.tsx` nuevo no dibuja `EsperaPantalla`/`EsqueletoPantalla`: sus pantallas se medirían hasta que llega el
            esqueleto, no el contenido (sin `data-esqueleto-pantalla` el cronómetro no lo reconoce).
SE ROMPE SI: una pantalla nueva usa su propio «atrapa todo» (`[...x]`): sus partes saldrían tal cual (solo se tapan uuids y números).
            Hoy no hay ninguna; sus parámetros son `id`, `compraId` y `numero`, y `patronDeRuta` los traduce.
SE ROMPE SI: nadie lee el registro: Vercel Pro guarda 1 día (ADR-0447). No rompe nada más.
```

## Cómo se lee (p75 por módulo y sede)

Con la CLI de Vercel 64 o más nueva (`npm i -g vercel@latest`, `vercel login`), una vez al día (el registro guarda 24 h):

```bash
vercel logs --scope cayla --project cayla-retail --environment production --query tiempo_de_pantalla --since 24h --limit 10000 --json > tiempos-$(date +%F).jsonl
```

```bash
jq -rs '[.[] | select(.type == "log") | .data.message | strings | try (capture("(?<j>\\{.*\\})").j | fromjson) catch empty | select(.evento == "tiempo_de_pantalla")] | group_by([.ruta, .sede_id]) | map({ruta: .[0].ruta, sede: .[0].sede_id, n: length, p75: (map(.ms) | sort | .[((length * 0.75) | ceil) - 1])}) | sort_by(-.p75)[] | "\(.p75) ms\t\(.n)\t\(.ruta)\t\(.sede)"' tiempos-*.jsonl
```

Da una fila por módulo y sede, la más lenta arriba: el p75 (el tiempo que 3 de cada 4 entradas no pasan), cuántas entradas hubo, el patrón
y el id de la sede. Los nombres de las sedes: `select id, nombre from retail.ubicaciones;` (solo lectura). Con varios días guardados, el
`tiempos-*.jsonl` los junta. En el panel: Vercel ▸ cayla-retail ▸ Logs, buscar `tiempo_de_pantalla` (Observability Plus guarda 30 días).

## Cifras

- **Peticiones:** como mucho una cada 30 s por pestaña que navegó, más una al ocultarla; ~0,2 KB por medición. Diez pestañas toda la
  jornada no llegan a 100 000 invocaciones al mes (el plan Pro trae un millón). El registro: una línea de ~180 bytes por entrada a un módulo.
- **Peso en el navegador:** dos archivos de reglas y un componente sin dibujo; nada se carga aparte.

## Qué se verificó y qué no

- **Verificado:** `lib/tiempos-de-pantalla-reglas.test.ts` (24 casos: qué se mide, cuándo llega, el tope, el patrón con parámetros, con
  «atrapa todo» y sin parámetros, el lote y su lectura, la línea). Suite de la web (898 archivos), `tsc`, ESLint, Knip y Knip de producción
  en verde. En local (`next dev`, navegador del app, cuenta de prueba): Inicio → Caja → Productos → Proveedores → Historial de compras → la
  factura de una compra (hoja interceptada) → Historial de ventas → Caja → Historial. Salieron las líneas `tiempo_de_pantalla` con
  `/caja`, `/productos`, `/compras`, `/compras/factura/[compraId]` (esta `sin_esqueleto: true`: la hoja de la factura no muestra nada
  durante ~1 s) y `/vender/historial`, de 1 a 2,6 s (en `next dev`, que compila al entrar); los envíos salieron por `sendBeacon` y
  `POST /api/tiempos → 204`, sin pasar por el `fetch` del loader. La receta de `jq` se probó contra un archivo con la forma de
  `vercel logs --json` (CLI 64, ADR-0447).
- **NO verificado:** con datos de producción (no hay hasta publicar), ni la receta contra un `vercel logs` real del ERP. **Cómo lo
  verificas:** tras publicar, entra a tres módulos del ERP en producción, espera 30 s y corre las dos líneas de arriba: tienen que salir.
