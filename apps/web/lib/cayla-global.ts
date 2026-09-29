import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerCobertura, type FilaCobertura } from "@/lib/cayla-global-tablero";

// CAYLA Global (ADR-0275; contrato en 20260929140000_cayla_global_modulo_solo_admin.sql). Solo LEE. Si la lectura falla
// (la base todavía no tiene la función, o se cayó), la pantalla lo dice (principio 9): nunca muestra ceros como si fueran
// datos.

export type Lectura<T> = { datos: T; falla: string | null };

export async function getCoberturaGlobal(): Promise<Lectura<FilaCobertura[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_global_cobertura" as never);
  if (error) return { datos: [], falla: `No se pudo leer con qué datos cuenta la vista: ${error.message}` };
  return { datos: leerCobertura(data), falla: null };
}
