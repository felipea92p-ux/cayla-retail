import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";

// Las escrituras de /colaboradores: una función por RPC (20260922110000_colaboradores_suspender_y_actividad.sql).
// Están detrás de esta interfaz para que el panel no sepa de Supabase: así se puede mostrar con datos de ejemplo
// y cada acción se prueba sin base. Cada RPC vuelve a exigir «solo líder» dentro de la base; esto nunca es la
// única puerta.
export type ResultadoAccion = { error: ErrorEscritura };

export type AccionesColaboradores = {
  agregar: (personas: string[], ubicacionId: string) => Promise<ResultadoAccion>;
  /** D-70: aprueba el alta de un colaborador (persona) que otro líder propuso. Las terminales no pasan por aquí: no son
   *  personas (ADR-0162) y se crean con `pnpm terminales:crear`, no desde esta pantalla. */
  aprobar: (personaId: string) => Promise<ResultadoAccion>;
  suspender: (personaId: string, motivo: string) => Promise<ResultadoAccion>;
  reactivar: (personaId: string) => Promise<ResultadoAccion>;
  cambiarUbicacion: (personaId: string, ubicacionId: string) => Promise<ResultadoAccion>;
  quitar: (personaId: string) => Promise<ResultadoAccion>;
  /** ADR-0162: apaga el aparato. Su sesión deja de leer y guardar al instante; su historial queda. */
  desactivarTerminal: (terminalId: string) => Promise<ResultadoAccion>;
  /** ADR-0162: lo vuelve a encender con su misma clave (la base rechaza si la tienda ya tiene otra activa de ese tipo). */
  reactivarTerminal: (terminalId: string) => Promise<ResultadoAccion>;
};

export const accionesSupabase: AccionesColaboradores = {
  agregar: async (personas, ubicacionId) => {
    const { error } = await createClient().rpc("agregar_colaboradores", { p_personas: personas, p_ubicacion_id: ubicacionId });
    return { error };
  },
  aprobar: async (personaId) => {
    const { error } = await createClient().rpc("fn_aprobar_alta_colaborador", { p_persona_id: personaId });
    return { error };
  },
  suspender: async (personaId, motivo) => {
    const { error } = await createClient().rpc("suspender_colaborador", { p_persona_id: personaId, p_motivo: motivo.trim() || undefined });
    return { error };
  },
  reactivar: async (personaId) => {
    const { error } = await createClient().rpc("reactivar_colaborador", { p_persona_id: personaId });
    return { error };
  },
  cambiarUbicacion: async (personaId, ubicacionId) => {
    const { error } = await createClient().rpc("cambiar_ubicacion_colaborador", { p_persona_id: personaId, p_ubicacion_id: ubicacionId });
    return { error };
  },
  quitar: async (personaId) => {
    const { error } = await createClient().rpc("quitar_colaborador", { p_persona_id: personaId });
    return { error };
  },
  desactivarTerminal: async (terminalId) => {
    const { error } = await createClient().rpc("desactivar_terminal", { p_terminal_id: terminalId });
    return { error };
  },
  reactivarTerminal: async (terminalId) => {
    const { error } = await createClient().rpc("reactivar_terminal", { p_terminal_id: terminalId });
    return { error };
  },
};
