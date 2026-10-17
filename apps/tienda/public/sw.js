// El service worker de la tienda (ADR-0431) existe SOLO para que Chrome de Android la trate como una app instalable. No guarda nada en
// caché y no toca ninguna petición: cada página, cada precio y cada stock siguen saliendo de la red, como siempre (la tienda muestra
// stock por tienda y cuentas con sesión: una copia vieja sería un error). Si algún día hace falta funcionar sin conexión, se decide aparte.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
