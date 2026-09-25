/*
 * Service worker de CAYLA Retail (ADR-0209, paso 3): abrir SIN INTERNET las pantallas que tienen cola sin conexión.
 *
 * Qué hace, y nada más:
 *   · `/_next/static/*`, `/_next/image` y las imágenes propias: primero la copia (llevan hash en el nombre: una versión nueva es otro
 *     archivo). Así una pantalla guardada tiene su JavaScript y su CSS sin red.
 *   · Abrir una de las PANTALLAS (navegación): primero la red; si responde, se guarda la copia. Sin red, se sirve la
 *     copia. Vender solo con la copia de HOY (hora de Lima, decisión de Felipe 2026-09-25).
 *   · Abrir cualquier otra pantalla sin red: la página «Sin conexión» (`/sin-conexion.html`), en vez del error del
 *     navegador.
 *   · Todo lo demás (la base, las RPC, Storage, las lecturas RSC): pasa directo. El SW nunca responde por la base: una
 *     escritura sin red la guarda la cola del módulo (`lib/cola-offline.ts`), no esto.
 *
 * La lista de pantallas repite `PANTALLAS_SIN_CONEXION` de `lib/sin-conexion-reglas.ts` (este archivo no puede
 * importarlo); `sin-conexion-reglas.test.ts` falla si se separan. Cambiar la lógica de este archivo = subir VERSION.
 */

const VERSION = "v1";
const CACHE_ESTATICOS = `cayla-estaticos-${VERSION}`;
const CACHE_PAGINAS = `cayla-paginas-${VERSION}`;
const PAGINA_SIN_CONEXION = "/sin-conexion.html";
const CABECERA_GUARDADO = "x-cayla-guardado";

// PANTALLAS_SIN_CONEXION — misma lista que lib/sin-conexion-reglas.ts
const PANTALLAS = [
  { ruta: "/vender", soloDeHoy: true },
  { ruta: "/recibir", soloDeHoy: false },
  { ruta: "/inventario/recibir", soloDeHoy: false },
  { ruta: "/productos/nuevo", soloDeHoy: false },
];

function pantallaDe(pathname) {
  const limpia = pathname.replace(/\/+$/, "") || "/";
  return PANTALLAS.find((p) => p.ruta === limpia) || null;
}

function diaLima(fecha) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((c) => c.add(new Request(PAGINA_SIN_CONEXION, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("cayla-") && k !== CACHE_ESTATICOS && k !== CACHE_PAGINAS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cerrar sesión o cambiar de persona: la app pide borrar las copias (tienen datos de la cuenta anterior).
self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "borrar-copias") {
    evento.waitUntil(
      caches.open(CACHE_PAGINAS).then(async (c) => {
        for (const req of await c.keys()) if (new URL(req.url).pathname !== PAGINA_SIN_CONEXION) await c.delete(req);
      }),
    );
  }
});

async function primeroLaCopia(peticion) {
  const cache = await caches.open(CACHE_ESTATICOS);
  const copia = await cache.match(peticion);
  if (copia) return copia;
  const respuesta = await fetch(peticion);
  if (respuesta.ok && respuesta.type === "basic") cache.put(peticion, respuesta.clone());
  return respuesta;
}

async function sinConexion() {
  const cache = await caches.open(CACHE_PAGINAS);
  return (await cache.match(PAGINA_SIN_CONEXION)) || new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function abrirPantalla(peticion, pantalla, url) {
  const cache = await caches.open(CACHE_PAGINAS);
  const clave = new Request(url.origin + pantalla.ruta);
  try {
    const respuesta = await fetch(peticion);
    // Solo se guarda la pantalla de verdad: no un redirect a /login (sesión vencida) ni un error.
    const tipo = respuesta.headers.get("content-type") || "";
    if (respuesta.ok && !respuesta.redirected && tipo.includes("text/html")) {
      const cuerpo = await respuesta.clone().arrayBuffer();
      const cabeceras = new Headers(respuesta.headers);
      cabeceras.set(CABECERA_GUARDADO, new Date().toISOString());
      await cache.put(clave, new Response(cuerpo, { status: 200, headers: cabeceras }));
    }
    return respuesta;
  } catch {
    const copia = await cache.match(clave);
    if (!copia) return sinConexion();
    if (pantalla.soloDeHoy) {
      const guardado = copia.headers.get(CABECERA_GUARDADO);
      if (!guardado || diaLima(new Date(guardado)) !== diaLima(new Date())) return sinConexion();
    }
    return copia;
  }
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // `/_next/image?url=…&w=…` también: la misma dirección da siempre la misma imagen (el logo de la cabecera, p. ej.).
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/_next/image" || /\.(?:png|svg|jpg|jpeg|webp|ico|woff2?)$/.test(url.pathname)) {
    evento.respondWith(primeroLaCopia(peticion));
    return;
  }

  if (peticion.mode === "navigate") {
    const pantalla = pantallaDe(url.pathname);
    if (pantalla) {
      evento.respondWith(abrirPantalla(peticion, pantalla, url));
      return;
    }
    evento.respondWith(fetch(peticion).catch(() => sinConexion()));
  }
  // Lo demás (RSC, API, Supabase) pasa directo. Una lectura RSC que falla sin red hace que Next pida la página
  // completa: esa sí la atiende este SW, con la copia o con «Sin conexión».
});
