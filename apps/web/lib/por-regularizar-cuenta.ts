import { createClient } from "@/lib/supabase/server";
import { vencidasDesde } from "@/lib/por-regularizar-reglas";

/**
 * Cuántas ventas sin registrar siguen pendientes y cuántas ya pasaron el plazo: la fila de «Para hoy» de Existencias, que lleva a su
 * lista (ADR-0330; «Para hoy», ADR-0331). Cuenta con el MISMO alcance que esa lista (`getPorRegularizar` en
 * /inventario/por-regularizar): una sede (`ubicacionId`), o todas las que la persona puede ver (`null`). Un número que no coincide con
 * la pantalla a la que lleva confunde más que no tener número (lo que le pasó al botón de Apartados, tarea #7 de Existencias).
 *
 * Solo cuenta (`head: true`): la cola crece a decenas por día y Existencias no necesita traerla entera para dibujar una fila.
 * Nunca lanza: si no se puede leer devuelve `null` y «Para hoy» lo dice («no se pudo leer») en vez de dibujar un 0.
 */
export async function contarPorRegularizar(ubicacionId: string | null): Promise<{ pendientes: number; vencidas: number } | null> {
  const supabase = await createClient();
  const contar = (soloVencidas: boolean) => {
    let consulta = supabase.from("prendas_por_regularizar").select("id", { count: "exact", head: true }).eq("estado", "pendiente");
    if (ubicacionId) consulta = consulta.eq("ubicacion_id", ubicacionId);
    if (soloVencidas) consulta = consulta.lte("vendido_en", vencidasDesde());
    return consulta;
  };
  const [pendientes, vencidas] = await Promise.all([contar(false), contar(true)]);
  if (pendientes.error || vencidas.error) return null;
  return { pendientes: pendientes.count ?? 0, vencidas: vencidas.count ?? 0 };
}
