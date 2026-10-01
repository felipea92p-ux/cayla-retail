import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { leerEtiquetas, paraGuardar, type EtiquetaClub, type Preferencias } from "@/lib/preferencias-clienta-reglas";
import type { FilaPermiso } from "@/lib/historia-permisos-reglas";

// Lo que la ficha de /clientas lee y guarda de la tanda 1f (ADR-0288, «Actualización 2026-09-30 (f)»): el catálogo de las
// preferencias, guardarlas y la historia del permiso. Una función por RPC, como `club-acciones.ts`; todas exigen el módulo
// «Clientas» en la base. Las lecturas empiezan por `fn_` (no abren el loader, `espera-reglas.ts`).

/** Los valores activos de las tres listas (`fn_club_etiquetas`), en su orden. Vacío si la base todavía no los tiene. */
export async function cargarEtiquetasClub(): Promise<{ etiquetas: EtiquetaClub[]; error: ErrorEscritura }> {
  const { data, error } = await createClient().rpc("fn_club_etiquetas");
  return { etiquetas: leerEtiquetas(data ?? []), error };
}

/** Guarda lo marcado (sin grupos vacíos) con el candado de versión; devuelve la versión nueva. Firma el responsable del combo
 *  (ADR-0161). La base rechaza a quien no es socia (`preferencias_solo_socia`) y lo que no está en la lista
 *  (`preferencia_invalida`); una versión vieja, con PT409. */
export async function guardarPreferencias(
  id: string,
  preferencias: Preferencias,
  version: number,
  firma: Firma | null,
): Promise<{ version: number | null; error: ErrorEscritura }> {
  const { data, error } = await firmar(
    createClient().rpc("guardar_preferencias_clienta", { p_id: id, p_preferencias: paraGuardar(preferencias), p_version_esperada: version }),
    firma,
  );
  return { version: data ?? null, error };
}

/** La historia del permiso (`fn_clienta_permisos`), de la más vieja a la más nueva. */
export async function cargarHistoriaPermisos(id: string): Promise<{ eventos: FilaPermiso[]; error: ErrorEscritura }> {
  const { data, error } = await createClient().rpc("fn_clienta_permisos", { p_clienta_id: id });
  return { eventos: (data ?? []) as FilaPermiso[], error };
}
