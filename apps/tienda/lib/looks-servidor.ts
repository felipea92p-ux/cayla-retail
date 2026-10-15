import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { interpretarLook, interpretarLooks, type Look } from "./looks";

/** «Arma tu look»: los looks que se ven, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web). Si la base no
 *  responde (o responde algo raro), `null`: la página dice que no se pudieron cargar y se puede volver a intentar; nunca se cae. */
export const leerLooks = (sedeId: string | null): Promise<{ sede: string | null; looks: Look[] } | null> =>
  leerConRespaldo(
    "tienda_looks_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_looks(${sedeId}::uuid) as looks`;
      return interpretarLooks(fila?.looks);
    },
    null,
  );

/** Un look con las tallas de cada prenda (`look: null` si ya no se ve). Una sola lectura por visita aunque la pidan el título y la página
 *  (`cache` de React, por petición). */
export const leerLook = cache(
  (id: string, sedeId: string | null): Promise<{ sede: string | null; look: Look | null } | null> =>
    leerConRespaldo(
      "tienda_look_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_look(${id}::uuid, ${sedeId}::uuid) as look`;
        return interpretarLook(fila?.look);
      },
      null,
    ),
);
