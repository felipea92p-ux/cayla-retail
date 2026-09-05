import { createClient } from "@/lib/supabase/server";
import { mesLimaUTC } from "@/lib/finanzas-nucleo";
import type { GastoCategoria, MetodoPagoGasto } from "@cayla-retail/shared";

export type GastoDelMes = {
  id: string;
  sedeId: string;
  sedeCodigo: string;
  categoria: GastoCategoria;
  total: number;
  metodoPago: MetodoPagoGasto;
  especificacion: string | null;
  createdAt: string;
};

export type EgresosPorSede = {
  sedeId: string;
  sedeCodigo: string;
  total: number;
  totalMesPrevio: number;
};

export type ResumenEgresos = {
  gastos: GastoDelMes[];
  porSede: EgresosPorSede[];
  total: number;
  totalMesPrevio: number;
};

/**
 * Egresos del mes calendario (Fase 2 del reemplazo de Alegra — mismo criterio
 * "enero es enero" que ya usa finanzas/page.tsx, nunca ventana móvil).
 * Trae también el mes previo por sede para el comparativo del Resumen — dos
 * consultas en paralelo, no una función aparte para "el mes de antes".
 */
export async function getEgresosMes(
  sedes: { id: string; codigo: string }[],
  anio: number,
  mes: number
): Promise<ResumenEgresos> {
  const supabase = await createClient();
  const { desde, hasta } = mesLimaUTC(anio, mes);
  const mesPrevio = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const { desde: desdePrevio, hasta: hastaPrevio } = mesLimaUTC(mesPrevio.anio, mesPrevio.mes);

  const [{ data: actual }, { data: previo }] = await Promise.all([
    supabase
      .from("gastos")
      .select("id, sede_id, categoria, total, metodo_pago, especificacion, created_at")
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at", { ascending: false }),
    supabase.from("gastos").select("sede_id, total").gte("created_at", desdePrevio).lt("created_at", hastaPrevio),
  ]);

  const codigoPorSede = new Map(sedes.map((s) => [s.id, s.codigo]));

  const gastos: GastoDelMes[] = (actual ?? []).map((g) => ({
    id: g.id,
    sedeId: g.sede_id,
    sedeCodigo: codigoPorSede.get(g.sede_id) ?? "",
    categoria: g.categoria as GastoCategoria,
    total: Number(g.total),
    metodoPago: g.metodo_pago as MetodoPagoGasto,
    especificacion: g.especificacion,
    createdAt: g.created_at,
  }));

  const totalPorSedeActual = new Map<string, number>();
  gastos.forEach((g) => totalPorSedeActual.set(g.sedeId, (totalPorSedeActual.get(g.sedeId) ?? 0) + g.total));

  const totalPorSedePrevio = new Map<string, number>();
  (previo ?? []).forEach((g) => totalPorSedePrevio.set(g.sede_id, (totalPorSedePrevio.get(g.sede_id) ?? 0) + Number(g.total)));

  const porSede: EgresosPorSede[] = sedes.map((s) => ({
    sedeId: s.id,
    sedeCodigo: s.codigo,
    total: totalPorSedeActual.get(s.id) ?? 0,
    totalMesPrevio: totalPorSedePrevio.get(s.id) ?? 0,
  }));

  const total = gastos.reduce((acc, g) => acc + g.total, 0);
  const totalMesPrevio = Array.from(totalPorSedePrevio.values()).reduce((acc, n) => acc + n, 0);

  return { gastos, porSede, total, totalMesPrevio };
}
