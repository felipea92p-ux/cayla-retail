import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCuadreVentas } from "@/lib/cuadre-ventas";
import { conIgvDeLasVentas, leerFilasIgvVentas } from "@/lib/igv-ventas-reglas";
import type { FilaER } from "@/lib/resultados-reglas";

// El IGV de las ventas para presentar lo cobrado en Ganancias y pérdidas (ADR-0624; contrato en 20261107174000_igv_de_las_ventas_regla_pareja.sql). Solo LEE y no cambia
// ninguna cifra del Estado de resultados: si no se puede leer, la pantalla queda como siempre, sin las filas «Vendiste con IGV» e «IGV de tus ventas».

type Lectura<T> = { datos: T; falla: string | null };

/** Las columnas de una lectura del Estado de resultados, con el IGV de las ventas de esas fechas. Una lectura que falló sigue como está. */
export async function conIgvDeLasVentasDe<L extends Lectura<FilaER[]>>(desde: string, hasta: string, lectura: L): Promise<L> {
  if (lectura.falla) return lectura;
  const supabase = await createClient();
  // Lo vendido de CLAURE sale del mismo cuadre que explica las ventas (ADR-0609): es lo que el Diario le quitó a cada sede, también en los cambios.
  const [{ data, error }, cuadre] = await Promise.all([supabase.rpc("fn_igv_de_las_ventas" as never, { p_desde: desde, p_hasta: hasta } as never), getCuadreVentas(desde, hasta)]);
  return { ...lectura, datos: conIgvDeLasVentas(lectura.datos, error ? null : leerFilasIgvVentas(data), cuadre.falla ? null : cuadre.datos), falla: null };
}
