import "server-only";
import { cache } from "react";
import { PLAZOS_SIN_DATOS, interpretarAyuda, type Plazos } from "./ayuda";
import { db, lecturaCompartida } from "./compartido-servidor";

/** Los plazos se comparten entre visitas cinco minutos (son los mismos para todos y cambian muy de vez en cuando). */
const ayudaCompartida = lecturaCompartida("tienda-ayuda-v1", 300, async () => {
  const [fila] = await db()`select retail.tienda_ayuda() as ayuda`;
  return fila?.ayuda ?? null;
});

/** Los plazos de las páginas de ayuda («Cómo separar», «Cambios y devoluciones»). Si la base no responde, sin plazos: la página los
 *  dice sin número, nunca uno inventado. */
export const leerAyuda = cache(async (): Promise<Plazos> => {
  try {
    return interpretarAyuda(await ayudaCompartida());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_ayuda_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return PLAZOS_SIN_DATOS;
  }
});
