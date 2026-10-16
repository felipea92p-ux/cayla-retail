import "server-only";
import { cache } from "react";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarSedes, SEDES_SIN_DATOS, type Sede } from "./tiendas";

/** Las tiendas de la web se comparten entre visitas un minuto (son las mismas para todos: Configuración ▸ Tienda web). */
const sedesCompartidas = lecturaCompartida("tienda-sedes-v1", 60, async () => {
  const [fila] = await db()`select retail.tienda_sedes() as sedes`;
  return fila?.sedes ?? null;
});

/** Las tiendas que se muestran en la web. Si la base no responde, ninguna: la portada sale sin «Nuestras tiendas» y la página
 *  de las tiendas lo dice en una línea; nunca una página caída por la base. Una vez por petición: lo que las pide más de una vez
 *  en la misma página las comparte. */
export const leerSedes = cache(async (): Promise<Sede[]> => {
  try {
    return interpretarSedes(await sedesCompartidas());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_sedes_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return SEDES_SIN_DATOS;
  }
});
