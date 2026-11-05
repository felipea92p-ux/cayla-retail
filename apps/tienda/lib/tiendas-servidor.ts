import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarSedes, SEDES_SIN_DATOS, type Sede } from "./tiendas";

/** Las tiendas de la web se comparten entre visitas un minuto (son las mismas para todos: Configuración ▸ Tienda web). */
const sedesCompartidas = lecturaCompartida("tienda-sedes-v1", 60, async () => {
  const [fila] = await db()`select retail.tienda_sedes() as sedes`;
  return fila?.sedes ?? null;
});

async function sedesGuardadas(): Promise<unknown> {
  "use cache";
  try {
    const cruda = await sedesCompartidas();
    cacheLife({ stale: 300, revalidate: 60, expire: 3600 });
    return cruda;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos, no minutos.
    console.error(JSON.stringify({ evento: "tienda_sedes_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** Las tiendas que se muestran en la web. Si la base no responde, ninguna: la portada sale sin «Nuestras tiendas» y la página
 *  de las tiendas lo dice en una línea; nunca una página caída por la base. Una vez por petición: lo que las pide más de una vez
 *  en la misma página las comparte. */
export const leerSedes = cache(async (): Promise<Sede[]> => {
  try {
    return interpretarSedes(await sedesGuardadas(), process.env.TIENDA_FOTOS_ORIGEN);
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_sedes_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return SEDES_SIN_DATOS;
  }
});
