# ADR-0422 · Aviso «hay una versión nueva de CAYLA»

- **Fecha:** 2026-10-15 · **Estado:** propuesto, esperando el OK de Felipe. Verificado en local (rama `claude/stale-version-notification-7f9461`).
  Solo web: sin migración, sin RPC, sin reglas de negocio.
- **Pedido (Felipe):** «a veces hacemos PR y las colaboradoras de tienda no saben que hay algo nuevo; siguen operando con una versión antigua.
  ¿Se puede mostrar un aviso de que tienen una versión antigua y que hace falta reiniciar?»
- **Se apoya en:** ADR-0210 (el aviso de «Sin conexión», que vive en el mismo lugar), ADR-0411 (otro componente global montado una vez en el
  layout, que pregunta a la red sin abrir el loader).

## El problema

Cada fusión a `main` publica una versión nueva. Un equipo que tiene CAYLA abierto desde antes —Vender, sobre todo, que no cambia de
pantalla en todo el día— sigue con el JavaScript con el que cargó, y **antes no había nada que se lo dijera**.

## Lo que se midió (no se supuso)

- **Publicaciones a producción** (`list_deployments`, `target=production`): 12 el 13-oct (desde las 16:37), **39 el 14-oct**, 9 hasta las
  12:00 del 15-oct; en horas de tienda, unas **6 por hora** (5 entre las 10:51 y las 11:38 del 15-oct). Esa cifra es la que manda en el diseño:
  una franja que sale con cada una saldrá seguido, y por eso es discreta y se puede dejar para después.
- **La protección de versiones de Vercel está activa, 12 h** (`skewProtectionMaxAge: 43200`). Next marca sus archivos con `?dpl=<id>` (visto
  en el HTML de `retail.cayla.pe/login`) y, con la protección, Vercel atiende esos pedidos en la versión de la pestaña. Es lo correcto para
  que nada se rompa a medias, pero **explica el silencio**: una pestaña vieja no falla ni se entera. (Next sí hace una carga completa cuando
  el servidor responde con otra versión, `fetch-server-response.js`, pero con la protección esa respuesta es la de la versión vieja.)
- **No hay cookie `__vdpl`** en la respuesta de `/login` (cabeceras leídas con `curl`): un `fetch` propio, sin `?dpl=` ni `x-deployment-id`,
  llega a la versión de AHORA aunque la pestaña esté pinchada a una vieja. De ahí sale cómo preguntar.
- **Proxy:** `proxy.ts` verifica el JWT en local (`getClaims`, sin viaje a la base) y a `/api/*` sin sesión le responde 401 JSON.

## La decisión

1. **Cada compilación graba su versión.** `next.config.ts` → `env.NEXT_PUBLIC_BUILD_ID` = `VERCEL_GIT_COMMIT_SHA` (o `VERCEL_DEPLOYMENT_ID`;
   fuera de Vercel, `"desarrollo"`). Queda dentro del JavaScript de cada pestaña y dentro de la ruta del servidor.
2. **`GET /api/version`** (`app/api/version/route.ts`) → `{ "id": "<versión>" }`, `force-dynamic`, `Cache-Control: no-store`. Con sesión, como
   cualquier API (no se agrega a `rutas-publicas.ts`).
3. **`<VersionNueva />`** (`components/VersionNueva.tsx`), montada UNA vez en `app/(app)/layout.tsx`, junto a `<SinConexion />`. Con la pestaña
   a la vista pregunta al cargar, cada 5 min y al volver a la pestaña o a la red (no más de una vez por minuto). Si la versión de producción
   es otra, muestra un `<Aviso chico tono="info">`: «Hay una versión nueva de CAYLA. Termina lo que estás haciendo y actualiza.» con
   **Actualizar** (recarga) y **Más tarde** (calla 30 min; si la pestaña sigue vieja, vuelve). A 375 px los botones bajan debajo del texto, de 44 px.
4. **La lógica es pura y con prueba** (`lib/version-nueva-reglas.ts`): qué se cree de una respuesta (`leerVersion`: solo un id con la forma
   esperada; una página de login, un error o un cuerpo raro no son una versión), cuándo hay versión nueva (`hayVersionNueva`: «otra», no «más
   nueva», para que un rollback también avise; sin dato de un lado, nunca) y cuándo toca preguntar (`tocaPreguntar`).

```
DECIDÍ:     que cada pestaña pregunte a /api/version cada 5 min y ofrezca «Actualizar»; nunca recargar sola.
DESCARTÉ:   recargar sola al detectarla, porque en Vender el ticket que se está armando vive solo en la pantalla (el navegador guarda las
            ventas por subir y los tickets «en espera», no el que está en curso) y recargar bajo quien cobra lo perdería.
DESCARTÉ:   confiar en el salto automático de Next, porque la protección de versiones lo calla 12 h y, cuando llega, llega sin aviso y en un
            momento que la persona no eligió.
DESCARTÉ:   una ruta pública (sin sesión), porque abre una puerta más a internet (`rutas-publicas.ts` es estrecha a propósito) y no hace
            falta: el `fetch` sin `?dpl=` ya llega a la versión de ahora.
DESCARTÉ:   guardar una «versión mínima» en la base, porque ata el aviso a la base (si cae, tampoco avisa) y exige que alguien suba un
            número en cada PR; lo que depende de acordarse se olvida.
SE ROMPE SI: Vercel atiende `/api/version` con la versión vieja de la pestaña (si algún día se activa `useSkewCookie` o se pone una cookie de
            versión): la franja nunca sale aunque haya pasado una publicación. La prueba vigila que el `fetch` no mande `dpl` ni
            `x-deployment-id`; el síntoma es «publicamos y a los 10 minutos nadie ve la franja».
SE ROMPE SI: una pestaña pasa más de 12 h dormida: la protección ya no puede pincharla a su versión y el desajuste existe antes de que
            pregunte. Al despertar pregunta enseguida, pero eso no deshace el desajuste.
SE ROMPE SI: se publican 6 versiones por hora y la franja se vuelve ruido: las colaboradoras aprenden a ignorarla, o recargan sin terminar
            su ticket. Es un límite de la cadencia de publicación, no del aviso (ver «Opciones»).
```

## Cifras

30 pestañas × 12 preguntas por hora × 10 h ≈ 3 600 pedidos al día de unos 40 bytes, sin tocar la base. El loader de pantalla completa no se abre:
un GET a `/api/*` que no es de Next no es una espera (`clasificarPeticion`, con prueba).

## Qué se verificó y qué no

- **Verificado:** 504 archivos de prueba y 159 742 pruebas en verde (incluidas las del tema, las guías y `unificar`); `tsc`, ESLint y Knip
  limpios; la ruta real con sesión responde `{ "id": … }` con `no-store` y sin sesión 401; en el navegador, con una pantalla de prueba y con el
  Punto de Venta real (cuenta de prueba local): no sale con versiones iguales, sale al cambiar la de producción, «Más tarde» la calla y vuelve
  (reloj acelerado), «Actualizar» recarga, a 375 px y en oscuro (contraste del título 6,76:1), sin scroll horizontal.
- **NO verificado:** cómo se comporta en Vercel con la protección de versiones activa. Solo se puede ver con dos publicaciones seguidas.
  **Cómo lo verificas:** tras publicar este PR, abre CAYLA en una pestaña (versión A); cuando se publique el siguiente PR (versión B), en menos
  de 5 min —o al cambiar de pestaña y volver— sale la franja. **La primera publicación no avisa a nadie:** las pestañas abiertas antes no
  traen este código y hay que recargarlas una vez a mano.

## Opciones que quedan para Felipe (no se construyeron)

- **«Importante»**: que una publicación pueda marcarse como obligatoria y la franja suba de tono (ámbar) o no deje el «Más tarde».
  Ganas: el aviso de lo crítico no se diluye entre 6 por hora. Pagas: alguien tiene que marcarlo (se olvida) y es una regla de qué es importante.
- **Subir de tono con la edad**: pasadas ~10 h con versión vieja (cerca del tope de 12 h de la protección), la franja se vuelve ámbar. Sin
  marca manual; se apoya en un límite real.
- **Recarga en reposo**: sin teclas ni hojas abiertas por N minutos y sin ticket en curso, recargar sola. Quita la tarea a la colaboradora, pero
  es recargar sin que lo pida: se decide con Felipe pantalla por pantalla.
- **Publicar en lotes**: el multiplicador es la cadencia (39 al día), no el aviso.

## Actualización 2026-10-28 · la píldora flotante (Felipe eligió la B de `docs/maquetas/version-nueva-2026-10/`)

- **Qué fallaba:** la franja iba DENTRO de la página, encima del contenido. En Finanzas (Impuestos, Gastos…) la barra fija `.mesa-telar`
  —opaca y con margen negativo para nacer bajo la cabecera— la tapaba a medias, y en cualquier pantalla empujaba el contenido hacia abajo.
- **Qué es ahora:** `<VersionNueva />` dibuja una píldora oscura `position: fixed` (`.version-nueva`, `app/estilos/avisos.css`): punto,
  «Hay una versión nueva · actualiza cuando termines», «Actualizar» (el `btn-cayla btn-secundario`, invertido sobre la tinta) y una ✕
  («Más tarde», calla 30 min). Desde 1024 px se centra sobre el contenido, en la banda de la cabecera (su centro está libre); más abajo,
  justo bajo la cabecera. Ya no usa `<Aviso>`: no empuja ni la tapa nada.
- **La gota (Felipe, mirando `docs/maquetas/version-nueva-2026-10/gota.html`):** entra como una gota que cae suave, rebota una sola vez y se riega como
  líquido hasta ser la píldora (~2,2 s), y al pulsar la ✕ se recoge y se va como gota (1,45 s). Una vez, sin bucle; con «reducir movimiento» aparece y se va
  ya hecha. Es la excepción de ADR-0136 act. 2026-10-28.
- **Lo que no cambia:** la lógica (`version-nueva-reglas.ts`), la pregunta a `/api/version`, que nunca recarga sola y los 30 min de «Más tarde».
- **Se rompe si:** bajo 1024 px la píldora queda sobre las pestañas de Finanzas mientras esté abierta (se quita con la ✕); si el centro de la
  cabecera deja de estar libre (un buscador más ancho, un botón nuevo), a 1024–1100 px chocaría: mover el `lg:` o centrarla bajo la cabecera.
