import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Mes } from "@/lib/facturacion-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";
import { leerCortesMes, leerReporteMes, leerSeriesMes, primerDiaDelMes, type CortesMes, type ReporteMes, type SeriesMes } from "@/lib/reportes-ventas-reglas";

// Ventas ▸ Reportes ▸ Ventas del mes: la lectura (`fn_reporte_ventas_mes`, 20261103230000). Una sola llamada trae las cifras del mes y las del
// tramo equivalente del anterior. Lo que ve la cuenta lo decide la base: el líder, todas las tiendas; quien tiene el módulo en su rol, la suya.
// Si la lectura falla, la pantalla se dibuja igual y lo dice (principio 9): nunca una cifra a medias.

/** `sinAcceso`: la cuenta no tiene el módulo `reportes_ventas` (`42501`). La puerta de la pantalla ya lo frena; esto cubre lo que llegue por otro camino. */
export async function getReporteMes(mes: Mes, ubicacionId: string | null): Promise<Lectura<ReporteMes | null> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reporte_ventas_mes" as never, { p_mes: primerDiaDelMes(mes), p_ubicacion: ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudo leer el reporte de ventas: ${error.message}`, sinAcceso: (error as { code?: string }).code === "42501" };
  const r = leerReporteMes(data);
  if (!r) return { datos: null, falla: "El reporte de ventas llegó en una forma que no se entiende.", sinAcceso: false };
  return { datos: r, falla: null, sinAcceso: false };
}

/**
 * Lo que dibujan los gráficos de «Ventas del mes» (`fn_reporte_ventas_series`, 20261103232000): ventas por día, mes a mes y cómo se pagó. Se lee
 * APARTE de las cifras: si esta lectura falla, las cifras de arriba siguen a la vista y los gráficos dicen que no se pudieron leer (principio 9).
 */
export async function getSeriesMes(mes: Mes, ubicacionId: string | null): Promise<Lectura<SeriesMes | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reporte_ventas_series" as never, { p_mes: primerDiaDelMes(mes), p_ubicacion: ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudieron leer los gráficos: ${error.message}` };
  const s = leerSeriesMes(data);
  return s ? { datos: s, falla: null } : { datos: null, falla: "Los gráficos llegaron en una forma que no se entiende." };
}

/**
 * El mes cortado por tienda y por categoría (`fn_reporte_ventas_cortes`, 20261103233000). Se lee aparte, como las series: si falla, las cifras y los
 * gráficos siguen y la tabla dice que no se pudo leer (principio 9).
 */
export async function getCortesMes(mes: Mes, ubicacionId: string | null): Promise<Lectura<CortesMes | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reporte_ventas_cortes" as never, { p_mes: primerDiaDelMes(mes), p_ubicacion: ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudo leer el desglose: ${error.message}` };
  const c = leerCortesMes(data);
  return c ? { datos: c, falla: null } : { datos: null, falla: "El desglose llegó en una forma que no se entiende." };
}
