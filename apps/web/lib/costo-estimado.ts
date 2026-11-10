import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { conteoAlcanzaLoPedido, leerCostoEstimado, type CostoEstimado } from "@/lib/costo-estimado-reglas";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { sumarDias } from "@/lib/fechas-lima";

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

/**
 * Cuántas ventas del rango siguen PENDIENTES de registrar su prenda (`prendas_por_regularizar`): las cerradas sin prenda ya no vuelven solas, y `fn_costo_estimado_resumen` no las
 * separa. `vendido_en` es un instante: el rango se corta en el día de Lima. La RLS solo deja contar lo que la cuenta opera: fuera de eso, `null` y no un cero falso (`conteoAlcanzaLoPedido`). `null` si no se pudo contar.
 */
export const contarPrendasPorRegistrar = cache(async function contarPrendasPorRegistrar(desde: string, hasta: string, ubicacionId: string | null): Promise<number | null> {
  const persona = await requirePersonaActualV2();
  if (!conteoAlcanzaLoPedido({ esLider: persona.rol === "lider", sedePropia: persona.sedePropiaId, pedida: ubicacionId })) return null;
  const supabase = await createClient();
  let consulta = supabase
    .from("prendas_por_regularizar")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .gte("vendido_en", `${desde}T00:00:00-05:00`)
    .lt("vendido_en", `${sumarDias(hasta, 1)}T00:00:00-05:00`);
  if (ubicacionId) consulta = consulta.eq("ubicacion_id", ubicacionId);
  const { count, error } = await consulta;
  return error || count === null ? null : count;
});
