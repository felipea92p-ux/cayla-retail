import "server-only";
import { createClient } from "@/lib/supabase/server";
import { conIgvDeLasVentas, leerFilasIgvVentas } from "@/lib/igv-ventas-reglas";
import type { FilaER } from "@/lib/resultados-reglas";

// El IGV de las ventas para presentar lo cobrado en Ganancias y pérdidas (ADR-0624; contrato en 20261107174000_igv_de_las_ventas_regla_pareja.sql). Solo LEE y no cambia
// ninguna cifra del Estado de resultados: si no se puede leer, la pantalla queda como siempre, sin las filas «Cobraste» e «IGV de tus ventas».

type Lectura<T> = { datos: T; falla: string | null };

/** Las columnas de una lectura del Estado de resultados, con el IGV de las ventas de esas fechas. Una lectura que falló sigue como está. */
export async function conIgvDeLasVentasDe(desde: string, hasta: string, lectura: Lectura<FilaER[]>): Promise<Lectura<FilaER[]>> {
  if (lectura.falla) return lectura;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_igv_de_las_ventas" as never, { p_desde: desde, p_hasta: hasta } as never);
  return { datos: conIgvDeLasVentas(lectura.datos, error ? null : leerFilasIgvVentas(data)), falla: null };
}
