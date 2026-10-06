import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LIQUIDAR_DEFECTO, liquidarDesdeValido } from "@/lib/analisis-reglas";
import { FALLA_LEER_LIQUIDAR, RPC_LEER_LIQUIDAR } from "@/lib/analisis-liquidar-reglas";

// Análisis v4 (ADR-0356): «Liquidar desde», uno para todas las tiendas y todas las personas (Felipe, 2026-10-06). Lo guarda la
// base (`parametros_analisis`, 20261006216000) y lo lee toda cuenta de retail con `fn_liquidar_desde`. Si la base no responde (o la
// migración todavía no está pegada), Análisis sigue con el valor de fábrica y lo dice en su nota: nunca se cae por esto
// (principio 9). Lo cambia la hoja `HojaLiquidarDesde` con `guardar_liquidar_desde`.

export async function getLiquidarDesde(): Promise<{ dias: number; falla: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(RPC_LEER_LIQUIDAR as never, {} as never);
    if (error) {
      console.error(`${RPC_LEER_LIQUIDAR}: ${error.message}`);
      return { dias: LIQUIDAR_DEFECTO, falla: FALLA_LEER_LIQUIDAR };
    }
    return { dias: liquidarDesdeValido(data), falla: null };
  } catch (e) {
    console.error(`${RPC_LEER_LIQUIDAR}: ${e instanceof Error ? e.message : String(e)}`);
    return { dias: LIQUIDAR_DEFECTO, falla: FALLA_LEER_LIQUIDAR };
  }
}
