import "server-only";
import { createClient } from "@/lib/supabase/server";
import { LIQUIDAR_DEFECTO, liquidarDesdeValido } from "@/lib/analisis-reglas";
import { FALLA_LEER_LIQUIDAR, RPC_LEER_LIQUIDAR } from "@/lib/analisis-liquidar-reglas";
import { datosDe } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";

// Análisis v4 (ADR-0357): «Liquidar desde», uno para todas las tiendas y todas las personas (Felipe, 2026-10-06). Lo guarda la
// base (`parametros_analisis`, 20261006216000) y lo lee toda cuenta de retail con `fn_liquidar_desde`. Si la base no responde (o la
// migración todavía no está pegada, o no responde a tiempo: `analisis-con-tope.ts`), Análisis sigue con el valor de fábrica y lo dice
// en su nota: nunca se cae por esto (principio 9). Lo cambia la hoja `HojaLiquidarDesde` con `guardar_liquidar_desde`.

export async function getLiquidarDesde(): Promise<{ dias: number; falla: string | null }> {
  const lectura = await leerPieza("liquidar_desde", {}, async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(RPC_LEER_LIQUIDAR as never, {} as never);
    if (error) throw error;
    return liquidarDesdeValido(data);
  });
  const dias = datosDe(lectura);
  return dias === null ? { dias: LIQUIDAR_DEFECTO, falla: FALLA_LEER_LIQUIDAR } : { dias, falla: null };
}
