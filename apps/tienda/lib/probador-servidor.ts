import "server-only";
import { cache } from "react";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida } from "./compartido-servidor";
import type { Prenda } from "./catalogo";
import { hayParaProbar, interpretarProbador, type LecturaProbador } from "./probador";

// Lo del probador (ADR-0434, actividad 4) es igual para todos los que miran la misma tienda: el largo, los recortes y el precio y el
// stock de cada color. Se comparte entre visitas el mismo medio minuto que el catálogo, con el que se junta en la página: cien clientes
// armando su look a la vez son una consulta a la base, no cien.
const probadorCompartido = lecturaCompartida("tienda-probador-v1", SEGUNDOS_DEL_CATALOGO, async (sedeId: string | null) => {
  const [fila] = await db()`select retail.tienda_probador(${sedeId}::uuid) as probador`;
  return fila?.probador ?? null;
});

/** Lo del probador para la tienda `sedeId` (o, sin ella, «Todas»). Si la base no responde (o responde algo raro), `null`: la página dice
 *  que no se pudo cargar y se puede volver a intentar; nunca se cae. Una vez por petición y tienda. */
export const leerProbador = cache(async (sedeId: string | null): Promise<LecturaProbador | null> => {
  try {
    return interpretarProbador(await probadorCompartido(sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_probador_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});

/** ¿La cabecera muestra «Arma el tuyo»? Solo si entre `prendas` (lo que se ve en la tienda elegida) hay algo que probar (`hayParaProbar`),
 *  con la lectura guardada de «Todas». Si la base no responde, no sale: es mejor una entrada menos que un probador que no abre. */
export async function hayAlgoParaProbar(prendas: readonly Prenda[]): Promise<boolean> {
  if (prendas.length === 0) return false;
  const lectura = await leerProbador(null);
  return lectura !== null && hayParaProbar(prendas, lectura);
}
