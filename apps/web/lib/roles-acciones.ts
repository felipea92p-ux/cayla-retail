import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import type { ClaveModulo } from "@/lib/modulos";
import { firmar, type Firma } from "@/lib/responsable-reglas";

// Las escrituras de «Roles y accesos»: una función por RPC (20260923030000_roles_por_modulo.sql). Detrás de esta interfaz
// para que el panel no sepa de Supabase. Cada RPC vuelve a exigir «solo líder» y anota `roles_historial`.
// `firma` (última en cada acción): la del combo «Responsable» (ADR-0161/0162, Felipe 2026-09-23). `roles_historial`
// queda firmado con esa persona; quién PUEDE cambiar roles lo sigue decidiendo la cuenta.
// `version` (ADR-0193): la que devuelve `guardar_modulos_rol` tras guardar.
export type ResultadoRol = { error: ErrorEscritura; id?: string; version?: number };

export type AccionesRoles = {
  crear: (nombre: string, copiarDe: string | undefined, firma: Firma | null) => Promise<ResultadoRol>;
  /** `version`: la del rol cuando la pantalla lo leyó (ADR-0193). Si otra persona lo cambió, la base rechaza con PT409. */
  guardarModulos: (rolId: string, modulos: readonly ClaveModulo[], version: number, firma: Firma | null) => Promise<ResultadoRol>;
  renombrar: (rolId: string, nombre: string, descripcion: string, firma: Firma | null) => Promise<ResultadoRol>;
  archivar: (rolId: string, firma: Firma | null) => Promise<ResultadoRol>;
  restaurar: (rolId: string, firma: Firma | null) => Promise<ResultadoRol>;
  /** `ubicacionId`: la sede donde queda un líder al que se le baja el rol (la base la exige si no tiene una). */
  asignar: (rolId: string, cuenta: { tipo: "persona" | "terminal"; id: string }, ubicacionId: string | undefined, firma: Firma | null) => Promise<ResultadoRol>;
};

export const accionesRolesSupabase: AccionesRoles = {
  crear: async (nombre, copiarDe, firma) => {
    const { data, error } = await firmar(createClient().rpc("crear_rol", { p_nombre: nombre, p_copiar_de: copiarDe }), firma);
    return { error, id: data ?? undefined };
  },
  guardarModulos: async (rolId, modulos, version, firma) => {
    const { data, error } = await firmar(
      createClient().rpc("guardar_modulos_rol", { p_rol_id: rolId, p_modulos: [...modulos], p_version_esperada: version }),
      firma,
    );
    return { error, version: typeof data === "number" ? data : undefined };
  },
  renombrar: async (rolId, nombre, descripcion, firma) => {
    const { error } = await firmar(createClient().rpc("renombrar_rol", { p_rol_id: rolId, p_nombre: nombre, p_descripcion: descripcion }), firma);
    return { error };
  },
  archivar: async (rolId, firma) => {
    const { error } = await firmar(createClient().rpc("archivar_rol", { p_rol_id: rolId }), firma);
    return { error };
  },
  restaurar: async (rolId, firma) => {
    const { error } = await firmar(createClient().rpc("restaurar_rol", { p_rol_id: rolId }), firma);
    return { error };
  },
  asignar: async (rolId, cuenta, ubicacionId, firma) => {
    const { error } = await firmar(
      createClient().rpc(
        "asignar_rol",
        cuenta.tipo === "persona"
          ? { p_rol_id: rolId, p_persona_id: cuenta.id, ...(ubicacionId ? { p_ubicacion_id: ubicacionId } : {}) }
          : { p_rol_id: rolId, p_terminal_id: cuenta.id },
      ),
      firma,
    );
    return { error };
  },
};
