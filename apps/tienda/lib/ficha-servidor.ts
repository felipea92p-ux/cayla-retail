import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { interpretarFicha, type Ficha } from "./ficha";

/** La ficha de una prenda publicada, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web), con su nivel
 *  en cada tienda. `"no_esta"` si ese modelo no se ve en la web; `null` si la base no responde (la página dice que no se pudo cargar
 *  y se puede volver a intentar; nunca se cae). Una vez por petición: la página y su título la comparten. */
export const leerFicha = cache(
  (productoId: string, sedeId: string | null): Promise<Ficha | "no_esta" | null> =>
    leerConRespaldo(
      "tienda_ficha_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_ficha(${productoId}::uuid, ${sedeId}::uuid) as ficha`;
        return interpretarFicha(fila?.ficha ?? null);
      },
      null,
    ),
);
