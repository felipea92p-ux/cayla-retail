import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DiaVenta } from "@/lib/resumen-telar-reglas";

/**
 * Lo vendido por día de cada tienda del Resumen (`fn_rendimiento_serie`, ADR-0286: con IGV y con la meta de la sede de cada día), para
 * la línea de ventas contra la meta. Solo lee. La base solo responde por las tiendas que la cuenta ve en Rendimiento: quien no lo ve
 * recibe `[]` y la línea usa la meta del presupuesto (decisión de Felipe, 2026-10-23). Una tienda que falla no tumba a las demás:
 * se deja fuera y `incompleta` lo dice, para que la frase no presente una suma parcial como si fuera todo.
 */
export async function getVentasPorDia(tiendas: readonly string[], desde: string, hasta: string): Promise<{ series: DiaVenta[][]; incompleta: boolean }> {
  if (!tiendas.length) return { series: [], incompleta: false };
  const supabase = await createClient();
  const respuestas = await Promise.all(
    tiendas.map((id) => supabase.rpc("fn_rendimiento_serie" as never, { p_ubicacion_id: id, p_desde: desde, p_hasta: hasta } as never)),
  );
  const series: DiaVenta[][] = [];
  let incompleta = false;
  for (const { data, error } of respuestas) {
    if (error) {
      incompleta = true;
      continue;
    }
    series.push(
      ((data ?? []) as { fecha: string; total: unknown; meta_sede: unknown }[]).map((d) => ({
        fecha: String(d.fecha).slice(0, 10),
        total: Number(d.total ?? 0),
        metaSede: d.meta_sede === null || d.meta_sede === undefined ? null : Number(d.meta_sede),
      })),
    );
  }
  return { series, incompleta };
}
