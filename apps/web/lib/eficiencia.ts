import { createClient } from "@/lib/supabase/server";
import { fechaLimaDe, type GastoTaller, type PlanillaPeriodo } from "@/lib/eficiencia-reglas";

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
 * Los gastos generales del Taller (alquiler, servicios…), de `gastos` con la ubicación del Taller: el modelo de gastos de Finanzas (ADR-0117) es la única
 * fuente; Producción no lleva una tabla aparte. La fecha es la del registro (hora de Lima). Falla en silencio: sin gastos, la conversión usa solo la planilla.
 */
// `gastos` existe en producción pero todavía no está en los tipos generados (los trae el PR del modelo de gastos, ADR-0117): se tipa acá lo mínimo que se lee,
// sin tocar `packages/database`, para no chocar con ese PR. Cuando lleguen los tipos, este cast sobra.
type ConsultaGastos = {
  from(tabla: "gastos"): {
    select(columnas: string): {
      eq(columna: string, valor: string): {
        order(columna: string, opciones: { ascending: boolean }): {
          limit(n: number): PromiseLike<{ data: { categoria: string; total: number | string; created_at: string }[] | null; error: unknown }>;
        };
      };
    };
  };
};

export async function getGastosDelTaller(tallerId: string): Promise<GastoTaller[]> {
  const supabase = (await createClient()) as unknown as ConsultaGastos;
  const { data, error } = await supabase.from("gastos").select("categoria, total, created_at").eq("ubicacion_id", tallerId).order("created_at", { ascending: false }).limit(500);
  if (error) return [];
  return (data ?? []).map((g) => ({ categoria: g.categoria, total: Number(g.total), fecha: fechaLimaDe(g.created_at) ?? "" })).filter((g) => g.fecha !== "");
}
