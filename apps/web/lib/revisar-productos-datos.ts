import { createClient } from "@/lib/supabase/server";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { leerPorRevisar, type ProductoPorRevisar } from "@/lib/revisar-productos-reglas";

/** Cuántas prendas por página en «Por revisar». Una cola real son pocas; si el conteo dejó cientos, se pagina. */
export const POR_PAGINA_POR_REVISAR = 25;

export type PorRevisar =
  | { estado: "ok"; productos: ProductoPorRevisar[]; total: number }
  /** La web salió antes que `20261010170000_revisar_productos_pendientes.sql`: la pantalla lo dice y no se cae. */
  | { estado: "sin_funcion" }
  | { estado: "error"; mensaje: string };

/** La cola de prendas por revisar, la más vieja primero (`fn_productos_por_revisar`; solo quien edita el catálogo). */
export async function getProductosPorRevisar(pagina: number): Promise<PorRevisar> {
  const supabase = await createClient();
  const [{ data, error }, familias] = await Promise.all([
    supabase.rpc("fn_productos_por_revisar", {
      p_limite: POR_PAGINA_POR_REVISAR,
      p_desde: Math.max(0, pagina - 1) * POR_PAGINA_POR_REVISAR,
    }),
    // ADR-0381: las familias fuera de los motores (Empaque) son las únicas cuyo S/ 0 se aprueba. Si la lectura falla, ninguna: la
    // hoja frena también la bolsa de obsequio en 0 (se aprueba al recargar) en vez de prometer un «Aprobar» que la base negaría.
    supabase.from("familias").select("codigo").eq("entra_a_motores", false),
  ]);
  if (error) {
    if (esFuncionAusente(error)) return { estado: "sin_funcion" };
    return { estado: "error", mensaje: error.message };
  }
  const conPrecioCero = new Set(familias.error ? [] : (familias.data ?? []).map((f) => f.codigo));
  return { estado: "ok", ...leerPorRevisar(data ?? [], conPrecioCero) };
}

/**
 * Cuántas hay por revisar, para el aviso de Catálogo ▸ Productos. `null` si no se pudo saber (la función aún no está en la base, la
 * red falló): sin número no se muestra nada, nunca un «0» que diga que no hay nada. Una sola fila basta: `total` ya cuenta todas.
 */
export async function getPorRevisarResumen(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_productos_por_revisar", { p_limite: 1, p_desde: 0 });
  if (error || !data) return null;
  return leerPorRevisar(data).total;
}
