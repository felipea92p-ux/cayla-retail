import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { RPC_CALENDARIO, leerCalendario } from "@/lib/plan-compra-calendario";
import { SIN_EVIDENCIA, medirLaHistoria, ventanaReciente, type EvidenciasDeLaHistoria } from "@/lib/plan-compra-historia-servidor";
import { RPC_HISTORIAL } from "@/lib/plan-compra-historial";
import { getPlanCompra } from "@/lib/plan-compra";
import { RPC_PLANES, conCalendario, leerCampanas } from "@/lib/plan-compra-reglas";

// Plan de campaña ▸ Calendario: la lectura del servidor (ADR-0525, spike ①). Lo del plan abierto (la cabecera, los avisos) sale de `getPlanCompra`, como en las demás pestañas;
// lo propio del Calendario es «qué dice tu historia» de cada campaña: cuánto subió la venta de la tienda con más historia en cada año que se pudo medir. Esa lectura es de
// `plan-compra-historia-servidor.ts`, que comparte con Resultados para que las dos pantallas digan el mismo número.
//
// CAÍDA EXTERNA (la base lenta o caída). El Calendario se arma igual y dice que no pudo medir la historia; nunca una cifra con años faltantes.

export async function getEvidenciasDelCalendario(): Promise<EvidenciasDeLaHistoria> {
  const supabase = await createClient();
  const ventana = ventanaReciente(hoyLima());
  // Las campañas, el calendario y la primera ventana de la historia, a la vez: la historia no espera a que se lean las campañas.
  const [planes, calendario, primera] = await Promise.all([
    supabase.rpc(RPC_PLANES as never),
    supabase.rpc(RPC_CALENDARIO as never),
    supabase.rpc(RPC_HISTORIAL as never, { p_desde: ventana.desde, p_hasta: ventana.hasta } as never),
  ]);
  if (planes.error) {
    console.error(`calendario del plan (campañas): ${planes.error.message}`);
    return SIN_EVIDENCIA;
  }
  const campanas = conCalendario(leerCampanas(planes.data), calendario.error ? null : leerCalendario(calendario.data));
  if (!campanas) return SIN_EVIDENCIA;
  return medirLaHistoria(supabase, campanas, primera, ventana);
}

/** Lo de la pestaña Calendario: lo del plan abierto (cabecera, avisos) y la historia de cada campaña, leídos a la vez. */
export async function getCalendarioPlan(planId?: string) {
  const [base, historia] = await Promise.all([getPlanCompra(planId), getEvidenciasDelCalendario()]);
  return { ...base, ...historia };
}
