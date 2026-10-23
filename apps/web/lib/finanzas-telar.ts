import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requirePersonaActualV2, veFinanzasDeTodoDe } from "@/lib/persona-actual";
import { sedesDelTelar, type SedeTelar } from "@/lib/finanzas-telar-reglas";

/**
 * Los hilos de sede de Finanzas para la cuenta que mira (El telar, 2026-10-23): quien ve las finanzas de todo (`veFinanzasDeTodoDe`,
 * la misma pregunta que la base) tiene todas las ubicaciones activas y la empresa; los demás, solo su sede. Una lectura por
 * petición (`cache`): la usan la mesa de mando del layout y el orillo de cada submódulo.
 */
export const getSedesDelTelar = cache(async (): Promise<{ sedes: SedeTelar[]; veTodo: boolean; propia: string | null }> => {
  const persona = await requirePersonaActualV2();
  const veTodo = veFinanzasDeTodoDe(persona);
  const supabase = await createClient();
  const consulta = supabase.from("ubicaciones").select("id, nombre, tipo").eq("activo", true);
  const { data } = await (veTodo ? consulta : consulta.eq("id", persona.ubicacionId));
  return { sedes: sedesDelTelar((data ?? []) as { id: string; nombre: string; tipo: string }[], veTodo), veTodo, propia: persona.ubicacionId };
});
