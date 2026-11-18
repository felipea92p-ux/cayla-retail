import { createClient } from "@/lib/supabase/server";
import { esFuncionAusente } from "@/lib/compras-reglas";
import { leerPreciosARevisar, POR_PAGINA_PRECIOS, type CuentasPrecios, type FiltroPrecio, type PrendaARevisar } from "@/lib/revisar-precios-reglas";

export type PreciosARevisar =
  | { estado: "ok"; prendas: PrendaARevisar[]; total: number; cuentas: CuentasPrecios }
  /** La web salió antes que `20261110203000_precio_propuesto_con_ia.sql`: la pantalla lo dice y no se cae. */
  | { estado: "sin_funcion" }
  | { estado: "error"; mensaje: string };

/** Las prendas cuyo precio conviene mirar (ADR-0641), las que pierden dinero primero. */
export async function getPreciosARevisar(filtro: FiltroPrecio | null, pagina: number): Promise<PreciosARevisar> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_precios_a_revisar" as never,
    { p_motivo: filtro, p_limite: POR_PAGINA_PRECIOS, p_desde: Math.max(0, pagina - 1) * POR_PAGINA_PRECIOS } as never,
  );
  if (error) {
    if (esFuncionAusente(error)) return { estado: "sin_funcion" };
    return { estado: "error", mensaje: error.message };
  }
  return { estado: "ok", ...leerPreciosARevisar((data ?? []) as unknown as Record<string, unknown>[]) };
}
