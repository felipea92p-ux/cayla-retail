import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_PLAN, RPC_PLANES, esIdDePlan, leerCampanas, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import { getPreparacionMotor, type LecturaMotor } from "@/lib/motor-demanda";

export type FamiliaPlan = { codigo: string; nombre: string };

// Plan de campaña (ADR-0349): lectura del servidor. Solo LEE, por `fn_plan_compra` (20261005220000). Devuelve la respuesta cruda:
// la pantalla es un componente de cliente y la interpreta con `leerPlan` (los Map no viajan del servidor al cliente). Si falla —la
// web publicada antes que la migración, o la base caída—, lo dice (principio 9): nunca una hoja vacía que parezca «sin plan».
//
// El aviso de stock incompleto sale de la lectura del motor de demanda (`getPreparacionMotor`, ADR-0346): por tienda, si el piso se cuadró y
// el almacén se contó. Si esa lectura falla, el plan se ve igual y el aviso dice «no se pudo verificar» (nunca «confiable»).
//
// Las familias (el nombre que ve la persona en el filtro «Familia») salen de su tabla, aparte: `fn_plan_compra` solo trae el código de
// cada categoría. Si esa lectura falla, el plan se ve igual y el filtro habla con los códigos: perder un nombre no vale perder la hoja.
//
// Una campaña pedida en la URL que no existe (un enlace viejo, un id escrito a mano) no deja la pantalla vacía diciendo «no hay ninguna
// campaña» ni le manda basura a la base: se muestra la más reciente y la pantalla lo dice (chaos 2026-10-10).
export async function getPlanCompra(planId?: string): Promise<{
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  /** La URL pedía una campaña que no existe o no se entiende: se leyó la más reciente en su lugar. */
  planPedidoNoExiste: boolean;
}> {
  const supabase = await createClient();
  const pedido = esIdDePlan(planId) ? planId.trim() : null;
  let planPedidoNoExiste = !!planId?.trim() && pedido === null;
  const [primera, familias, preparacion, planes] = await Promise.all([
    supabase.rpc(RPC_PLAN as never, (pedido ? { p_plan_id: pedido } : {}) as never),
    supabase.from("familias").select("codigo, nombre").order("orden"),
    getPreparacionMotor(),
    supabase.rpc(RPC_PLANES as never),
  ]);
  let plan = primera;
  // `fn_plan_compra` devuelve null si el id no es de ninguna campaña: se vuelve a leer sin id (la más reciente).
  if (pedido && !plan.error && plan.data == null) {
    planPedidoNoExiste = true;
    plan = await supabase.rpc(RPC_PLAN as never, {} as never);
  }
  // Las campañas (B3) son una ayuda: si la base todavía no las manda (la web se publicó antes que la migración) o falla, no hay selector y el plan se ve igual.
  if (planes.error) console.error(`${RPC_PLANES}: ${planes.error.message}`);
  const campanas = planes.error ? null : leerCampanas(planes.data);
  if (familias.error) console.error(`familias (plan de campaña): ${familias.error.message}`);
  const nombres = familias.error ? [] : (familias.data ?? []);
  if (plan.error) {
    console.error(`${RPC_PLAN}: ${plan.error.message}`);
    return { datos: null, falla: "No se pudo leer el plan de campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", familias: nombres, preparacion, campanas, planPedidoNoExiste };
  }
  return { datos: plan.data, falla: null, familias: nombres, preparacion, campanas, planPedidoNoExiste };
}
