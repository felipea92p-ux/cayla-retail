import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_PLAN } from "@/lib/plan-compra-reglas";

// Plan de campaña (ADR-0349): lectura del servidor. Solo LEE, por `fn_plan_compra` (20261005220000). Devuelve la respuesta cruda:
// la pantalla es un componente de cliente y la interpreta con `leerPlan` (los Map no viajan del servidor al cliente). Si falla —la
// web publicada antes que la migración, o la base caída—, lo dice (principio 9): nunca una hoja vacía que parezca «sin plan».
export async function getPlanCompra(planId?: string): Promise<{ datos: unknown; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_PLAN as never, (planId ? { p_plan_id: planId } : {}) as never);
  if (error) {
    console.error(`${RPC_PLAN}: ${error.message}`);
    return { datos: null, falla: "No se pudo leer el plan de campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder" };
  }
  return { datos: data, falla: null };
}
