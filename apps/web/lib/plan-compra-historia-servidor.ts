import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/fechas-lima";
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
import type { CampanasLeidas } from "@/lib/plan-compra-reglas";

// Lo que dijo la historia de cada campaña (ADR-0525): cuánto subió la venta de la tienda con más historia en cada año que se pudo medir. Lo piden el Calendario («Qué dice tu historia») y
// Resultados («¿Subió la venta?»), y los dos tienen que decir el MISMO número: por eso la lectura vive aquí, una sola vez, y no en cada pantalla.
//
// CÓMO SE LEE. `fn_historial_ventas` no deja pedir más de 1200 días por llamada y Sinatra llega a 2017, así que se pide la ventana más nueva (que trae además las tiendas, para saber cuál tiene
// más historia) y, después, las más viejas en paralelo; las lecturas se unen en una y se mide con las mismas funciones del Historial: una sola vara.
//
// CAÍDA EXTERNA (la base lenta o caída). Quien llama sigue con lo suyo y dice que no pudo medir la historia; nunca una cifra con años faltantes: si UNA ventana falla, no hay evidencia de
// ninguna campaña (con un año sin sus días, el multiplicador saldría de datos a medias y parecería verdadero).

export type EvidenciasDeLaHistoria = {
  /** Lo que dijo la historia de cada campaña (clave → evidencia; null = sin historia propia). Vacío si no se pudo leer. */
  evidencias: Record<string, EvidenciaDeCampana | null>;
  /** La tienda con la que se midió (la de más historia); null si ninguna tiene. */
  tienda: { id: string; nombre: string } | null;
  /** La lectura FALLÓ: no es lo mismo que «no hay historia». */
  historiaFallo: boolean;
};

export const SIN_EVIDENCIA: EvidenciasDeLaHistoria = { evidencias: {}, tienda: null, historiaFallo: true };

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** La ventana más nueva de la historia: los últimos 1200 días hasta hoy. */
export const ventanaReciente = (hoy: string = hoyLima()): { desde: string; hasta: string } => ({ desde: sumarDias(hoy, -(DIAS_POR_LECTURA - 1)), hasta: hoy });

/**
 * Mide la historia de cada campaña, dadas las campañas ya leídas y la primera ventana (la más nueva, la que se pidió con `ventana`) de `fn_historial_ventas`, que quien llama pidió a la vez que
 * otras cosas para no esperar en fila. La ventana se pasa en vez de recalcularla: dos «hoy» tomados en instantes distintos, cerca de la medianoche de Lima, dejarían un día sin leer.
 */
export async function medirLaHistoria(
  supabase: Cliente,
  campanas: CampanasLeidas,
  primera: { data: unknown; error: { message: string } | null },
  ventana: { desde: string; hasta: string },
): Promise<EvidenciasDeLaHistoria> {
  if (primera.error) {
    console.error(`historia de las campañas: ${primera.error.message}`);
    return SIN_EVIDENCIA;
  }
  const l1 = leerHistorial(primera.data);
  if (!l1) return SIN_EVIDENCIA;
  const tienda = tiendaDeReferencia(l1);
  const inicio = tienda ? inicioDeDatos(tienda) : null;
  if (!tienda || !inicio) return { evidencias: {}, tienda: null, historiaFallo: false };

  // Las ventanas más viejas, en paralelo; una que falle deja todo sin evidencia (nunca una cuenta con años a medias).
  const resto = inicio < ventana.desde ? ventanasDeLectura(inicio, sumarDias(ventana.desde, -1)) : [];
  const mas = await Promise.all(resto.map((v) => supabase.rpc(RPC_HISTORIAL as never, { p_desde: v.desde, p_hasta: v.hasta } as never)));
  const lecturas: LecturaHistorial[] = [l1];
  for (const r of mas) {
    const l = r.error ? null : leerHistorial(r.data);
    if (!l) {
      console.error(`historia de las campañas (ventana vieja): ${r.error?.message ?? "respuesta que no se entiende"}`);
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

/** Lo mismo cuando quien llama todavía no pidió nada de la historia: pide la ventana más nueva y mide. */
export async function leerYMedirLaHistoria(supabase: Cliente, campanas: CampanasLeidas): Promise<EvidenciasDeLaHistoria> {
  const ventana = ventanaReciente();
  const primera = await supabase.rpc(RPC_HISTORIAL as never, { p_desde: ventana.desde, p_hasta: ventana.hasta } as never);
  return medirLaHistoria(supabase, campanas, primera, ventana);
}
