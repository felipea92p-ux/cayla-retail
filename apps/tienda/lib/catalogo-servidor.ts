import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { interpretarCatalogo, type Catalogo } from "./catalogo";

/** Lo publicado en la Vitrina web, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web), con el de la
 *  campaña y el nivel de cada modelo en cada tienda. Si la base no responde (o responde algo raro), `null`: la página dice que no se
 *  pudo cargar el catálogo y se puede volver a intentar; nunca se cae. Una vez por petición y tienda: lo que lo pide más de una vez
 *  en la misma página lo comparte. */
export const leerCatalogo = cache(
  (sedeId: string | null): Promise<Catalogo | null> =>
    leerConRespaldo(
      "tienda_catalogo_fallo",
      async (db) => {
        const [fila] = await db`select retail.tienda_catalogo(${sedeId}::uuid) as catalogo`;
        return interpretarCatalogo(fila?.catalogo);
      },
      null,
    ),
);
