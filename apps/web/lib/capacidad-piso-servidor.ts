import { createClient } from "@/lib/supabase/server";
import { leerCapacidadPiso, type CapacidadPiso } from "@/lib/capacidad-piso";

/**
 * La capacidad del piso de una sede (`fn_capacidad_piso`, ADR-0329), para la nota «de 600» de la cabecera de Existencias.
 *
 * PROMETE: la capacidad, o `null` si la sede no tiene, si la función todavía no está en la base o si la base no respondió.
 * NUNCA lanza: es un dato secundario y sin él la pantalla se dibuja igual que antes, sin la nota (la caída se anota en el log).
 * ASUME: la llama el servidor con la sesión de quien mira (la función pide la puerta de lectura de retail).
 */
export async function getCapacidadPiso(ubicacionId: string): Promise<CapacidadPiso | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_capacidad_piso", { p_ubicacion_id: ubicacionId });
    if (error) {
      console.error("Existencias: no se pudo leer la capacidad del piso", error.message);
      return null;
    }
    return leerCapacidadPiso(data);
  } catch (e) {
    console.error("Existencias: no se pudo leer la capacidad del piso", e);
    return null;
  }
}
