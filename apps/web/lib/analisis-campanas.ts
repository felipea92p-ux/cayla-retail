import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerCampanas, RPC_PLANES } from "@/lib/plan-compra-reglas";
import { leerHistorial, RPC_HISTORIAL } from "@/lib/plan-compra-historial";
import type { LecturaCampanas } from "@/lib/analisis-campanas-reglas";
import { lecturaDelAnio, rangosDeTemporada, temporadaDe, type TemporadaDatos } from "@/lib/analisis-temporada";
import { datosDe } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";

// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A6): las dos lecturas que «Qué pedir» le pide al Plan de campaña
// de Compras, SIN función nueva en la base y sin cambiar las firmas de las que ya usa el Plan:
//   · `fn_planes_compra`: las campañas con plan (de ahí sale la meta, `analisis-campanas-reglas.ts`);
//   · `fn_historial_ventas`: lo vendido por tienda día a día (de ahí sale la temporada, `analisis-temporada.ts`), una lectura por año.
// Las dos piden el módulo «Plan de campaña» (la base responde 42501 sin él): quien no lo ve ni siquiera las intenta, y la pantalla mide con el
// respaldo y lo dice. Si la base no responde (o no a tiempo: `analisis-con-tope.ts`), la pantalla también cae al respaldo y lo dice en `fallas`
// (principio 9): nunca una meta inventada en silencio.

/** Lo que se dice si no se pudo leer el Plan de campaña. */
export const FALLA_CAMPANAS = "No se pudo leer el Plan de campaña: «Qué pedir» mide hasta Navidad, o a lo que tarda un pedido más un mes";
/** Lo que se dice si no se pudo leer el historial de ventas. */
export const FALLA_TEMPORADA = "No se pudo leer el historial de ventas: «Qué pedir» no muestra la temporada";

/** Las campañas del Plan, para elegir la meta. `conPlan`: si quien mira ve el módulo «Plan de campaña». */
export async function getCampanasParaAnalisis(conPlan: boolean): Promise<{ lectura: LecturaCampanas; falla: string | null }> {
  if (!conPlan) return { lectura: { estado: "sin_modulo" }, falla: null };
  const lectura = await leerPieza("campanas", {}, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(RPC_PLANES as never);
    if (error) throw error;
    // null = la base respondió una forma que no se entiende.
    return leerCampanas(data);
  });
  const campanas = datosDe(lectura);
  return campanas ? { lectura: { estado: "ok", campanas }, falla: null } : { lectura: { estado: "fallo" }, falla: FALLA_CAMPANAS };
}

/**
 * La temporada de mi tienda: una lectura del historial por cada uno de los últimos años, en paralelo y como UNA sola pieza (un tope, un aviso).
 * `hasta`: la meta de hoy (YYYY-MM-DD), o null si la meta es «plazo + 1 mes» (cada tipo tiene la suya: no hay un día fijo con el que comparar años).
 */
export async function getTemporada(a: { conPlan: boolean; ubicacionId: string; hoy: string; ventana: number; hasta: string | null }): Promise<{ temporada: TemporadaDatos; falla: string | null }> {
  if (!a.conPlan) return { temporada: { estado: "sin_modulo" }, falla: null };
  if (a.hasta === null) return { temporada: { estado: "sin_horizonte" }, falla: null };
  const { ubicacionId, hoy, ventana, hasta } = a;
  const rangos = rangosDeTemporada(hoy, ventana, hasta);
  const lectura = await leerPieza("historial_ventas", { ubicacion_id: ubicacionId }, async () => {
    const supabase = await createClient();
    const lecturas = await Promise.all(
      rangos.map(async (r) => {
        const t = lecturaDelAnio(r);
        const { data, error } = await supabase.rpc(RPC_HISTORIAL as never, { p_desde: t.desde, p_hasta: t.hasta } as never);
        if (error) throw error;
        return leerHistorial(data);
      }),
    );
    // null = alguna respuesta no se entiende: sin un año no se puede medir parejo.
    if (lecturas.some((h) => h === null)) return null;
    const dias = new Map<string, number>();
    for (const h of lecturas) for (const [fecha, soles] of h?.dias.get(ubicacionId) ?? []) dias.set(fecha, soles);
    return temporadaDe(dias, rangos);
  });
  const temporada = datosDe(lectura);
  return temporada ? { temporada, falla: null } : { temporada: { estado: "fallo" }, falla: FALLA_TEMPORADA };
}
