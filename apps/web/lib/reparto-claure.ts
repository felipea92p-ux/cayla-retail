import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerReparto, type FilaReparto } from "@/lib/reparto-claure-reglas";

/**
 * Configuración ▸ Gastos con CLAURE (ADR-0560, actividad 17): qué parte de cada categoría de gasto es de CLAURE (`fn_reparto_claure`, solo el líder con el módulo Configuración).
 * `null` si la base todavía no tiene la migración o no responde: la pestaña lo dice en vez de caerse (principio 9).
 */
export async function getRepartoClaure(): Promise<FilaReparto[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reparto_claure" as never);
  return error ? null : leerReparto(data);
}
