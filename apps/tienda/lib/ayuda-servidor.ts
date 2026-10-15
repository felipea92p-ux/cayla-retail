import "server-only";
import { cache } from "react";
import { PLAZOS_SIN_DATOS, interpretarAyuda, type Plazos } from "./ayuda";
import { leerConRespaldo } from "./base";

/** Los plazos de las páginas de ayuda («Cómo separar», «Cambios y devoluciones»). Si la base no responde, sin plazos: la página los
 *  dice sin número, nunca uno inventado. */
export const leerAyuda = cache(
  (): Promise<Plazos> =>
    leerConRespaldo(
      "tienda_ayuda_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_ayuda() as ayuda`;
        return interpretarAyuda(fila?.ayuda);
      },
      PLAZOS_SIN_DATOS,
    ),
);
