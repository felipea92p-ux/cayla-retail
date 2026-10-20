import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerAvisos, type AvisoPendiente } from "@/lib/club-avisos-reglas";

// Las lecturas de Clientas ▸ Avisos del lado del servidor (ADR-0288 act. g, G-8). El navegador escribe con
// `club-avisos-acciones.ts`. Si la base todavía no tiene la tanda 1g, cada lectura devuelve `falla` en vez de tumbar la pantalla
// (principio 9): la pantalla lo dice y sigue.

export type LecturaAvisos = { avisos: AvisoPendiente[]; falla: string | null };

/** Los avisos por mandar desde esta tienda (`fn_club_avisos_pendientes`, módulo «avisos_club»). Quién entra lo decide la base. */
export async function getAvisosPendientes(ubicacionId: string): Promise<LecturaAvisos> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_club_avisos_pendientes", { p_ubicacion_id: ubicacionId });
  if (error) return { avisos: [], falla: `No se pudo leer la lista de avisos: ${error.message}` };
  return { avisos: leerAvisos(data ?? []), falla: null };
}
