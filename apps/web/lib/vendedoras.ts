import { createClient } from "@/lib/supabase/server";
import type { CandidataVendedora, Vendedora } from "@/lib/vender-reglas";

/**
 * Las colaboradoras que atienden en caja en una sede: la fila «Atendió» del ticket del Punto de venta.
 * Es un dato secundario: si la lectura falla, la caja sigue vendiendo (a nombre de la sesión) y la pantalla
 * lo dice. Si la función todavía no existe en esta base (PGRST202: la web se desplegó antes que la
 * migración), no hay a quién elegir y se vende como siempre, sin aviso — el mismo criterio que
 * `campanas_vigentes`.
 */
export async function getVendedorasDeSede(ubicacionId: string): Promise<{ vendedoras: Vendedora[]; noCargaron: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vendedoras_de_sede", { p_ubicacion_id: ubicacionId });
  if (error) return { vendedoras: [], noCargaron: error.code !== "PGRST202" };
  return { vendedoras: (data ?? []).map((v) => ({ personaId: v.persona_id, nombre: v.nombre })), noCargaron: false };
}

/** Todas las colaboradoras activas de la sede con su interruptor, para el modal del líder. Vacío si no se pudo leer. */
export async function getCandidatasVendedora(ubicacionId: string): Promise<CandidataVendedora[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_candidatas_vendedora_de_sede", { p_ubicacion_id: ubicacionId });
  if (error) return [];
  return (data ?? []).map((c) => ({ personaId: c.persona_id, nombre: c.nombre, atiende: c.atiende_en_caja }));
}
