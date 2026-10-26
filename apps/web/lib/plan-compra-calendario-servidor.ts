import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
import { RPC_CALENDARIO, leerCalendario } from "@/lib/plan-compra-calendario";
import {
  DIAS_POR_LECTURA,
  aniosAMedir,
  evidenciaDeCampana,
  tiendaDeReferencia,
  unirHistoriales,
  ventanasDeLectura,
  type EvidenciaDeCampana,
} from "@/lib/plan-compra-calendario-evidencia";
import { campanasAMedir } from "@/lib/plan-compra-calendario-vista";
import { RPC_HISTORIAL, inicioDeDatos, leerHistorial, sumarDias, type LecturaHistorial } from "@/lib/plan-compra-historial";
import { getPlanCompra } from "@/lib/plan-compra";
import { RPC_PLANES, conCalendario, leerCampanas } from "@/lib/plan-compra-reglas";

// Plan de campaña ▸ Calendario: la lectura del servidor (ADR-0525, spike ①). Lo del plan abierto (la cabecera, los avisos) sale de `getPlanCompra`, como en las demás pestañas;
// lo propio del Calendario es «qué dice tu historia» de cada campaña: cuánto subió la venta de la tienda con más historia en cada año que se pudo medir.
//
// CÓMO SE LEE LA HISTORIA. `fn_historial_ventas` no deja pedir más de 1200 días por llamada y Sinatra llega a 2017, así que se pide la ventana más nueva (que trae además las tiendas,
// para saber cuál tiene más historia) y, después, las más viejas en paralelo; las lecturas se unen en una y se mide con las mismas funciones del Historial: una sola vara.
//
// CAÍDA EXTERNA (la base lenta o caída). El Calendario se arma igual y dice que no pudo medir la historia; nunca una cifra con años faltantes: si UNA ventana falla, no hay evidencia de
// ninguna campaña (con un año sin sus días, el multiplicador saldría de datos a medias y parecería verdadero).

export type EvidenciasDelCalendario = {
  /** Lo que dijo la historia de cada campaña (clave → evidencia; null = sin historia propia). Vacío si no se pudo leer. */
  evidencias: Record<string, EvidenciaDeCampana | null>;
  /** La tienda con la que se midió (la de más historia); null si ninguna tiene. */
  tienda: { id: string; nombre: string } | null;
  /** La lectura FALLÓ: no es lo mismo que «no hay historia». */
  historiaFallo: boolean;
};

const SIN_EVIDENCIA: EvidenciasDelCalendario = { evidencias: {}, tienda: null, historiaFallo: true };

export async function getEvidenciasDelCalendario(): Promise<EvidenciasDelCalendario> {
  const supabase = await createClient();
  const hoy = hoyLima();
  const reciente = { desde: sumarDias(hoy, -(DIAS_POR_LECTURA - 1)), hasta: hoy };
  const [planes, calendario, primera] = await Promise.all([
    supabase.rpc(RPC_PLANES as never),
    supabase.rpc(RPC_CALENDARIO as never),
    supabase.rpc(RPC_HISTORIAL as never, { p_desde: reciente.desde, p_hasta: reciente.hasta } as never),
  ]);
  if (planes.error || primera.error) {
    console.error(`calendario del plan (historia): ${planes.error?.message ?? primera.error?.message}`);
    return SIN_EVIDENCIA;
  }
  const campanas = conCalendario(leerCampanas(planes.data), calendario.error ? null : leerCalendario(calendario.data));
  const l1 = leerHistorial(primera.data);
  if (!campanas || !l1) return SIN_EVIDENCIA;
  const tienda = tiendaDeReferencia(l1);
  const inicio = tienda ? inicioDeDatos(tienda) : null;
  if (!tienda || !inicio) return { evidencias: {}, tienda: null, historiaFallo: false };

  // Las ventanas más viejas, en paralelo; una que falle deja todo sin evidencia (nunca una cuenta con años a medias).
  const resto = inicio < reciente.desde ? ventanasDeLectura(inicio, sumarDias(reciente.desde, -1)) : [];
  const mas = await Promise.all(resto.map((v) => supabase.rpc(RPC_HISTORIAL as never, { p_desde: v.desde, p_hasta: v.hasta } as never)));
  const lecturas: LecturaHistorial[] = [l1];
  for (const r of mas) {
    const l = r.error ? null : leerHistorial(r.data);
    if (!l) {
      console.error(`calendario del plan (historia, ventana vieja): ${r.error?.message ?? "respuesta que no se entiende"}`);
      return SIN_EVIDENCIA;
    }
    lecturas.push(l);
  }
  const unida = unirHistoriales(lecturas);
  if (!unida) return SIN_EVIDENCIA;
  const anios = aniosAMedir(tienda, unida.hoy);
  const evidencias: Record<string, EvidenciaDeCampana | null> = {};
  for (const c of campanasAMedir(campanas)) evidencias[c.clave] = evidenciaDeCampana(unida, tienda, c.fechasEn, anios);
  return { evidencias, tienda: { id: tienda.id, nombre: tienda.nombre }, historiaFallo: false };
}

/** Lo de la pestaña Calendario: lo del plan abierto (cabecera, avisos) y la historia de cada campaña, leídos a la vez. */
export async function getCalendarioPlan(planId?: string) {
  const [base, historia] = await Promise.all([getPlanCompra(planId), getEvidenciasDelCalendario()]);
  return { ...base, ...historia };
}
