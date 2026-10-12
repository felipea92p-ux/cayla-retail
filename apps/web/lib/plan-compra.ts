import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_PLAN, RPC_PLANES, campanaQueAbre, esIdDePlan, leerCampanas, type CampanaPlan, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import { hoyEnLima } from "@/lib/resumen-periodo";
import { RPC_PROPUESTA } from "@/lib/plan-compra-propuesta";
import { RPC_RESULTADOS, campanaParaResultados } from "@/lib/plan-compra-resultados";
import { RPC_HISTORIAL, rangoDelAnio, sumarDias, type EtiquetaHistorial } from "@/lib/plan-compra-historial";
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
//
// Sin campaña en la URL se abre la que toca hoy (`campanaQueAbre`, C1): la que está en curso, si no la próxima, si no la última terminada.
// Para eso las campañas se leen ANTES que el plan (encadenadas, en paralelo con lo demás). Si esa lectura falla, la base elige (la de inicio
// más reciente, como antes): el plan se ve igual.
export async function getPlanCompra(planId?: string): Promise<{
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  /** La URL pedía una campaña que no existe o no se entiende: se leyó la más reciente en su lugar. */
  planPedidoNoExiste: boolean;
  /** Lo que devuelve `fn_plan_compra_propuesta` (C4), crudo; null si no se pudo leer. */
  propuesta: unknown;
}> {
  const supabase = await createClient();
  const pedido = esIdDePlan(planId) ? planId.trim() : null;
  let planPedidoNoExiste = !!planId?.trim() && pedido === null;
  const leerPlanYCampanas = async () => {
    const planes = await supabase.rpc(RPC_PLANES as never);
    const leidas = planes.error ? null : leerCampanas(planes.data);
    const abre = pedido ?? (leidas ? (campanaQueAbre(leidas.planes, hoyEnLima(new Date()))?.id ?? null) : null);
    const primera = await supabase.rpc(RPC_PLAN as never, (abre ? { p_plan_id: abre } : {}) as never);
    return { planes, primera };
  };
  const [{ planes, primera }, familias, preparacion] = await Promise.all([
    leerPlanYCampanas(),
    supabase.from("familias").select("codigo, nombre").order("orden"),
    getPreparacionMotor(),
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
    return { datos: null, falla: "No se pudo leer el plan de campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", familias: nombres, preparacion, campanas, planPedidoNoExiste, propuesta: null };
  }
  // La propuesta (C4) es una ayuda: si falla o la base todavía no la tiene, cada categoría se llena a mano, como antes.
  const abierto = (plan.data as { plan?: { id?: unknown } } | null)?.plan?.id;
  const propuesta = typeof abierto === "string" ? await supabase.rpc(RPC_PROPUESTA as never, { p_plan_id: abierto } as never) : null;
  if (propuesta?.error) console.error(`${RPC_PROPUESTA}: ${propuesta.error.message}`);
  return { datos: plan.data, falla: null, familias: nombres, preparacion, campanas, planPedidoNoExiste, propuesta: propuesta && !propuesta.error ? propuesta.data : null };
}

/**
 * Resultados (ADR-0372, C6): lo vendido en una campaña. Sin campaña válida en la URL, la que está en curso, si no la última terminada, si no la
 * próxima (`campanaParaResultados`). Si la base falla, lo dice.
 */
export async function getResultadosPlan(planId?: string): Promise<{ datos: unknown; campanas: CampanasLeidas | null; falla: string | null; anterior: unknown; propuesta: unknown }> {
  const supabase = await createClient();
  const planes = await supabase.rpc(RPC_PLANES as never);
  if (planes.error) console.error(`${RPC_PLANES} (resultados): ${planes.error.message}`);
  const campanas = planes.error ? null : leerCampanas(planes.data);
  const pedido = esIdDePlan(planId) ? planId.trim() : null;
  const id = pedido ?? (campanas ? (campanaParaResultados(campanas.planes, hoyEnLima(new Date()))?.id ?? null) : null);
  if (!id) return { datos: null, campanas, falla: null, anterior: null, propuesta: null };
  // La misma campaña un año antes (Sinatra o ERP), en paralelo: da la forma de los días para «¿Cómo va?». Es una ayuda: si falla, los
  // días pesan igual. La propuesta (C4) trae lo que vendió cada categoría en esa campaña del año anterior, para el detalle de una fila:
  // también es una ayuda; si falla, el detalle dice que no hay con qué comparar.
  const fechas = campanas?.planes.find((p) => p.id === id);
  const [r, anterior, propuesta] = await Promise.all([
    supabase.rpc(RPC_RESULTADOS as never, { p_plan_id: id } as never),
    fechas
      ? supabase.rpc(RPC_HISTORIAL as never, { p_desde: sumarDias(fechas.desde, -366), p_hasta: sumarDias(fechas.hasta, -365) } as never)
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc(RPC_PROPUESTA as never, { p_plan_id: id } as never),
  ]);
  if (r.error) {
    console.error(`${RPC_RESULTADOS}: ${r.error.message}`);
    return { datos: null, campanas, falla: "No se pudieron leer los resultados de la campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", anterior: null, propuesta: null };
  }
  if (anterior.error) console.error(`${RPC_HISTORIAL} (resultados): ${anterior.error.message}`);
  if (propuesta.error) console.error(`${RPC_PROPUESTA} (resultados): ${propuesta.error.message}`);
  return { datos: r.data, campanas, falla: null, anterior: anterior.error ? null : anterior.data, propuesta: propuesta.error ? null : propuesta.data };
}

/**
 * Historial (ADR-0372, C3): lo vendido por tienda en el año pedido (y el anterior, para comparar) y las campañas de Etiquetas, que dan las
 * fechas de cada fila. Sin año válido en la URL, el último con su diciembre completo (el año pasado). Si la base falla, lo dice: nunca una
 * tabla vacía que parezca «no se vendió nada».
 */
export async function getHistorialPlan(anioPedido?: string): Promise<{
  anio: number;
  /** Lo que devuelve `fn_historial_ventas`, crudo: la pantalla es de cliente y lo lee con `leerHistorial` (los Map no viajan). */
  historial: unknown;
  etiquetas: EtiquetaHistorial[];
  /** Las campañas con plan: una fila del Historial que tiene el suyo lleva a sus Resultados. */
  planes: CampanaPlan[];
  falla: string | null;
}> {
  const hoy = hoyEnLima(new Date());
  const pedido = Number(anioPedido);
  const anio = Number.isInteger(pedido) && pedido >= 2000 && pedido <= Number(hoy.slice(0, 4)) ? pedido : Number(hoy.slice(0, 4)) - 1;
  const supabase = await createClient();
  const rango = rangoDelAnio(anio);
  const [historia, planes] = await Promise.all([
    supabase.rpc(RPC_HISTORIAL as never, { p_desde: rango.desde, p_hasta: rango.hasta } as never),
    supabase.rpc(RPC_PLANES as never),
  ]);
  if (planes.error) console.error(`${RPC_PLANES} (historial): ${planes.error.message}`);
  const leidas = planes.error ? null : leerCampanas(planes.data);
  const etiquetas = leidas?.etiquetas ?? [];
  const conPlan = leidas?.planes ?? [];
  if (historia.error) {
    console.error(`${RPC_HISTORIAL}: ${historia.error.message}`);
    return { anio, historial: null, etiquetas, planes: conPlan, falla: "No se pudo leer el historial. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder" };
  }
  return { anio, historial: historia.data, etiquetas, planes: conPlan, falla: null };
}
