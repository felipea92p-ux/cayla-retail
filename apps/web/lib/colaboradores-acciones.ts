import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Las escrituras de /colaboradores: una función por RPC (20260922110000_colaboradores_suspender_y_actividad.sql).
// Están detrás de esta interfaz para que el panel no sepa de Supabase: así se puede mostrar con datos de ejemplo
// y cada acción se prueba sin base. Cada RPC vuelve a exigir «solo líder» dentro de la base; esto nunca es la
// única puerta.
//
// `firma` (última en cada acción) es la del combo «Responsable» de la pantalla (`responsable.firma()`, ADR-0161/0162,
// Felipe 2026-09-23: el combo va en TODA acción que guarda). La base firma el historial con esa persona
// (`fn_actor_persona_id(true)`); los PERMISOS los sigue preguntando a la cuenta.
export type ResultadoAccion = { error: ErrorEscritura };

export type AccionesColaboradores = {
  agregar: (personas: string[], ubicacionId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  /** D-70: aprueba el alta de un colaborador (persona) que otro líder propuso. Las terminales no pasan por aquí: no son
   *  personas (ADR-0162) y se crean con `pnpm terminales:crear`, no desde esta pantalla. */
  aprobar: (personaId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  suspender: (personaId: string, motivo: string, firma: Firma | null) => Promise<ResultadoAccion>;
  reactivar: (personaId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  cambiarUbicacion: (personaId: string, ubicacionId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  quitar: (personaId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  /** ADR-0162: apaga el aparato. Su sesión deja de leer y guardar al instante; su historial queda. */
  desactivarTerminal: (terminalId: string, firma: Firma | null) => Promise<ResultadoAccion>;
  /** ADR-0162: lo vuelve a encender con su misma clave (la base rechaza si la tienda ya tiene otra activa de ese tipo). */
  reactivarTerminal: (terminalId: string, firma: Firma | null) => Promise<ResultadoAccion>;
};

export const accionesSupabase: AccionesColaboradores = {
  agregar: async (personas, ubicacionId, firma) => {
    const { error } = await firmar(createClient().rpc("agregar_colaboradores", { p_personas: personas, p_ubicacion_id: ubicacionId }), firma);
    return { error };
  },
  aprobar: async (personaId, firma) => {
    const { error } = await firmar(createClient().rpc("fn_aprobar_alta_colaborador", { p_persona_id: personaId }), firma);
    return { error };
  },
  suspender: async (personaId, motivo, firma) => {
    const { error } = await firmar(createClient().rpc("suspender_colaborador", { p_persona_id: personaId, p_motivo: motivo.trim() || undefined }), firma);
    return { error };
  },
  reactivar: async (personaId, firma) => {
    const { error } = await firmar(createClient().rpc("reactivar_colaborador", { p_persona_id: personaId }), firma);
    return { error };
  },
  cambiarUbicacion: async (personaId, ubicacionId, firma) => {
    const { error } = await firmar(createClient().rpc("cambiar_ubicacion_colaborador", { p_persona_id: personaId, p_ubicacion_id: ubicacionId }), firma);
    return { error };
  },
  quitar: async (personaId, firma) => {
    const { error } = await firmar(createClient().rpc("quitar_colaborador", { p_persona_id: personaId }), firma);
    return { error };
  },
  desactivarTerminal: async (terminalId, firma) => {
    const { error } = await firmar(createClient().rpc("desactivar_terminal", { p_terminal_id: terminalId }), firma);
    return { error };
  },
  reactivarTerminal: async (terminalId, firma) => {
    const { error } = await firmar(createClient().rpc("reactivar_terminal", { p_terminal_id: terminalId }), firma);
    return { error };
  },
};
