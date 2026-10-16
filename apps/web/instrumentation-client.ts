import { AVISA_SOLO, sentryDelNavegador } from "@/lib/errores-navegador";

// Sentry en el NAVEGADOR (ADR-0424): atrapa lo que revienta en la pantalla misma (un botón que falla, una promesa que nadie
// esperaba) y lo que no atrapa ninguna barrera. Lo que reventó en el servidor lo avisa `instrumentation.ts`.
//
// Sentry se descarga cuando la pantalla ya está lista (`requestIdleCallback`, a lo más 3 s después), no antes: así no le suma peso
// ni demora a ninguna pantalla (ver `errores-navegador.ts`). Lo que se rompa mientras tanto se anota aquí y se manda apenas llega.
// Fuera de producción, o sin `NEXT_PUBLIC_SENTRY_DSN`, no hace nada.
if (AVISA_SOLO) {
  const pendientes: unknown[] = [];
  const anotarError = (e: ErrorEvent) => pendientes.push(e.error ?? e.message);
  const anotarRechazo = (e: PromiseRejectionEvent) => pendientes.push(e.reason);
  addEventListener("error", anotarError);
  addEventListener("unhandledrejection", anotarRechazo);

  const cargar = () =>
    void sentryDelNavegador().then((Sentry) => {
      // Desde aquí escucha Sentry (lo engancha `init`).
      removeEventListener("error", anotarError);
      removeEventListener("unhandledrejection", anotarRechazo);
      for (const error of pendientes.splice(0)) Sentry?.captureException(error);
    });
  if (typeof requestIdleCallback === "function") requestIdleCallback(cargar, { timeout: 3000 });
  else setTimeout(cargar, 1500);
}

// Next llama a este gancho al empezar cada navegación, para que Sentry mida cuánto tarda. Aquí no se miden tiempos, así que no hace
// nada; existe para que el armado no avise «ACTION REQUIRED» a quien lo lea después.
export function onRouterTransitionStart() {}
