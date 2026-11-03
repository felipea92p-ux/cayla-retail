import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Mes } from "@/lib/facturacion-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";
import { leerReporteMes, primerDiaDelMes, type ReporteMes } from "@/lib/reportes-ventas-reglas";

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
