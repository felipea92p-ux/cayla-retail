import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerProvision, provisionSinLeer, type FilaProvision } from "@/lib/planilla-provision-reglas";
import { unstable_rethrow } from "next/navigation";

// La planilla estimada por sede (ADR-0453; contrato en 20261018040000_planilla_provision_por_sede.sql). Solo LEE: la cifra sale de la
// boleta en vivo de Dynamic, agregada por sede en la base, y la base ya acota a lo que la cuenta ve (el líder, todas las sedes; con
// «Reportes financieros», la suya; sin ser admin o líder en Dynamic, nada).
//
// Principio 9: es un AGREGADO a lo que ya se ve, nunca una condición para verlo. Si la base no responde, o la función todavía no está
// pegada en producción, la pantalla sigue como antes (el mes sin sueldos estimados) y el motivo queda en el log del servidor.

/**
 * Los períodos de Dynamic sin pagar que terminan entre `desde` y `hasta`, por sede, con lo que corresponde pagar hasta hoy. `sinLeer`: la lectura se cayó, así que `filas` viene vacía
 * pero no es que no haya nada que sumar (tarea 43): quien la llama lo dice en pantalla, y las cifras se siguen viendo.
 */
export async function getProvisionPlanilla(desde: string, hasta: string, ubicacionId: string | null = null): Promise<{ filas: FilaProvision[]; sinLeer: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_planilla_provision" as never, { p_desde: desde, p_hasta: hasta, p_ubicacion_id: ubicacionId } as never);
    if (error) {
      const sinLeer = provisionSinLeer(error);
      if (sinLeer) console.error(`fn_planilla_provision: ${error.message}`);
      return { filas: [], sinLeer };
    }
    return { filas: leerProvision(data), sinLeer: false };
  } catch (e) {
    unstable_rethrow(e);
    console.error(`fn_planilla_provision: ${e instanceof Error ? e.message : String(e)}`);
    return { filas: [], sinLeer: true };
  }
}
