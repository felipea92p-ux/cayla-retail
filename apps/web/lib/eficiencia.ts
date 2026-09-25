import { createClient } from "@/lib/supabase/server";
import { type GastoTaller, type PlanillaPeriodo } from "@/lib/eficiencia-reglas";
import { getGastosDeUbicacion } from "@/lib/gastos";
import { hoyLima, sumarDias } from "@/lib/fechas-lima";

// Eficiencia del Taller (ADR-0133, F7): las dos lecturas que vienen de FUERA de Producción. Las dos son de solo lectura y toleran fallar: la pantalla mide la
// producción igual y dice qué le falta.

export type EstadoPlanilla =
  | "ok"
  /** La vista puente todavía no está en la base (falta pegar `20260921160000_planilla_por_sede.sql`). */
  | "sin_vista"
  /** La vista existe pero no devuelve filas: Dynamic no le muestra la planilla a esta persona (solo admin o líder de allá) o aún no hay períodos pagados. */
  | "vacia";

/**
 * La planilla YA PAGADA del Taller por período (D-33). Se lee de `retail.planilla_por_sede`, `security_invoker`: Dynamic decide quién ve filas con su propio RLS,
 * y solo trae importes agregados —nunca a una persona—. El Taller se reconoce por `sede_tipo = 'taller'`, no por su código (`LIM` es el Taller, no la tienda de Lima).
 */
export async function getPlanillaDelTaller(): Promise<{ periodos: PlanillaPeriodo[]; estado: EstadoPlanilla }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planilla_por_sede")
    .select("periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total")
    .eq("sede_tipo", "taller")
    .order("fecha_ini", { ascending: false })
    .limit(12);
  if (error) return { periodos: [], estado: "sin_vista" };
  const periodos = (data ?? [])
    .filter((f) => f.periodo_id && f.fecha_ini && f.fecha_fin)
    .map((f) => ({ periodoId: f.periodo_id as string, ini: f.fecha_ini as string, fin: f.fecha_fin as string, personas: Number(f.personas ?? 0), pagado: Number(f.pagado ?? 0), provisiones: Number(f.provisiones ?? 0), costoTotal: Number(f.costo_total ?? 0) }));
  return { periodos, estado: periodos.length > 0 ? "ok" : "vacia" };
}

/**
 * Los gastos generales del Taller (alquiler, servicios…), de Finanzas ▸ Gastos con la ubicación del Taller: el modelo de
 * gastos (ADR-0117, ADR-0195 F2) es la única fuente; Producción no lleva una tabla aparte. Se leen por `fn_gastos_lista`
 * (la tabla no se lee directo), del último año, solo los vigentes; la fecha es la del gasto. Falla en silencio: sin
 * gastos, la conversión usa solo la planilla.
 */
export async function getGastosDelTaller(tallerId: string): Promise<GastoTaller[]> {
  const hoy = hoyLima();
  const gastos = await getGastosDeUbicacion(tallerId, sumarDias(hoy, -366), hoy);
  return gastos.map((g) => ({ categoria: g.categoria, total: g.montoTotal, fecha: g.fecha }));
}
