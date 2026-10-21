import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { ConfigDelClub } from "@/lib/club-puntos-config-reglas";

// La escritura de Clientes ▸ Beneficios del club desde el navegador (programa de puntos, actividad 8). Solo el líder: la base lo exige
// (`fn_es_lider()`, 42501 con hint `solo_lider`) y firma con el responsable del combo (ADR-0161). Los límites y los 15 días de aviso
// los cuida la base; esta pantalla ya los avisa, pero no los decide.

/** Guarda una versión nueva de la configuración. Devuelve desde cuándo rige (`aaaa-mm-dd`). */
export async function guardarBeneficiosPuntos(c: ConfigDelClub, firma: Firma | null): Promise<{ desde: string | null; error: ErrorEscritura }> {
  const { data, error } = await firmar(
    createClient().rpc("guardar_beneficios_puntos", {
      p_puntos_por_sol: c.puntosPorSol,
      p_soles_por_100: c.solesPor100,
      p_canje_minimo: c.canjeMinimo,
      p_compra_minima_x: c.compraMinimaX,
      p_vigencia_dias: c.vigenciaDias,
      p_regalo_cumple: c.regaloCumple,
      p_tope_costo_pct: c.topeCostoPct,
    }),
    firma
  );
  return { desde: typeof data === "string" ? data.slice(0, 10) : null, error };
}
