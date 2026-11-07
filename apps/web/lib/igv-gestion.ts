import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerFilasIgv, montoDichoDelMes, pasarAGestion, type FilaIgvGestion } from "@/lib/igv-gestion-reglas";
import { rangoMes } from "@/lib/gastos-reglas";
import { getUnidadesCerradas } from "@/lib/resultados";
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

/** El IGV de todo el hilo de meses: una sola lectura para los trece (ADR-0450). `getIgvDeGestion` va con `cache`: la cabecera y la línea de una misma pantalla comparten la respuesta y su suerte. */
export async function getIgvDelHilo(meses: readonly { desde: string; hasta: string }[]): Promise<Lectura<FilaIgvGestion[]>> {
  return meses.length ? getIgvDeGestion(meses[0]!.desde, meses.at(-1)!.hasta) : { datos: [], falla: null };
}

/**
 * Las lecturas de una pantalla, en gestión. Van juntas, cada una con sus fechas: si el IGV de una no se puede leer, todas siguen en el libro y `falla` lo dice, para no comparar ventas con
 * IGV contra ventas sin IGV (`pasarAGestion`). `hilo`: la lectura de la línea de los meses, si la pantalla la dibuja.
 */
export async function getResultadosDeGestion(tramos: readonly { desde: string; hasta: string; lectura: Lectura<FilaER[]> }[], hilo: Lectura<FilaIgvGestion[]> | null = null): Promise<{ lecturas: Lectura<FilaER[]>[]; falla: string | null }> {
  const igv = await Promise.all(tramos.map((t) => (t.lectura.falla ? Promise.resolve(null) : getIgvDeGestion(t.desde, t.hasta))));
  return pasarAGestion(
    tramos.map((t) => t.lectura),
    igv,
    hilo,
  );
}

/** Para la hoja de Impuestos: lo dicho del mes y si ya tiene una unidad cerrada. Sin la lectura, `null`: la pantalla no ofrece un monto que no pudo leer. */
export async function getIgvDichoDelMes(mes: string): Promise<{ monto: number | null; cerrado: boolean } | null> {
  const { desde, hasta } = rangoMes(mes);
  const [igv, cerradas] = await Promise.all([getIgvDeGestion(desde, hasta), getUnidadesCerradas(mes)]);
  if (igv.falla) return null;
  return { monto: montoDichoDelMes(igv.datos, mes), cerrado: cerradas.length > 0 };
}
