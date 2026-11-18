import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { interpretarCatalogo, type Catalogo } from "./catalogo";
import { db, lecturaPorHuella } from "./compartido-servidor";

/** Cada cuánto la tienda revisa si el catálogo cambió (2026-10-15). Corto a propósito: un precio o una prenda que se publica se ve en
 *  medio minuto, y «Separar» vuelve a mirar precio y stock en la base, así que nunca se separa con un dato viejo. Desde el 2026-11-13 lo
 *  que se revisa cada medio minuto es la huella (~18 ms en producción); el catálogo (~470 ms) solo se vuelve a pedir si cambió. */
export const SEGUNDOS_DEL_CATALOGO = 30;

// Lo publicado en la Vitrina no es de nadie: toda persona que mira la misma tienda recibe lo mismo (`tienda_catalogo` solo recibe la
// tienda, nunca quién mira). Por eso se guarda en la caché de datos, por tienda: cien clientes abriendo el catálogo a la vez son una
// consulta a la base, no cien (la conexión de la tienda tiene pocas). Se guarda el JSON crudo de la base y se lee después
// (`interpretarCatalogo`), así una versión nueva de la tienda nunca recibe una copia armada por otra. Un fallo NO se guarda: se lanza
// adentro y se responde `null` afuera, para que la próxima visita lo vuelva a intentar. Se vuelve a pedir a la base solo si cambió la
// huella (`lecturaPorHuella`), con una sola lectura en vuelo por proceso y tienda y 15 s sin pedirla tras un fallo (`una-a-la-vez.ts`).
const catalogoCompartido = lecturaPorHuella("tienda-catalogo-v2", SEGUNDOS_DEL_CATALOGO, async (conHuella, sedeId: string | null) => {
  const [fila] = conHuella
    ? await db()`select retail.tienda_catalogo(${sedeId}::uuid) as dato, retail.tienda_catalogo_version() as huella`
    : await db()`select retail.tienda_catalogo(${sedeId}::uuid) as dato`;
  return { dato: fila?.dato ?? null, huella: typeof fila?.huella === "string" ? fila.huella : null };
});

async function catalogoGuardado(sedeId: string | null): Promise<unknown> {
  "use cache";
  try {
    const cruda = await catalogoCompartido(sedeId);
    cacheLife({ stale: 300, revalidate: SEGUNDOS_DEL_CATALOGO, expire: 3600 });
    return cruda;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos, no minutos.
    console.error(JSON.stringify({ evento: "tienda_catalogo_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** Lo publicado en la Vitrina web, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web), con el de la
 *  campaña y el nivel de cada modelo en cada tienda. Si la base no responde (o responde algo raro), `null`: la página dice que no se
 *  pudo cargar el catálogo y se puede volver a intentar; nunca se cae. Una vez por petición y tienda: lo que lo pide más de una vez
 *  en la misma página lo comparte; entre visitas, la copia de `SEGUNDOS_DEL_CATALOGO`. */
export const leerCatalogo = cache(async (sedeId: string | null): Promise<Catalogo | null> => {
  try {
    return interpretarCatalogo(await catalogoGuardado(sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_catalogo_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});
