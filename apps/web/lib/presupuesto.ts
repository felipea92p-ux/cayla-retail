import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerConfigPpto, leerFilaPpto, type ConfigPpto, type FilaPpto } from "@/lib/presupuesto-reglas";

// Presupuesto (ADR-0195; contrato en 20260925190000_finanzas_presupuesto.sql). Solo LEE: el tope, lo real, la proyección
// al cierre y el estado de cada línea se calculan en Postgres; la base ya filtra por cuenta (el líder, todo y CAYLA; con
// «Reportes financieros», su tienda). Si una lectura falla, la pantalla se dibuja igual y lo dice (principio 9).

type Lectura<T> = { datos: T; falla: string | null };

/** Reportes ▸ Presupuesto: una fila por unidad y línea del mes `mes` («2026-09»). */
export async function getPresupuestoVsReal(mes: string): Promise<Lectura<FilaPpto[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_presupuesto_vs_real" as never, { p_mes: `${mes}-01` } as never);
  if (error) return { datos: [], falla: `No se pudo leer el presupuesto: ${error.message}` };
  return { datos: ((data ?? []) as Record<string, unknown>[]).map(leerFilaPpto), falla: null };
}

/** Configuración ▸ Presupuesto (solo el líder): unidades, rubros, topes del mes y la meta de ventas de cada tienda. */
export async function getPresupuestoConfig(mes: string): Promise<Lectura<ConfigPpto | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_presupuesto_configuracion" as never, { p_mes: `${mes}-01` } as never);
  if (error) return { datos: null, falla: `No se pudo leer el presupuesto: ${error.message}` };
  return { datos: leerConfigPpto(data), falla: null };
}
