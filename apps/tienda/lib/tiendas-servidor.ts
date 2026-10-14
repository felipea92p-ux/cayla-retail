import "server-only";
import { leerConRespaldo } from "./base";
import { interpretarSedes, SEDES_SIN_DATOS, type Sede } from "./tiendas";

/** Las tiendas que se muestran en la web. Si la base no responde, ninguna: la portada sale sin «Nuestras tiendas» y la página
 *  de las tiendas lo dice en una línea; nunca una página caída por la base. */
export const leerSedes = (): Promise<Sede[]> =>
  leerConRespaldo(
    "tienda_sedes_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_sedes() as sedes`;
      return interpretarSedes(fila?.sedes);
    },
    SEDES_SIN_DATOS,
  );
