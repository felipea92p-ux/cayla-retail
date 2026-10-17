import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerResumen, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { calcularConfianza, leerHechosConfianza, type Confianza } from "@/lib/finanzas-confianza";

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

// El medidor de confianza (ADR-0417): los hechos salen de `fn_finanzas_confianza` (20261015235000) y la calificación la pone
// `lib/finanzas-confianza.ts`. Si la base no responde o la cuenta no ve el diario, la pantalla sigue sin el medidor: nunca
// muestra un 0 % como si fuera una medida.
export async function getConfianzaFinanzas(pedido: { ubicacionId: string | null }): Promise<Lectura<Confianza | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_finanzas_confianza" as never, { p_mes: null, p_ubicacion_id: pedido.ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudo medir la confianza: ${error.message}` };
  return { datos: calcularConfianza(leerHechosConfianza(data)), falla: null };
}
