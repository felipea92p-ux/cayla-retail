import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import type { ClaveModulo } from "@/lib/modulos";

// Las escrituras de «Roles y accesos»: una función por RPC (20260923030000_roles_por_modulo.sql). Detrás de esta interfaz
// para que el panel no sepa de Supabase. Cada RPC vuelve a exigir «solo líder» y anota `roles_historial`.
export type ResultadoRol = { error: ErrorEscritura; id?: string };

export type AccionesRoles = {
  crear: (nombre: string, copiarDe?: string) => Promise<ResultadoRol>;
  guardarModulos: (rolId: string, modulos: readonly ClaveModulo[]) => Promise<ResultadoRol>;
  renombrar: (rolId: string, nombre: string, descripcion: string) => Promise<ResultadoRol>;
  archivar: (rolId: string) => Promise<ResultadoRol>;
  restaurar: (rolId: string) => Promise<ResultadoRol>;
  /** `ubicacionId`: la sede donde queda un líder al que se le baja el rol (la base la exige si no tiene una). */
  asignar: (rolId: string, cuenta: { tipo: "persona" | "terminal"; id: string }, ubicacionId?: string) => Promise<ResultadoRol>;
};

export const accionesRolesSupabase: AccionesRoles = {
  crear: async (nombre, copiarDe) => {
    const { data, error } = await createClient().rpc("crear_rol", { p_nombre: nombre, p_copiar_de: copiarDe });
    return { error, id: data ?? undefined };
  },
  guardarModulos: async (rolId, modulos) => {
    const { error } = await createClient().rpc("guardar_modulos_rol", { p_rol_id: rolId, p_modulos: [...modulos] });
    return { error };
  },
  renombrar: async (rolId, nombre, descripcion) => {
    const { error } = await createClient().rpc("renombrar_rol", { p_rol_id: rolId, p_nombre: nombre, p_descripcion: descripcion });
    return { error };
  },
  archivar: async (rolId) => {
    const { error } = await createClient().rpc("archivar_rol", { p_rol_id: rolId });
    return { error };
  },
  restaurar: async (rolId) => {
    const { error } = await createClient().rpc("restaurar_rol", { p_rol_id: rolId });
    return { error };
  },
  asignar: async (rolId, cuenta, ubicacionId) => {
    const { error } = await createClient().rpc(
      "asignar_rol",
      cuenta.tipo === "persona"
        ? { p_rol_id: rolId, p_persona_id: cuenta.id, ...(ubicacionId ? { p_ubicacion_id: ubicacionId } : {}) }
        : { p_rol_id: rolId, p_terminal_id: cuenta.id },
    );
    return { error };
  },
};
