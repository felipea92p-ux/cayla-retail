/**
 * Las lecturas de UNA tienda para el panel de Rendimiento, separadas de `rendimiento.ts` para poder probarlas: ese archivo importa con el
 * alias `@/` (Supabase, sesión) y los tests de este repo no lo resuelven; este solo usa imports relativos y recibe quien llama a la base.
 *
 * PROMETE: las TRES lecturas (serie de ventas, historial de cambios de meta, ventas por hora) se piden SIEMPRE, para cada tienda que la cuenta
 * ve, sin depender de cuál tienda se mira (la pantalla cambia de tienda en el navegador y todo ya tiene que estar cargado); y si alguna falla,
 * la CAUSA queda en el log (código y mensaje de la base, nunca un dato de una persona) aunque la pantalla solo diga «no se pudo leer».
 * Una falla nunca se confunde con «no hay datos»: devuelve el `error` intacto y quien llama decide qué dibujar.
 */

export type ErrorRpc = { code?: string; message: string };
export type ResultadoRpc = { data: unknown; error: ErrorRpc | null };
/** Quien llama a la base: `supabase.rpc(nombre, args)`, sin el tipado por nombre (lo da quien interpreta cada resultado). */
export type LlamarRpc = (nombre: string, args: Record<string, unknown>) => PromiseLike<ResultadoRpc>;

/** Deja la causa de una lectura fallida en el log del servidor. Solo código y mensaje de la base: ningún dato personal. */
export function dejarCausa(que: string, error: ErrorRpc | null): void {
  if (error) console.error(`Rendimiento · no se pudo leer ${que}: [${error.code ?? "sin código"}] ${error.message}`);
}

export async function leerLecturasDeSede(
  llamar: LlamarRpc,
  ubicacionId: string,
  desde: string,
  hasta: string,
): Promise<{ serie: ResultadoRpc; historial: ResultadoRpc; detalle: ResultadoRpc }> {
  const [serie, historial, detalle] = await Promise.all([
    llamar("fn_rendimiento_serie", { p_ubicacion_id: ubicacionId, p_desde: desde, p_hasta: hasta }),
    llamar("fn_metas_historial", { p_ubicacion_id: ubicacionId }),
    llamar("fn_rendimiento_detalle", { p_ubicacion_id: ubicacionId, p_desde: desde, p_hasta: hasta }),
  ]);
  dejarCausa("la serie de ventas de la tienda", serie.error);
  dejarCausa("el historial de cambios de meta", historial.error);
  dejarCausa("las ventas por hora", detalle.error);
  return { serie, historial, detalle };
}
