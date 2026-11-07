import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerCostoEstimado, type CostoEstimado } from "@/lib/costo-estimado-reglas";

/**
 * Cuánto de lo vendido en el rango lleva costo estimado (`fn_costo_estimado_resumen`, ADR-0417). Solo LEE; la base decide qué sedes ve la cuenta.
 * Si falla, ¿Ganamos? se dibuja igual y no inventa un «todo es real»: devuelve `datos: null` con el motivo (principio 9).
 */
export const getCostoEstimado = cache(async function getCostoEstimado(desde: string, hasta: string, ubicacionId: string | null): Promise<{ datos: CostoEstimado | null; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_costo_estimado_resumen" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudo leer cuánto costo es estimado: ${error.message}` };
  const fila = ((data ?? []) as Record<string, unknown>[])[0];
  return { datos: fila ? leerCostoEstimado(fila) : null, falla: null };
});
