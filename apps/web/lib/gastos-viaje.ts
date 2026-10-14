import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_GASTOS_VIAJE_DE_ORDEN, leerGastosDeOrden, type GastoDeOrden } from "@/lib/gastos-viaje-reglas";
import { leerNoDeduciblesCon } from "@/lib/no-deducible";

// Gastos del viaje (ADR-0362, fase 6 · actividad 3): lo que costó traer una orden, para su detalle («Traerla costó S/ X»). Si la lectura
// falla —la web publicada antes que la migración, o la base caída— la orden se ve como siempre, sin esa sección (principio 9).

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function getGastosDeOrden(id: string): Promise<GastoDeOrden[] | null> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc(RPC_GASTOS_VIAJE_DE_ORDEN as never, { p_orden_id: id } as never) as unknown as Respuesta);
  if (error) {
    console.error(`gastos del viaje de la orden: ${error.message}`);
    return null;
  }
  // Cada gasto con lo que la base dice no deducible (actividad 6): si esa lectura falla, se ven sin la marca.
  const gastos = leerGastosDeOrden(data);
  const nd = await leerNoDeduciblesCon(supabase, gastos.map((g) => `gasto:${g.gastoId}`));
  return gastos.map((g) => ({ ...g, noDeducible: nd.get(`gasto:${g.gastoId}`) ?? null }));
}
