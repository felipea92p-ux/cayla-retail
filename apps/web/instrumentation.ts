import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { entornoDeSentry, opcionesDeSentry } from "@/lib/errores-reglas";

// Sentry en el SERVIDOR y en el edge (ADR-0424). Next llama a `register` una vez al arrancar cada uno, y a `onRequestError` cada vez
// que una pantalla, una acción o una API revienta en el servidor: es el único lugar que ve el mensaje real (al navegador solo le
// llega el `digest`). El `digest` va como etiqueta: es el «Código» que la persona ve en la tarjeta, y con él Felipe encuentra ESTE
// error en Sentry (`digest:3460033225`).
export function register() {
  Sentry.init(opcionesDeSentry(entornoDeSentry()));
}

export const onRequestError: Instrumentation.onRequestError = (error, request, contexto) => {
  Sentry.withScope((scope) => {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string") scope.setTag("digest", digest);
    Sentry.captureRequestError(error, request, contexto);
  });
};
