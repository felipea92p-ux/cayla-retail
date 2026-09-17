"use server";

import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getMovimientosCaja } from "@/lib/caja";

export type EventoCaja =
  | { tipo: "venta"; id: string; hora: string; total: number; unidades: number; metodos: string[]; anulada: boolean }
  | { tipo: "movimiento"; id: string; hora: string; direccion: "ingreso" | "egreso"; monto: number; motivo: string; nota: string | null; esAjuste: boolean }
  | { tipo: "devolucion"; id: string; hora: string; monto: number; metodo: string | null }
  | { tipo: "cambio"; id: string; hora: string; diferencia: number; metodo: string | null };

/**
 * Todo lo que pasó por una caja ya cerrada, en orden cronológico — para el botón "ver
 * detalle" del historial de cierres (`/caja/historial`). Se pide bajo demanda, no se
 * precarga junto con las 60 filas del historial: una caja de un día ocupado puede tener
 * decenas de ventas, y la lista completa rara vez se abre fila por fila. Apertura y
 * cierre NO viajan acá — `getHistorialCierres()` ya los trae con la fila, y volver a
 * pedirlos sería la misma consulta dos veces.
 *
 * Mismas cuatro fuentes que ya usa `getResumenCaja` (misma regla del cuadre, ver
 * `lib/caja.ts:5-13`), pero fila por fila en vez de sumadas: `venta_pagos`/`venta_items`
 * para cada venta, `caja_movimientos` (reusa `getMovimientosCaja`, no se duplica la
 * consulta), `devoluciones` y `cambios`. `caja_id` en devoluciones/cambios solo se fija
 * cuando el movimiento de plata es real (`aprobar_devolucion`/`registrar_cambio`) — un
 * `where caja_id = $1` ya excluye devoluciones pendientes/rechazadas sin un filtro aparte.
 */
export async function getDetalleCierre(cajaId: string): Promise<EventoCaja[]> {
  const supabase = await createClient();

  const [ventasRes, movimientos, devolucionesRes, cambiosRes] = await Promise.all([
    supabase.from("ventas").select("id, created_at, estado").eq("caja_id", cajaId),
    getMovimientosCaja(cajaId),
    supabase.from("devoluciones").select("id, aprobado_en, reembolso_monto, reembolso_metodo").eq("caja_id", cajaId),
    supabase.from("cambios").select("id, created_at, diferencia, metodo_pago_diferencia").eq("caja_id", cajaId),
  ]);

  const filasVentas = exigir(ventasRes, "las ventas de esta caja");
  const ventaIds = filasVentas.map((v) => v.id);
  const [pagosRes, itemsRes] = await Promise.all([
    ventaIds.length
      ? supabase.from("venta_pagos").select("venta_id, metodo, monto").in("venta_id", ventaIds)
      : Promise.resolve({ data: [], error: null }),
    ventaIds.length
      ? supabase.from("venta_items").select("venta_id, cantidad").in("venta_id", ventaIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const filasPagos = exigir(pagosRes, "los pagos de las ventas de esta caja");
  const filasItems = exigir(itemsRes, "las líneas de las ventas de esta caja");

  const eventos: EventoCaja[] = [];

  for (const v of filasVentas) {
    const pagos = filasPagos.filter((p) => p.venta_id === v.id);
    const items = filasItems.filter((i) => i.venta_id === v.id);
    eventos.push({
      tipo: "venta",
      id: v.id,
      hora: v.created_at,
      total: pagos.reduce((a, p) => a + Number(p.monto), 0),
      unidades: items.reduce((a, i) => a + i.cantidad, 0),
      metodos: [...new Set(pagos.map((p) => p.metodo))],
      anulada: v.estado === "anulada",
    });
  }

  for (const m of movimientos) {
    eventos.push({
      tipo: "movimiento",
      id: m.id,
      hora: m.creadoEn,
      direccion: m.tipo,
      monto: m.monto,
      motivo: m.motivo,
      nota: m.nota,
      esAjuste: m.esAjuste,
    });
  }

  const filasDevoluciones = exigir(devolucionesRes, "las devoluciones de esta caja");
  for (const d of filasDevoluciones) {
    eventos.push({
      tipo: "devolucion",
      id: d.id,
      hora: d.aprobado_en ?? "",
      monto: Number(d.reembolso_monto ?? 0),
      metodo: d.reembolso_metodo,
    });
  }

  const filasCambios = exigir(cambiosRes, "los cambios de esta caja");
  for (const c of filasCambios) {
    eventos.push({
      tipo: "cambio",
      id: c.id,
      hora: c.created_at,
      diferencia: Number(c.diferencia),
      metodo: c.metodo_pago_diferencia,
    });
  }

  return eventos.sort((a, b) => a.hora.localeCompare(b.hora));
}
