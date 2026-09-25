/**
 * Errores del servidor que no pueden perderse (principio 9: «todo puede fallar… nunca pierde datos»).
 *
 * EL PROBLEMA. En Facturación había dos maneras de perder un error. La primera: un `catch` que
 * reemplaza la causa real por un texto genérico (una falla de DNS contra Lucode se leía «no respondió a
 * tiempo»). La segunda, peor: Lucode o SUNAT ya tienen el documento pero la base no lo guardó, y el único
 * aviso era el mensaje en la pantalla de quien vendía. Si la colaboradora lo cerraba, no quedaba rastro.
 *
 * LO QUE HACE. Escribe UNA línea JSON en los logs del servidor (Vercel), que se busca con
 * `vercel logs --query lucode`. Nada más: no cambia la respuesta a la pantalla ni reintenta.
 *
 * LO QUE NO HACE, Y ES DELIBERADO. No guarda historial. Los logs de Vercel duran poco, así que sirven para
 * diagnosticar el día del problema, no como archivo. Si hace falta memoria larga o alertas, el paso siguiente
 * es Sentry o un drenaje de logs, y esta función es el único lugar que habría que cambiar.
 *
 * `contexto` lleva identificadores (id, serie-número, estado): NUNCA el DNI, el RUC ni el nombre de la clienta.
 */

type ErrorSuelto = { message?: unknown; code?: unknown; name?: unknown; cause?: unknown };

export function capturarError(donde: string, error: unknown, contexto: Record<string, unknown> = {}): void {
  // `donde` y la descripción van después de `contexto` para que el contexto no los pise.
  console.error(JSON.stringify({ nivel: "error", ...contexto, donde, ...describir(error) }));
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
