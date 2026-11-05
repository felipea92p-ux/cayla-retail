import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerSedeCuadre, type SedeCuadre } from "@/lib/cuadre-ventas-reglas";

/**
 * De Ventas a Finanzas (ADR-0609; contrato en 20261104212000_cuadre_ventas_finanzas.sql). Solo LEE y la base decide qué sedes ve la cuenta. Si
 * falla, ¿Ganamos? se dibuja igual y lo dice (principio 9).
 */
export const getCuadreVentas = cache(async function getCuadreVentas(desde: string, hasta: string): Promise<{ datos: SedeCuadre[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_cuadre_ventas_finanzas" as never, { p_desde: desde, p_hasta: hasta } as never);
  if (error) return { datos: [], falla: `No se pudo leer el cuadre con Ventas: ${error.message}` };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerSedeCuadre), falla: null };
});
