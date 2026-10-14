import "server-only";
import { leerConRespaldo } from "./base";
import { interpretarPortada, PORTADA_SIN_DATOS, type Portada } from "./portada";

/** La portada sin cuenta. Si la base no responde, sale sin campaña: un cliente nunca ve una página caída por la base. */
export const leerPortada = (): Promise<Portada> =>
  leerConRespaldo(
    "tienda_portada_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_portada() as portada`;
      return interpretarPortada(fila?.portada);
    },
    PORTADA_SIN_DATOS,
  );
