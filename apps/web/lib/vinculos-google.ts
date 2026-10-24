import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerVinculos, ordenarVinculos, type VinculoGoogle } from "@/lib/vinculos-google-reglas";

// La lectura de Clientas ▸ Avisos ▸ «Cuentas de Google unidas a un miembro» del lado del servidor (ADR-0469). Si la base todavía no tiene
// la migración 20261021170000 (o no responde), la lista sale vacía y el bloque no se dibuja: Avisos sigue sirviendo (principio 9).

/** Las cuentas de Google unidas a una ficha en los últimos 60 días (`fn_vinculos_google_recientes`, módulo «avisos_club»). */
export async function getVinculosGoogle(): Promise<VinculoGoogle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vinculos_google_recientes");
  if (error) return [];
  return ordenarVinculos(leerVinculos(data ?? []));
}
