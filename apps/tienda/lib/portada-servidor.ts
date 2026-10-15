import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { interpretarPortada, PORTADA_SIN_DATOS, type Portada } from "./portada";

/** La campaña que anuncia la tienda (la franja de arriba, la portada sin cuenta y el héroe del Inicio). Si la base no responde, sale
 *  sin campaña: un cliente nunca ve una página caída por la base. Una vez por petición: la franja y el héroe la comparten. */
export const leerPortada = cache(
  (): Promise<Portada> =>
    leerConRespaldo(
      "tienda_portada_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_portada() as portada`;
        return interpretarPortada(fila?.portada);
      },
      PORTADA_SIN_DATOS,
    ),
);
