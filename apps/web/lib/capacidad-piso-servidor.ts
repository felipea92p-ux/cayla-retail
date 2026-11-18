import { createClient } from "@/lib/supabase/server";
import { leerCapacidadPiso, type CapacidadPiso } from "@/lib/capacidad-piso";
import { unstable_rethrow } from "next/navigation";

/**
 * La capacidad del piso de una sede (`fn_capacidad_piso`, ADR-0329), para la nota «de 600» de la cabecera de Existencias.
 *
 * PROMETE: la capacidad, o `null` si la sede no tiene, si la función todavía no está en la base o si la base no respondió.
 * NUNCA lanza: es un dato secundario y sin él la pantalla se dibuja igual que antes, sin la nota (la caída se anota en el log).
 * ASUME: la llama el servidor con la sesión de quien mira (la función pide la puerta de lectura de retail).
 */
export async function getCapacidadPiso(ubicacionId: string): Promise<CapacidadPiso | null> {
  const r = await getCapacidadPisoConEstado(ubicacionId);
  return r.estado === "ok" ? r.capacidad : null;
}

export type LecturaCapacidad = { estado: "ok"; capacidad: CapacidadPiso } | { estado: "sin_capacidad" } | { estado: "fallo" };

/**
 * Lo mismo que `getCapacidadPiso`, pero DICE por qué no hay capacidad: «la sede no tiene una medida» (no es un error: no se dibuja nada) o «la base no
 * respondió» (sí lo es: la tarjeta lo dice). Existencias no necesita la diferencia y sigue con `getCapacidadPiso`; «Tu piso» del Inicio (ADR-0395) sí.
 * NUNCA lanza.
 */
export async function getCapacidadPisoConEstado(ubicacionId: string): Promise<LecturaCapacidad> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_capacidad_piso", { p_ubicacion_id: ubicacionId });
    if (error) {
      console.error("Existencias: no se pudo leer la capacidad del piso", error.message);
      return { estado: "fallo" };
    }
    const capacidad = leerCapacidadPiso(data);
    return capacidad ? { estado: "ok", capacidad } : { estado: "sin_capacidad" };
  } catch (e) {
    unstable_rethrow(e);
    console.error("Existencias: no se pudo leer la capacidad del piso", e);
    return { estado: "fallo" };
  }
}
