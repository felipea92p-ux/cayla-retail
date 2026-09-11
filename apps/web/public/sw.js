/**
 * SERVICE WORKER DE CAYLA — existe por UNA pantalla: el conteo.
 *
 * POR QUÉ EXISTE
 *   Todas las pantallas de este sistema son Server Components: el HTML lo arma Vercel en
 *   cada carga. Con el wifi caído no llega ni el HTML, así que **ningún JavaScript nuestro
 *   llega a correr** — y da exactamente igual lo que haya guardado en el navegador. Ése es
 *   el agujero que ADR-0018 no vio: diseñó "el dato está local" y el problema era "la
 *   pantalla no abre". Ver ADR-0034.
 *
 *   Y abre justo cuando más duele: el censo pone a cuatro personas escaneando durante días
 *   con la red de la tienda. `ConteoPanel` ya aguanta la red floja mientras la pestaña siga
 *   viva (la página carga todo de una vez y el panel no vuelve al servidor por cada
 *   escaneo). Lo que lo mata es recargar, que el equipo se duerma, o cerrar la pestaña.
 *
 * QUÉ CACHEA, Y QUÉ NO — la lista corta es a propósito
 *   · `/_next/static/*`  → cache-first. Llevan hash en el nombre, así que son inmutables:
 *                          si el nombre coincide, el contenido coincide. No pueden quedar
 *                          viejos por definición.
 *   · el DOCUMENTO de `/inventario/conteo` → network-first con respaldo en caché.
 *   · TODO LO DEMÁS      → pasa de largo, sin tocar. Ni una API, ni Supabase, ni las otras
 *                          17 pantallas.
 *
 *   Es deliberado que el resto no funcione sin red. Una app que finge estar entera offline
 *   es peor que una que dice dónde está el límite: la Encargada descubre el borde a mitad
 *   de una venta en vez de saberlo de antemano.
 *
 * EL RIESGO QUE ESTE DISEÑO EVITA
 *   El desastre clásico del service worker es servir una versión vieja de la app a toda la
 *   tienda sin que nadie entienda por qué. Acá no puede pasar: el documento va SIEMPRE a la
 *   red primero. La caché solo aparece cuando la red ya falló. Un despliegue nuevo se toma
 *   en la primera carga con internet, como si este archivo no existiera.
 *
 * EL RIESGO QUE SÍ QUEDA, y por eso está la línea del logout
 *   El documento cacheado trae el catálogo y la sede de QUIEN lo cargó. En un equipo
 *   compartido, sin la limpieza al salir, la siguiente persona podría ver sin red la
 *   pantalla de la anterior. `LogoutButton` le manda `limpiar` a este worker antes de
 *   navegar. Si ese mensaje se pierde, la caché sobrevive: por eso el `activate` también
 *   borra todo lo que no sea de la versión viva.
 *
 * CÓMO SE DESACTIVA ENTERO: borrar este archivo y `RegistroServiceWorker.tsx`. Los
 * navegadores que ya lo tengan instalado lo sueltan solos cuando el archivo devuelve 404.
 */

// Subir esta versión invalida TODAS las cachés en el próximo `activate`.
const VERSION = "v1";
const CACHE_ESTATICO = `cayla-estatico-${VERSION}`;
const CACHE_PANTALLA = `cayla-pantalla-${VERSION}`;

/** La única ruta cuyo documento se guarda. Si un día son dos, esto es una lista. */
const RUTA_CONTEO = "/inventario/conteo";

/**
 * La marca que le dice a la pantalla "lo que estás viendo salió de la caché".
 *
 * POR QUÉ NO ALCANZA `navigator.onLine`: dice si hay una interfaz de red levantada, no si el
 * servidor contesta. El caso más común en tienda —wifi conectado a un router sin salida—
 * devuelve `true`, y la pantalla mostraría datos viejos sin avisar. Comprobado en la prueba:
 * con el servidor apagado y el wifi vivo, `onLine` seguía en `true`.
 *
 * El worker es el único que SABE de dónde salió la respuesta, así que lo deja escrito. Es una
 * entrada más de la caché, no una variable del worker: el navegador apaga y revive el worker
 * cuando quiere, y una variable no sobrevive a eso.
 *
 * Las dos ramas hacen `await` antes de responder — sin eso la marca podría escribirse después
 * de que la pantalla ya la leyó, y el aviso saldría una carga tarde.
 */
const MARCA_CACHE = "/__cayla/servido-desde-cache";

self.addEventListener("install", () => {
  // Nada que precargar: lo que se cachea se cachea a medida que se usa con internet. Un
  // precache adivinaría los nombres con hash de los chunks, que cambian en cada build.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((n) => n.startsWith("cayla-") && n !== CACHE_ESTATICO && n !== CACHE_PANTALLA)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** `LogoutButton` manda esto antes de irse. Ver la cabecera. */
self.addEventListener("message", (event) => {
  if (event.data !== "cayla:limpiar") return;
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith("cayla-")).map((n) => caches.delete(n)));
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  // Nada de otro origen: Supabase, fuentes, lo que sea. No es asunto nuestro.
  if (url.origin !== self.location.origin) return;

  // ── Estáticos con hash: cache-first ─────────────────────────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const guardado = await caches.match(req);
        if (guardado) return guardado;
        const res = await fetch(req);
        // Solo se guarda una respuesta buena y completa. Una 206 o una opaca guardada acá
        // se sirve rota después, sin red y sin forma de notarlo.
        if (res.ok && res.status === 200) {
          const cache = await caches.open(CACHE_ESTATICO);
          void cache.put(req, res.clone());
        }
        return res;
      })()
    );
    return;
  }

  // ── El documento del conteo: network-first ──────────────────────────────────
  // `mode === "navigate"` es una carga de página de verdad (recarga, abrir la URL, volver
  // con el historial). La navegación interna de Next pide un payload RSC, que NO se cachea
  // a propósito: su respuesta depende de cabeceras de estado del router y una caché mal
  // emparejada ahí produce pantallas a medias. Sin red igual no se puede llegar desde otra
  // pantalla — porque esa otra pantalla tampoco carga.
  if (req.mode === "navigate" && url.pathname === RUTA_CONTEO) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_PANTALLA);
        try {
          const res = await fetch(req);
          if (res.ok) {
            await cache.put(RUTA_CONTEO, res.clone());
            await cache.delete(MARCA_CACHE);
          }
          return res;
        } catch (err) {
          const guardado = await cache.match(RUTA_CONTEO);
          if (!guardado) throw err; // Nunca se cargó con internet: que el navegador diga la verdad.
          await cache.put(MARCA_CACHE, new Response("1"));
          return guardado;
        }
      })()
    );
  }

  // Cualquier otra cosa: sin `respondWith`, o sea que el navegador hace lo de siempre.
});
