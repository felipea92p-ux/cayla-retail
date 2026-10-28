import * as Sentry from "@sentry/nextjs";

/**
 * Errores que no pueden perderse (principio 9: «todo puede fallar… nunca pierde datos»), y el aviso a Felipe (ADR-0424).
 *
 * EL PROBLEMA. En Facturación había dos maneras de perder un error. La primera: un `catch` que
 * reemplaza la causa real por un texto genérico (una falla de DNS contra Lucode se leía «no respondió a
 * tiempo»). La segunda, peor: Lucode o SUNAT ya tienen el documento pero la base no lo guardó, y el único
 * aviso era el mensaje en la pantalla de quien vendía. Si la colaboradora lo cerraba, no quedaba rastro.
 *
 * LO QUE HACE `capturarError`. Escribe UNA línea JSON en los logs del servidor (Vercel), que se busca con
 * `vercel logs --query lucode`, y desde el 2026-10-15 manda el mismo error a Sentry, que guarda el historial y le escribe a
 * Felipe (era «el paso siguiente» que este comentario anunciaba: los logs de Vercel duran poco y no avisan a nadie). Los de un
 * mismo `donde` se agrupan en un solo aviso. No cambia la respuesta a la pantalla ni reintenta.
 *
 * `contexto` lleva identificadores (id, serie-número, estado): NUNCA el DNI, el RUC ni el nombre de la clienta. Viaja a Sentry tal
 * cual; el mensaje del error, en cambio, pasa por la limpieza de `errores-reglas.ts` (puede traer lo que respondió Lucode).
 *
 * Es del SERVIDOR: importa Sentry de entrada. Lo del navegador (las barreras de error) está en `errores-navegador.ts`, que lo carga
 * después, para no sumarle peso a cada pantalla.
 */

type ErrorSuelto = { message?: unknown; code?: unknown; name?: unknown; cause?: unknown };

export function capturarError(donde: string, error: unknown, contexto: Record<string, unknown> = {}): void {
  const descripcion = describir(error);
  // `donde` y la descripción van después de `contexto` para que el contexto no los pise.
  console.error(JSON.stringify({ nivel: "error", ...contexto, donde, ...descripcion }));
  Sentry.captureException(error instanceof Error ? error : new Error(descripcion.mensaje), {
    fingerprint: ["capturarError", donde],
    tags: { donde },
    contexts: { detalle: { ...contexto, codigo: descripcion.codigo, causa: descripcion.causa } },
  });
}

// Sirve igual para un `Error` lanzado que para el error que devuelve supabase-js ({ message, code }).
// `cause` es donde `fetch` guarda el motivo real («fetch failed» → ENOTFOUND, ECONNREFUSED…).
function describir(error: unknown) {
  if (typeof error !== "object" || error === null) return { mensaje: String(error) };
  const e = error as ErrorSuelto;
  const causa = e.cause as ErrorSuelto | undefined;
  return {
    mensaje: String(e.message ?? "sin mensaje"),
    codigo: e.code ?? undefined,
    tipo: e.name ?? undefined,
    causa: causa ? String(causa.code ?? causa.message ?? causa) : undefined,
  };
}
