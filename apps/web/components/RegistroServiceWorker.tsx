"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js`, y se monta SOLO en la pantalla de conteo.
 *
 * Podría vivir en el layout y registrarse una vez para toda la app. No lo hace por una
 * razón de alcance: el worker existe hoy para una pantalla (ADR-0034), y registrarlo desde
 * el layout haría que un equipo que nunca abre el conteo igual arrastre un service worker.
 * Cuantos menos navegadores tengan uno instalado, menos superficie hay para el fallo clásico
 * —servir una versión vieja— el día que este archivo tenga un bug.
 *
 * El `scope` va explícito en `/`, no en `/inventario/conteo/`: el worker necesita ver los
 * pedidos de `/_next/static/*`, que cuelgan de la raíz. Un service worker solo puede
 * interceptar dentro de su scope, y el archivo se sirve desde la raíz, así que pedir `/`
 * está permitido.
 *
 * No hace nada si el navegador no lo soporta, y no rompe la pantalla si el registro falla:
 * sin worker el conteo funciona igual, solo que necesita internet para abrir.
 */
export function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Un registro fallido no es un error que la Encargada pueda hacer nada por resolver.
      // Se degrada a la app de siempre, que es exactamente el comportamiento de ayer.
    });
  }, []);

  return null;
}
