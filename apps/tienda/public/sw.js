// El service worker de la tienda (ADR-0431; avisos push, ADR-0461). Hace dos cosas: que Chrome de Android la trate como una app instalable, y
// mostrar los avisos del celular cuando la persona lo activó (aunque la app esté cerrada). No guarda nada en caché y no toca ninguna
// petición: cada página, cada precio y cada stock siguen saliendo de la red, como siempre (la tienda muestra stock por tienda y cuentas
// con sesión: una copia vieja sería un error). Si algún día hace falta funcionar sin conexión, se decide aparte.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// Un aviso del servidor: el título y el texto son genéricos, y el enlace es una ruta de la tienda. Lo que no cuadra cae a valores seguros.
self.addEventListener("push", (e) => {
  let datos = {};
  try {
    datos = e.data ? e.data.json() : {};
  } catch {
    datos = {};
  }
  const titulo = typeof datos.titulo === "string" && datos.titulo ? datos.titulo : "CAYLA · Tu tienda";
  const texto = typeof datos.texto === "string" && datos.texto ? datos.texto : "Tienes una novedad.";
  const enlace = typeof datos.enlace === "string" && datos.enlace.startsWith("/") && !datos.enlace.startsWith("//") ? datos.enlace : "/notificaciones";
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: texto,
      icon: "/cayla-app-192.png",
      badge: "/cayla-app-192.png",
      data: { enlace },
    }),
  );
});

// Al tocar el aviso: si la tienda ya está abierta se enfoca esa pestaña y se lleva a la pantalla; si no, se abre una nueva.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const enlace = (e.notification.data && e.notification.data.enlace) || "/notificaciones";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const destino = new URL(enlace, self.location.origin).href;
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          return ventana.navigate ? ventana.navigate(destino).then(() => ventana.focus()) : ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
