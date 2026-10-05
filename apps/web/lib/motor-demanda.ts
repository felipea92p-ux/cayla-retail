import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerPreparacion, preparacionDeSede, RPC_PREPARACION, type PreparacionSede } from "@/lib/motor-demanda-reglas";

// Motor de demanda, etapa 0 (ADR-0344): lectura del servidor. Solo LEE, por la función de la base
// (`fn_motor_demanda_preparacion`, 20261005210000). Si falla —la web publicada antes que la migración, o la base caída—, lo
// dice (principio 9): una sede nunca aparece «lista» ni «sin datos» por un error.

export type LecturaMotor = { sedes: PreparacionSede[]; falla: string | null };

/** Sin sede: todas las tiendas (pide CAYLA Global). Con sede: solo esa (también para quien la opera). */
export async function getPreparacionMotor(ubicacionId?: string): Promise<LecturaMotor> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    RPC_PREPARACION as never,
    (ubicacionId ? { p_ubicacion_id: ubicacionId } : {}) as never
  );
  if (error) {
    console.error(`${RPC_PREPARACION}: ${error.message}`);
    return { sedes: [], falla: "No se pudo leer si el sistema ya puede recomendar en cada tienda" };
  }
  return { sedes: leerPreparacion(data).map(preparacionDeSede), falla: null };
}
