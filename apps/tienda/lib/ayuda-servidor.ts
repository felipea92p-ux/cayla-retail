import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { PLAZOS_SIN_DATOS, interpretarAyuda, type Plazos } from "./ayuda";
import { db, lecturaCompartida } from "./compartido-servidor";

/** Los plazos se comparten entre visitas cinco minutos (son los mismos para todos y cambian muy de vez en cuando). */
const ayudaCompartida = lecturaCompartida("tienda-ayuda-v1", 300, async () => {
  const [fila] = await db()`select retail.tienda_ayuda() as ayuda`;
  return fila?.ayuda ?? null;
});

async function ayudaGuardada(): Promise<unknown> {
  "use cache";
  try {
    const cruda = await ayudaCompartida();
    cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
    return cruda;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos, no minutos.
    console.error(JSON.stringify({ evento: "tienda_ayuda_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** Los plazos de las páginas de ayuda («Cómo separar», «Cambios y devoluciones»). Si la base no responde, sin plazos: la página los
 *  dice sin número, nunca uno inventado. */
export const leerAyuda = cache(async (): Promise<Plazos> => {
  try {
    return interpretarAyuda(await ayudaGuardada());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_ayuda_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return PLAZOS_SIN_DATOS;
  }
});
