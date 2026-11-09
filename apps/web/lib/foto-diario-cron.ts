import { crearClienteAdmin } from "@/lib/supabase-admin";
import { cronAutorizado } from "@/lib/rutas-cron";
import { capturarError } from "@/lib/errores";

// La foto del diario por mes (ADR-0633): lo que corren las dos rutas del trabajo programado de Vercel. Llama a
// `retail.rehacer_fotos_diario(todas)` con la llave de servicio:
//   · `/api/finanzas/foto-diario`, cada 5 minutos: rehace los meses vencidos (desde la marca más vieja) y los que terminaron sin foto.
//   · `/api/finanzas/foto-diario/todas`, cada madrugada (4:00 de Lima, después del vigía): rehace todos los meses.
//
// SE DEGRADA ASÍ: si la base no responde o la migración no está pegada, 500 y `capturarError`. No se pierde nada: mientras una foto
// esté vencida, `fn_diario` arma ese mes en vivo, como antes de la foto (más lento, igual de correcto). Si otra vuelta sigue corriendo,
// la base responde `ocupado` y esta no hace nada.

/** Lo que devuelve la base al terminar una vuelta; `ocupado` si otra vuelta tenía el candado. */
type Vuelta = { rehechas?: number; ms?: number; todas?: boolean; ocupado?: boolean };

export async function rehacerFotosDelDiario(request: Request, todas: boolean): Promise<Response> {
  if (!cronAutorizado(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  const donde = todas ? "finanzas/foto-diario/todas (cron)" : "finanzas/foto-diario (cron)";

  let supabase: ReturnType<typeof crearClienteAdmin>;
  try {
    supabase = crearClienteAdmin();
  } catch (e) {
    capturarError(`${donde}: sin llave de servicio`, e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }

  // La función es nueva y los tipos generados todavía no la traen: se llama por nombre.
  const { data, error } = await supabase.rpc("rehacer_fotos_diario" as never, { p_todas: todas } as never);
  if (error) {
    capturarError(`${donde}: rehacer_fotos_diario falló`, error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const vuelta = (data ?? {}) as Vuelta;
  // Una línea en los logs, solo cifras: se busca con `vercel logs --query finanzas_foto_diario`.
  console.info(JSON.stringify({ evento: "finanzas_foto_diario", todas, rehechas: vuelta.rehechas ?? 0, ms: vuelta.ms ?? null, ocupado: vuelta.ocupado ?? false }));
  return Response.json(vuelta);
}
