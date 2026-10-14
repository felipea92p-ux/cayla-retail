import "server-only";
import { leerConRespaldo } from "./base";
import { interpretarCatalogo, type Prenda } from "./catalogo";

/** Lo publicado en la Vitrina web, con su precio web y el de la campaña. Si la base no responde (o responde algo raro), `null`: la
 *  página dice que no se pudo cargar el catálogo y se puede volver a intentar; nunca se cae. */
export const leerCatalogo = (): Promise<Prenda[] | null> =>
  leerConRespaldo(
    "tienda_catalogo_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_catalogo() as catalogo`;
      return interpretarCatalogo(fila?.catalogo);
    },
    null,
  );
