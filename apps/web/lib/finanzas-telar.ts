import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requirePersonaActualV2, veEstadosFinancierosDeTodoDe, veFinanzasDeTodoDe } from "@/lib/persona-actual";
import { sedesDelTelar, type SedeTelar } from "@/lib/finanzas-telar-reglas";

/**
 * Los hilos de sede de Finanzas para la cuenta que mira (El telar, 2026-10-23): quien ve las finanzas de todo (`veFinanzasDeTodoDe`,
 * la misma pregunta que la base) tiene todas las ubicaciones activas y la empresa; los demás, solo su sede. Una lectura por
 * petición (`cache`): la usan la mesa de mando del layout y el orillo de cada submódulo.
 */
export const getSedesDelTelar = cache(
  async (): Promise<{ sedes: SedeTelar[]; veTodo: boolean; propia: string | null; sedesEstados: SedeTelar[] | null }> => {
    const persona = await requirePersonaActualV2();
    const veTodo = veFinanzasDeTodoDe(persona);
    // ADR-0585: con Estados financieros, en esa pantalla (y solo en ella) se eligen todas las sedes (`hilosDeLaRuta`).
    const veEstados = !veTodo && veEstadosFinancierosDeTodoDe(persona);
    const supabase = await createClient();
    const consulta = supabase.from("ubicaciones").select("id, nombre, tipo").eq("activo", true);
    const { data } = await (veTodo || veEstados ? consulta : consulta.eq("id", persona.ubicacionId));
    const filas = (data ?? []) as { id: string; nombre: string; tipo: string }[];
    const propias = veTodo ? filas : filas.filter((u) => u.id === persona.ubicacionId);
    return { sedes: sedesDelTelar(propias, veTodo), veTodo, propia: persona.ubicacionId, sedesEstados: veEstados ? sedesDelTelar(filas, true) : null };
  }
);
