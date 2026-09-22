import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import type { TipoTerminal } from "@/lib/menu";

// Las escrituras de /colaboradores: una función por RPC (20260922110000_colaboradores_suspender_y_actividad.sql).
// Están detrás de esta interfaz para que el panel no sepa de Supabase: así se puede mostrar con datos de ejemplo
// y cada acción se prueba sin base. Cada RPC vuelve a exigir «solo líder» dentro de la base; esto nunca es la
// única puerta.
export type ResultadoAccion = { error: ErrorEscritura };

export type AccionesColaboradores = {
  agregar: (personas: string[], ubicacionId: string) => Promise<ResultadoAccion>;
  /** Da entrada a una persona de Dynamic como TERMINAL de una tienda (ADR-0159): siempre colaborador, solo en una tienda.
   *  Exenta de la aprobación de D-70 a propósito (ver `aprobar` abajo): el líder que la crea ya es la aprobación — no es
   *  una persona nueva entrando al equipo, es una cuenta de servicio que él mismo decide abrir. */
  agregarTerminal: (personaId: string, ubicacionId: string, tipo: TipoTerminal) => Promise<ResultadoAccion>;
  /** D-70: aprueba el alta de un colaborador (persona) que otro líder propuso. Nunca aplica a una terminal:
   *  `agregarTerminal` ya deja la fila en `estado = 'activo'` (el default de la columna), sin pasar por
   *  `pendiente_aprobacion`. */
  aprobar: (personaId: string) => Promise<ResultadoAccion>;
  suspender: (personaId: string, motivo: string) => Promise<ResultadoAccion>;
  reactivar: (personaId: string) => Promise<ResultadoAccion>;
  cambiarUbicacion: (personaId: string, ubicacionId: string) => Promise<ResultadoAccion>;
  quitar: (personaId: string) => Promise<ResultadoAccion>;
};

export const accionesSupabase: AccionesColaboradores = {
  agregar: async (personas, ubicacionId) => {
    const { error } = await createClient().rpc("agregar_colaboradores", { p_personas: personas, p_ubicacion_id: ubicacionId });
    return { error };
  },
  agregarTerminal: async (personaId, ubicacionId, tipo) => {
    const { error } = await createClient().rpc("agregar_terminal", { p_persona_id: personaId, p_ubicacion_id: ubicacionId, p_terminal: tipo });
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
};
