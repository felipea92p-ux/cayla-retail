import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerResumen, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";

// Finanzas ▸ Resumen (ADR-0195 F10; contrato en 20260925200000_finanzas_resumen.sql). Solo LEE, en una sola llamada:
// `fn_resumen_finanzas` junta lo que ya calculan las fases y respeta el permiso de cada una. Si la lectura entera falla, la
// pantalla lo dice (principio 9): nunca muestra ceros como si fueran datos.

export type Lectura<T> = { datos: T; falla: string | null };

export async function getResumenFinanzas(pedido: { ubicacionId: string | null; soloEmpresa: boolean }): Promise<Lectura<ResumenFinanzas | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_resumen_finanzas" as never,
    { p_ubicacion_id: pedido.ubicacionId, p_solo_empresa: pedido.soloEmpresa } as never
  );
  if (error) return { datos: null, falla: `No se pudo leer el resumen: ${error.message}` };
  return { datos: leerResumen(data), falla: null };
}
