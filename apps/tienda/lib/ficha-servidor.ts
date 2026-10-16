import "server-only";
import { cache } from "react";
import { leerConRespaldo } from "./base";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarFicha, interpretarSeparadas, type Ficha } from "./ficha";

// La ficha es la misma para todos los que miran esa prenda en esa tienda (no lleva nada de quién mira): se comparte entre visitas el
// mismo tiempo que el catálogo. Era la lectura más pedida de la tienda en producción (735 de las primeras lecturas, 2026-10-16).
// «Separar» vuelve a mirar precio y stock en la base, así que nunca se separa con un dato viejo.
const fichaCompartida = lecturaCompartida("tienda-ficha-v1", SEGUNDOS_DEL_CATALOGO, async (productoId: string, sedeId: string | null) => {
  const [fila] = await db()`select retail.tienda_ficha(${productoId}::uuid, ${sedeId}::uuid) as ficha`;
  return fila?.ficha ?? null;
});

/** La ficha de una prenda publicada, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web), con su nivel
 *  en cada tienda. `"no_esta"` si ese modelo no se ve en la web; `null` si la base no responde (la página dice que no se pudo cargar
 *  y se puede volver a intentar; nunca se cae). Una vez por petición: la página y su título la comparten. */
export const leerFicha = cache(async (productoId: string, sedeId: string | null): Promise<Ficha | "no_esta" | null> => {
  try {
    return interpretarFicha(await fichaCompartida(productoId, sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_ficha_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});

/** La propuesta k: las tallas del modelo cuyo resto en la tienda `sedeId` ya separaron OTROS clientes en la web y la tienda todavía no
 *  confirma (`tienda_separadas_por_otros`, 20261015044000: solo un sí o un no por talla, nunca la cifra ni quién). Si la base no
 *  responde, ninguna: el aviso es una ayuda y la ficha se ve igual. */
export const leerSeparadasPorOtros = (usuarioWebId: string, productoId: string, sedeId: string): Promise<Set<string>> =>
  leerConRespaldo(
    "tienda_separadas_por_otros_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_separadas_por_otros(${usuarioWebId}::uuid, ${productoId}::uuid, ${sedeId}::uuid) as r`;
      return interpretarSeparadas(fila?.r ?? null);
    },
    new Set<string>(),
  );
