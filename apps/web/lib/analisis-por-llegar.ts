import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LlegadaPrenda } from "@/lib/analisis-tipos";
import { leerPorLlegar, RPC_POR_LLEGAR } from "@/lib/analisis-por-llegar-lectura";

// Análisis v4 (ADR-0357): lo que viene en camino a una tienda, por prenda (`retail.fn_analisis_por_llegar`, migración
// 20261006215000): traslados que ya salieron hacia ella (de un almacén, del Taller o de otra tienda) y compras repartidas a ella
// que faltan recibir. Si la base no responde, no viene nada a la vista y se dice en `falla` (principio 9): nunca «no viene nada»
// por un error. Cómo se entiende cada parte: `analisis-por-llegar-lectura.ts`.

export type LecturaPorLlegar = {
  /** Por id de variante: de dónde viene cada parte, cuánto y cuándo se espera. */
  porVariante: Record<string, LlegadaPrenda[]>;
  falla: string | null;
};

const NO_SE_PUDO = "No se pudo leer lo que viene en camino";

export async function getPorLlegar(ubicacionId: string): Promise<LecturaPorLlegar> {
  if (!ubicacionId) return { porVariante: {}, falla: "Falta la tienda" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(RPC_POR_LLEGAR as never, { p_ubicacion_id: ubicacionId } as never);
    if (error) {
      console.error(`${RPC_POR_LLEGAR} (${ubicacionId}): ${error.message}`);
      return { porVariante: {}, falla: NO_SE_PUDO };
    }
    const porVariante = leerPorLlegar(data);
    if (!porVariante) {
      console.error(`${RPC_POR_LLEGAR} (${ubicacionId}): la base respondió sin datos (sin permiso para analizar, o una forma que no se entiende)`);
      return { porVariante: {}, falla: NO_SE_PUDO };
    }
    return { porVariante, falla: null };
  } catch (e) {
    console.error(`${RPC_POR_LLEGAR} (${ubicacionId}): ${e instanceof Error ? e.message : String(e)}`);
    return { porVariante: {}, falla: NO_SE_PUDO };
  }
}
