import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerFilasIgv, pasarAGestion, type FilaIgvGestion } from "@/lib/igv-gestion-reglas";
import type { FilaER } from "@/lib/resultados-reglas";

// El IGV de gestión (ADR-0620; contrato en 20261107034000_igv_de_gestion.sql). Solo LEE. `getEstadoResultados` no cambia: lo que es del libro sigue pidiéndolo a él.

type Lectura<T> = { datos: T; falla: string | null };

/** Por mes y unidad, el IGV incluido en las ventas de esas fechas y lo que dijo el líder. La base decide quién recibe el monto. */
export const getIgvDeGestion = cache(async function getIgvDeGestion(desde: string, hasta: string): Promise<Lectura<FilaIgvGestion[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_igv_de_gestion" as never, { p_desde: desde, p_hasta: hasta } as never);
  if (error) return { datos: [], falla: `No se pudo leer el IGV de gestión: ${error.message}` };
  return { datos: leerFilasIgv(data), falla: null };
});

/**
 * Las lecturas de una pantalla, en gestión. Van juntas, cada una con sus fechas: si el IGV de una no se puede leer, todas siguen en el libro y `falla` lo dice, para no comparar ventas con
 * IGV contra ventas sin IGV (`pasarAGestion`).
 */
export async function getResultadosDeGestion(tramos: readonly { desde: string; hasta: string; lectura: Lectura<FilaER[]> }[]): Promise<{ lecturas: Lectura<FilaER[]>[]; falla: string | null }> {
  const igv = await Promise.all(tramos.map((t) => (t.lectura.falla ? Promise.resolve(null) : getIgvDeGestion(t.desde, t.hasta))));
  return pasarAGestion(
    tramos.map((t) => t.lectura),
    igv,
  );
}
