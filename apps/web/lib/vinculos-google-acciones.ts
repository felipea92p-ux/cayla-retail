import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";

// Las escrituras de Clientas ▸ Avisos ▸ «Cuentas de Google unidas a un miembro» desde el navegador (ADR-0469, 20261021170000). Ninguna
// decide reglas: solo pasa lo que eligió la pantalla; la base exige el módulo «avisos_club» para anotar y ser líder para deshacer.

/** «Avisar»: WhatsApp Web ya se abrió con el texto; queda anotado quién avisó y desde qué tienda. Repetido no hace nada. */
export async function registrarVinculoAvisado(id: string, ubicacionId: string, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorEscritura }> {
  const supabase = createClient();
  const { error } = await firmar(supabase.rpc("registrar_vinculo_google_avisado", { p_id: id, p_ubicacion_id: ubicacionId }), firma);
  return { error };
}

/** «Deshacer la unión» (solo un líder): la cuenta de Google se cierra y la ficha queda como estaba. */
export async function desvincularCuentaGoogle(id: string, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorEscritura }> {
  const supabase = createClient();
  const { error } = await firmar(supabase.rpc("desvincular_cuenta_google", { p_id: id }), firma);
  return { error };
}
