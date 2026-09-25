import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerPanelImpuestos, leerParametro, type PanelImpuestos, type ParametroFila } from "@/lib/impuestos-reglas";

// Finanzas ▸ Impuestos (ADR-0195 F8, 20260925140000). Todo sale de funciones que piden `fn_es_lider()`: el módulo es «solo
// líder por ahora» y de CAYLA entera. Si una lectura falla, la pantalla se dibuja igual y lo dice (principio 9): nunca
// muestra ceros como si fueran datos.

type Lectura<T> = { datos: T; falla: string | null };

/** La pantalla de Impuestos en una lectura. `mes` = «2026-08» (por defecto la base mira el mes anterior). */
export async function getPanelImpuestos(mes?: string): Promise<Lectura<PanelImpuestos | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_impuestos_panel" as never, { p_mes: mes ? `${mes}-01` : null } as never);
  if (error) return { datos: null, falla: `No se pudo leer el IGV: ${error.message}` };
  return { datos: leerPanelImpuestos(data), falla: null };
}

/** Configuración ▸ Impuestos: cada vigencia con su valor de hoy. */
export async function getParametrosTributarios(): Promise<Lectura<ParametroFila[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parametros_tributarios_lista" as never);
  if (error) return { datos: [], falla: `No se pudieron leer los parámetros tributarios: ${error.message}` };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerParametro), falla: null };
}
