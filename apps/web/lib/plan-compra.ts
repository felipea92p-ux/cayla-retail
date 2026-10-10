import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_PLAN } from "@/lib/plan-compra-reglas";

export type FamiliaPlan = { codigo: string; nombre: string };

// Plan de campaña (ADR-0349): lectura del servidor. Solo LEE, por `fn_plan_compra` (20261005220000). Devuelve la respuesta cruda:
// la pantalla es un componente de cliente y la interpreta con `leerPlan` (los Map no viajan del servidor al cliente). Si falla —la
// web publicada antes que la migración, o la base caída—, lo dice (principio 9): nunca una hoja vacía que parezca «sin plan».
//
// Las familias (el nombre que ve la persona en el filtro «Familia») salen de su tabla, aparte: `fn_plan_compra` solo trae el código de
// cada categoría. Si esa lectura falla, el plan se ve igual y el filtro habla con los códigos: perder un nombre no vale perder la hoja.
export async function getPlanCompra(planId?: string): Promise<{ datos: unknown; falla: string | null; familias: FamiliaPlan[] }> {
  const supabase = await createClient();
  const [plan, familias] = await Promise.all([
    supabase.rpc(RPC_PLAN as never, (planId ? { p_plan_id: planId } : {}) as never),
    supabase.from("familias").select("codigo, nombre").order("orden"),
  ]);
  if (familias.error) console.error(`familias (plan de campaña): ${familias.error.message}`);
  const nombres = familias.error ? [] : (familias.data ?? []);
  if (plan.error) {
    console.error(`${RPC_PLAN}: ${plan.error.message}`);
    return { datos: null, falla: "No se pudo leer el plan de campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", familias: nombres };
  }
  return { datos: plan.data, falla: null, familias: nombres };
}
