import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { base } from "./base";
import { interpretarCatalogo, type Catalogo } from "./catalogo";

/** Cuánto se comparte la misma respuesta del catálogo entre visitas (2026-10-15). Corto a propósito: un precio o una prenda que se
 *  publica se ve en medio minuto, y «Separar» vuelve a mirar precio y stock en la base, así que nunca se separa con un dato viejo. */
export const SEGUNDOS_DEL_CATALOGO = 30;

// Lo publicado en la Vitrina no es de nadie: toda persona que mira la misma tienda recibe lo mismo (`tienda_catalogo` solo recibe la
// tienda, nunca quién mira). Por eso se guarda en la caché de datos, por tienda, unos segundos: cien clientes abriendo el catálogo a
// la vez son una consulta a la base, no cien (la conexión de la tienda tiene pocas). Se guarda el JSON crudo de la base y se lee después
// (`interpretarCatalogo`), así una versión nueva de la tienda nunca recibe una copia armada por otra. Un fallo NO se guarda: se lanza
// adentro y se responde `null` afuera, para que la próxima visita lo vuelva a intentar.
const catalogoCompartido = unstable_cache(
  async (sedeId: string | null): Promise<unknown> => {
    const [fila] = await base()`select retail.tienda_catalogo(${sedeId}::uuid) as catalogo`;
    return fila?.catalogo ?? null;
  },
  ["tienda-catalogo-v1"],
  { revalidate: SEGUNDOS_DEL_CATALOGO },
);

/** Lo publicado en la Vitrina web, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web), con el de la
 *  campaña y el nivel de cada modelo en cada tienda. Si la base no responde (o responde algo raro), `null`: la página dice que no se
 *  pudo cargar el catálogo y se puede volver a intentar; nunca se cae. Una vez por petición y tienda: lo que lo pide más de una vez
 *  en la misma página lo comparte; entre visitas, la copia de `SEGUNDOS_DEL_CATALOGO`. */
export const leerCatalogo = cache(async (sedeId: string | null): Promise<Catalogo | null> => {
  try {
    return interpretarCatalogo(await catalogoCompartido(sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_catalogo_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});
