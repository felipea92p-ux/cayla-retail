import "server-only";
import { cache } from "react";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida, lecturaPorHuella } from "./compartido-servidor";
import type { Prenda } from "./catalogo";
import { hayParaProbar, interpretarProbador, type LecturaProbador } from "./probador";

// Lo del probador (ADR-0434, actividad 4) es igual para todos los que miran la misma tienda: el largo, los recortes y el precio y el
// stock de cada color. Se revisa el mismo medio minuto que el catálogo, con el que se junta en la página: cien clientes armando su look a
// la vez son una consulta a la base, no cien; y como el catálogo, se vuelve a pedir solo si cambió la huella (`lecturaPorHuella`, 2026-11-13).
const probadorCompartido = lecturaPorHuella("tienda-probador-v2", SEGUNDOS_DEL_CATALOGO, async (conHuella, sedeId: string | null) => {
  const [fila] = conHuella
    ? await db()`select retail.tienda_probador(${sedeId}::uuid) as dato, retail.tienda_catalogo_version() as huella`
    : await db()`select retail.tienda_probador(${sedeId}::uuid) as dato`;
  return { dato: fila?.dato ?? null, huella: typeof fila?.huella === "string" ? fila.huella : null };
});

// La cabecera de TODA página del catálogo pregunta «¿hay algo para probar?» para mostrar «Arma el tuyo» (2026-11-07). Con la lectura de medio
// minuto, cada página con la copia vencida relanzaba el probador entero (1,25 s de CPU en una base de 2 núcleos) solo para un sí o un no: fue
// la avalancha de ese día. Esa respuesta casi no cambia (una prenda gana su largo o su recorte), así que la cabecera lee su propia copia, de 10
// minutos; la que se toca en la página («Arma el tuyo», «Pruébatelo» de la ficha) sigue siendo la de medio minuto, con precio y stock al día.
const SEGUNDOS_DE_LA_CABECERA = 600;
const probadorDeLaCabecera = lecturaCompartida("tienda-probador-cabecera-v1", SEGUNDOS_DE_LA_CABECERA, async () => {
  const [fila] = await db()`select retail.tienda_probador(${null}::uuid) as probador`;
  return fila?.probador ?? null;
});

/** La lectura ya interpretada, o `null` (y una línea en el registro) si la base no respondió o respondió algo raro. */
async function interpretada(lectura: Promise<unknown>): Promise<LecturaProbador | null> {
  try {
    return interpretarProbador(await lectura);
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_probador_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

const leerProbadorDeLaCabecera = cache(() => interpretada(probadorDeLaCabecera()));

/** Lo del probador para la tienda `sedeId` (o, sin ella, «Todas»). Si la base no responde (o responde algo raro), `null`: la página dice
 *  que no se pudo cargar y se puede volver a intentar; nunca se cae. Una vez por petición y tienda. */
export const leerProbador = cache((sedeId: string | null) => interpretada(probadorCompartido(sedeId)));

/** ¿La cabecera muestra «Arma el tuyo»? Solo si entre `prendas` (lo que se ve en la tienda elegida) hay algo que probar (`hayParaProbar`),
 *  con la lectura de «Todas» guardada para la cabecera (10 minutos). Si la base no responde, no sale: es mejor una entrada menos que un probador que no abre. */
export async function hayAlgoParaProbar(prendas: readonly Prenda[]): Promise<boolean> {
  if (prendas.length === 0) return false;
  const lectura = await leerProbadorDeLaCabecera();
  return lectura !== null && hayParaProbar(prendas, lectura);
}
