import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_PLAN, RPC_PLANES, campanaQueAbre, conCalendario, esIdDePlan, leerCampanas, type CampanaPlan, type CampanasLeidas } from "@/lib/plan-compra-reglas";
import { RPC_CALENDARIO, leerCalendario } from "@/lib/plan-compra-calendario";
import { hoyLima } from "@/lib/fechas-lima";
import { RPC_PROPUESTA, leerPropuesta } from "@/lib/plan-compra-propuesta";
import { RPC_PEDIDO } from "@/lib/plan-compra-pedido";
import { RPC_DESCUENTO } from "@/lib/plan-compra-descuento";
import { RPC_PLAZO } from "@/lib/plan-compra-plazo";
import { RPC_VERSIONES } from "@/lib/plan-compra-versiones";
import { RPC_PASOS_2 } from "@/lib/plan-compra-modelos";
import { RPC_PAGADO, RPC_PAGOS } from "@/lib/plan-compra-inversion";
import { esFirmaDesconocida } from "@/lib/plan-compra-propuesta-guardada";
import { RPC_RESULTADOS, campanaParaResultados } from "@/lib/plan-compra-resultados";
import { SIN_EVIDENCIA, leerYMedirLaHistoria } from "@/lib/plan-compra-historia-servidor";
import { historiaDelPlan, type HistoriaDelPlan } from "@/lib/plan-compra-veredicto";
import { RPC_HISTORIAL, rangoDeCampana, rangoDelAnio, sumarDias, type EtiquetaHistorial } from "@/lib/plan-compra-historial";
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
export async function getPlanCompra(
  planId?: string,
  /** `conPagos`: la pantalla «Cuándo se paga» (ADR-0527) también lee cómo se paga la campaña y cuánto de lo facturado ya se pagó. Las demás pestañas no lo piden: no cuestan dos lecturas más. */
  opciones: { conPagos?: boolean } = {},
): Promise<{
  datos: unknown;
  falla: string | null;
  familias: FamiliaPlan[];
  preparacion: LecturaMotor;
  campanas: CampanasLeidas | null;
  /** La URL pedía una campaña que no existe o no se entiende: se leyó la más reciente en su lugar. */
  planPedidoNoExiste: boolean;
  /** Lo que devuelve `fn_plan_compra_propuesta` (C4), crudo; null si no se pudo leer. */
  propuesta: unknown;
  /** Lo ya pedido en órdenes de compra para esta campaña (`fn_plan_compra_pedido`), crudo; null si no se pudo leer. */
  pedido: unknown;
  /** La misma campaña del año anterior y sus 60 días de antes (`fn_historial_ventas`), crudo: el multiplicador de cada tienda que el
   *  ERP todavía no cubre (Felipe 2026-10-13). null si no se pudo leer: esas tiendas caen al × 3, como antes. */
  historia: unknown;
  /** El descuento guardado por categoría y el que sugiere la campaña (`fn_plan_compra_descuento`, ADR-0499), crudo; null si no se pudo leer
   *  (base sin la migración o caída): el plan se calcula a precio de lista, como antes. */
  descuentos: unknown;
  /** Los días que tarda un pedido en llegar, fijados para esta campaña (`fn_plan_compra_plazo`, ADR-0499), crudo; null si no se pudo leer (el plan usa el supuesto). */
  plazo: unknown;
  /** El precio de la plata del plan, el tope y las versiones guardadas (`fn_plan_compra_versiones`, ADR-0523), crudo; null si no se pudo leer (base sin la migración o
   *  caída): el plan se calcula con el precio de la plata en 0 y no se ofrecen las versiones ni «Usar el plan con tope». */
  versiones: unknown;
  /** La lectura de versiones FALLÓ (la base lenta o caída), no es que la base todavía no la tenga: el plan se calculó con el precio de la plata en 0 y la pantalla lo dice. */
  versionesFallo: boolean;
  /** Qué categorías ya tienen su paso 2 guardado (`fn_plan_compra_pasos_2`, ADR-0526), crudo; null si no se pudo leer (base sin la migración o caída): las filas no dicen nada del paso 2. */
  pasos2: unknown;
  /** La lectura del calendario del plan (ADR-0525) FALLÓ (no es que la base todavía no lo tenga): el selector ofrece todas las campañas, como antes, y el Calendario lo dice. */
  calendarioFallo: boolean;
  /** Cómo se paga la campaña y si Finanzas la ve (`fn_plan_compra_pagos`, ADR-0527), crudo; null si no se pidió (`conPagos`), la base todavía no lo tiene o falló. */
  pagos: unknown;
  /** Cuánto de lo facturado de la campaña ya se pagó, sin IGV (`fn_plan_compra_pagado`), crudo; null si no se pidió, la base no lo tiene o falló. */
  pagado: unknown;
  /** Se pidió leer los pagos y la lectura FALLÓ (no es que la base todavía no los tenga): la pantalla lo dice y no ofrece guardar a ciegas. */
  pagosFallo: boolean;
}> {
  const supabase = await createClient();
  const pedido = esIdDePlan(planId) ? planId.trim() : null;
  let planPedidoNoExiste = !!planId?.trim() && pedido === null;
  const leerPlanYCampanas = async () => {
    const planes = await supabase.rpc(RPC_PLANES as never);
    const leidas = planes.error ? null : leerCampanas(planes.data);
    const abre = pedido ?? (leidas ? (campanaQueAbre(leidas.planes, hoyLima())?.id ?? null) : null);
    const primera = await supabase.rpc(RPC_PLAN as never, (abre ? { p_plan_id: abre } : {}) as never);
    return { planes, primera };
  };
  const [{ planes, primera }, familias, preparacion, calendario] = await Promise.all([
    leerPlanYCampanas(),
    supabase.from("familias").select("codigo, nombre").order("orden"),
    getPreparacionMotor(),
    // El calendario del plan (ADR-0525) decide cuáles campañas se ofrecen: es una ayuda; sin él, se ofrecen todas, como antes.
    supabase.rpc(RPC_CALENDARIO as never),
  ]);
  let plan = primera;
  // `fn_plan_compra` devuelve null si el id no es de ninguna campaña: se vuelve a leer sin id (la más reciente).
  if (pedido && !plan.error && plan.data == null) {
    planPedidoNoExiste = true;
    plan = await supabase.rpc(RPC_PLAN as never, {} as never);
  }
  // Las campañas (B3) son una ayuda: si la base todavía no las manda (la web se publicó antes que la migración) o falla, no hay selector y el plan se ve igual.
  if (planes.error) console.error(`${RPC_PLANES}: ${planes.error.message}`);
  if (calendario.error) console.error(`${RPC_CALENDARIO}: ${calendario.error.message}`);
  const campanas = planes.error ? null : conCalendario(leerCampanas(planes.data), calendario.error ? null : leerCalendario(calendario.data));
  // Una base que todavía no tiene la función (la web se publicó antes que la migración) NO es un fallo: no hay decisiones que perder de vista.
  const calendarioFallo = !!calendario.error && !esFirmaDesconocida(calendario.error);
  if (familias.error) console.error(`familias (plan de campaña): ${familias.error.message}`);
  const nombres = familias.error ? [] : (familias.data ?? []);
  if (plan.error) {
    console.error(`${RPC_PLAN}: ${plan.error.message}`);
    return { datos: null, falla: "No se pudo leer el plan de campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", familias: nombres, preparacion, campanas, planPedidoNoExiste, propuesta: null, pedido: null, historia: null, descuentos: null, plazo: null, versiones: null, versionesFallo: false, pasos2: null, calendarioFallo, pagos: null, pagado: null, pagosFallo: false };
  }
  // La propuesta (C4) es una ayuda: si falla o la base todavía no la tiene, cada categoría se llena a mano, como antes.
  const abierto = (plan.data as { plan?: { id?: unknown } } | null)?.plan?.id;
  // El historial va DESPUÉS de la propuesta y no en paralelo: las fechas de «la misma campaña del año anterior» las define la base
  // (`previa` de la propuesta), y el Plan no debe tener una segunda definición de esas fechas. Es una ayuda: si falla, el × 3 de antes.
  const leerPropuestaYSuHistoria = async (planId: string) => {
    const propuesta = await supabase.rpc(RPC_PROPUESTA as never, { p_plan_id: planId } as never);
    const previa = propuesta.error ? null : (leerPropuesta(propuesta.data)?.previa ?? null);
    if (!previa) return { propuesta, historia: null };
    const r = rangoDeCampana(previa);
    const historia = await supabase.rpc(RPC_HISTORIAL as never, { p_desde: r.desde, p_hasta: r.hasta } as never);
    return { propuesta, historia };
  };
  // Lo pedido en órdenes (ADR-0372 act. (e)) también es una ayuda: sin ella, el Plan no lo muestra.
  const [leida, ordenes, descuento, plazo, versiones, pasos2, pagos, pagado] =
    typeof abierto === "string"
      ? await Promise.all([
          leerPropuestaYSuHistoria(abierto),
          supabase.rpc(RPC_PEDIDO as never, { p_plan_id: abierto } as never),
          // El descuento (ADR-0499) también es una ayuda: sin él, el plan cuenta con el precio de lista.
          supabase.rpc(RPC_DESCUENTO as never, { p_plan_id: abierto } as never),
          // El plazo fijado (ADR-0499) también: sin él, la fecha límite usa el supuesto de 14 días y lo dice.
          supabase.rpc(RPC_PLAZO as never, { p_plan_id: abierto } as never),
          // El precio de la plata y las versiones (ADR-0523) también: sin ellos, el plan se calcula como siempre y no se ofrece guardar el plan con tope.
          supabase.rpc(RPC_VERSIONES as never, { p_plan_id: abierto } as never),
          // El paso 2 (ADR-0526) también: sin él, la lista no marca qué categorías ya repartieron en modelos, colores y tallas.
          supabase.rpc(RPC_PASOS_2 as never, { p_plan_id: abierto } as never),
          // Cómo se paga y cuánto ya se pagó (ADR-0527): solo la pantalla «Cuándo se paga» los pide.
          opciones.conPagos ? supabase.rpc(RPC_PAGOS as never, { p_plan_id: abierto } as never) : Promise.resolve(null),
          opciones.conPagos ? supabase.rpc(RPC_PAGADO as never, { p_plan_id: abierto } as never) : Promise.resolve(null),
        ])
      : [null, null, null, null, null, null, null, null];
  const propuesta = leida?.propuesta ?? null;
  const historia = leida?.historia ?? null;
  if (propuesta?.error) console.error(`${RPC_PROPUESTA}: ${propuesta.error.message}`);
  if (historia?.error) console.error(`${RPC_HISTORIAL} (plan): ${historia.error.message}`);
  if (ordenes?.error) console.error(`${RPC_PEDIDO}: ${ordenes.error.message}`);
  if (descuento?.error) console.error(`${RPC_DESCUENTO}: ${descuento.error.message}`);
  if (plazo?.error) console.error(`${RPC_PLAZO}: ${plazo.error.message}`);
  if (versiones?.error) console.error(`${RPC_VERSIONES}: ${versiones.error.message}`);
  if (pasos2?.error && !esFirmaDesconocida(pasos2.error)) console.error(`${RPC_PASOS_2}: ${pasos2.error.message}`);
  if (pagos?.error && !esFirmaDesconocida(pagos.error)) console.error(`${RPC_PAGOS}: ${pagos.error.message}`);
  if (pagado?.error && !esFirmaDesconocida(pagado.error)) console.error(`${RPC_PAGADO}: ${pagado.error.message}`);
  return {
    datos: plan.data,
    falla: null,
    familias: nombres,
    preparacion,
    campanas,
    planPedidoNoExiste,
    propuesta: propuesta && !propuesta.error ? propuesta.data : null,
    pedido: ordenes && !ordenes.error ? ordenes.data : null,
    historia: historia && !historia.error ? historia.data : null,
    descuentos: descuento && !descuento.error ? descuento.data : null,
    plazo: plazo && !plazo.error ? plazo.data : null,
    versiones: versiones && !versiones.error ? versiones.data : null,
    // Una base que todavía no tiene la función (la web se publicó antes que la migración) NO es un fallo: no hay plan con tope que perder de vista.
    versionesFallo: !!versiones?.error && !esFirmaDesconocida(versiones.error),
    pasos2: pasos2 && !pasos2.error ? pasos2.data : null,
    calendarioFallo,
    pagos: pagos && !pagos.error ? pagos.data : null,
    pagado: pagado && !pagado.error ? pagado.data : null,
    // Una base que todavía no tiene las funciones (la web se publicó antes que la migración) NO es un fallo: simplemente no se ofrece.
    pagosFallo: (!!pagos?.error && !esFirmaDesconocida(pagos.error)) || (!!pagado?.error && !esFirmaDesconocida(pagado.error)),
  };
}

/**
 * Resultados (ADR-0372, C6): lo vendido en una campaña. Sin campaña válida en la URL, la que está en curso, si no la última terminada, si no la
 * próxima (`campanaParaResultados`). Si la base falla, lo dice.
 */
export async function getResultadosPlan(planId?: string): Promise<{ datos: unknown; campanas: CampanasLeidas | null; falla: string | null; anterior: unknown; propuesta: unknown; historia: HistoriaDelPlan | null }> {
  const supabase = await createClient();
  const [planes, calendario] = await Promise.all([supabase.rpc(RPC_PLANES as never), supabase.rpc(RPC_CALENDARIO as never)]);
  if (planes.error) console.error(`${RPC_PLANES} (resultados): ${planes.error.message}`);
  if (calendario.error) console.error(`${RPC_CALENDARIO} (resultados): ${calendario.error.message}`);
  const campanas = planes.error ? null : conCalendario(leerCampanas(planes.data), calendario.error ? null : leerCalendario(calendario.data));
  const pedido = esIdDePlan(planId) ? planId.trim() : null;
  const id = pedido ?? (campanas ? (campanaParaResultados(campanas.planes, hoyLima())?.id ?? null) : null);
  if (!id) return { datos: null, campanas, falla: null, anterior: null, propuesta: null, historia: null };
  // La misma campaña un año antes (Sinatra o ERP), en paralelo: da la forma de los días para «¿Cómo va?». Es una ayuda: si falla, los
  // días pesan igual. La propuesta (C4) trae lo que vendió cada categoría en esa campaña del año anterior, para el detalle de una fila:
  // también es una ayuda; si falla, el detalle dice que no hay con qué comparar.
  const fechas = campanas?.planes.find((p) => p.id === id);
  // Solo una campaña TERMINADA tiene veredicto («¿subió la venta?», ADR-0525): leer toda la historia cuesta varias llamadas y mientras dura la campaña no hay nada que decir. Es una ayuda: si
  // la lectura falla la pantalla lo dice y el resto de Resultados sigue igual.
  const terminada = !!fechas && hoyLima() > fechas.hasta;
  const [r, anterior, propuesta, lecturaHistoria] = await Promise.all([
    supabase.rpc(RPC_RESULTADOS as never, { p_plan_id: id } as never),
    fechas
      ? supabase.rpc(RPC_HISTORIAL as never, { p_desde: sumarDias(fechas.desde, -366), p_hasta: sumarDias(fechas.hasta, -365) } as never)
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc(RPC_PROPUESTA as never, { p_plan_id: id } as never),
    // Una ayuda nunca tumba la pantalla: si la lectura se cae del todo (no solo responde con error), el veredicto dice que no pudo medir.
    terminada && campanas
      ? leerYMedirLaHistoria(supabase, campanas).catch((e: unknown) => {
          console.error(`historia de la campaña (resultados): ${e instanceof Error ? e.message : String(e)}`);
          return SIN_EVIDENCIA;
        })
      : Promise.resolve(null),
  ]);
  if (r.error) {
    console.error(`${RPC_RESULTADOS}: ${r.error.message}`);
    return { datos: null, campanas, falla: "No se pudieron leer los resultados de la campaña. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder", anterior: null, propuesta: null, historia: null };
  }
  if (anterior.error) console.error(`${RPC_HISTORIAL} (resultados): ${anterior.error.message}`);
  if (propuesta.error) console.error(`${RPC_PROPUESTA} (resultados): ${propuesta.error.message}`);
  const historia = campanas && lecturaHistoria ? historiaDelPlan(campanas, id, lecturaHistoria) : null;
  return { datos: r.data, campanas, falla: null, anterior: anterior.error ? null : anterior.data, propuesta: propuesta.error ? null : propuesta.data, historia };
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
  const hoy = hoyLima();
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
  // Historial lleva cada campaña a otros años: una sin fechas (act. 2026-10-12 f, el selector ya las trae) no tiene qué llevar.
  const etiquetas = (leidas?.etiquetas ?? []).flatMap((e) => (e.desde && e.hasta ? [{ id: e.id, nombre: e.nombre, desde: e.desde, hasta: e.hasta }] : []));
  const conPlan = leidas?.planes ?? [];
  if (historia.error) {
    console.error(`${RPC_HISTORIAL}: ${historia.error.message}`);
    return { anio, historial: null, etiquetas, planes: conPlan, falla: "No se pudo leer el historial. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder" };
  }
  return { anio, historial: historia.data, etiquetas, planes: conPlan, falla: null };
}
