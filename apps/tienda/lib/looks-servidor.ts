import "server-only";
import { cache } from "react";
import { SEGUNDOS_DEL_CATALOGO } from "./catalogo-servidor";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarLook, interpretarLooks, type Look } from "./looks";

// Los looks son los mismos para todos los que miran la misma tienda y llevan el precio del catálogo: se comparten entre visitas el
// mismo tiempo que el catálogo. `tienda_looks` arma el catálogo entero por dentro (1,6 s de media en producción, 2026-10-16) y se pedía
// en cada Inicio, en «Arma tu look» y en cada ficha; ahora, una vez cada medio minuto por tienda.
const looksCompartidos = lecturaCompartida("tienda-looks-v1", SEGUNDOS_DEL_CATALOGO, async (sedeId: string | null) => {
  const [fila] = await db()`select retail.tienda_looks(${sedeId}::uuid) as looks`;
  return fila?.looks ?? null;
});
const lookCompartido = lecturaCompartida("tienda-look-v1", SEGUNDOS_DEL_CATALOGO, async (id: string, sedeId: string | null) => {
  const [fila] = await db()`select retail.tienda_look(${id}::uuid, ${sedeId}::uuid) as look`;
  return fila?.look ?? null;
});

/** «Arma tu look»: los looks que se ven, al precio de la tienda `sedeId` (o, sin ella, al mayor entre las tiendas de la web). Si la base no
 *  responde (o responde algo raro), `null`: la página dice que no se pudieron cargar y se puede volver a intentar; nunca se cae. Una vez
 *  por petición y tienda. */
export const leerLooks = cache(async (sedeId: string | null): Promise<{ sede: string | null; looks: Look[] } | null> => {
  try {
    return interpretarLooks(await looksCompartidos(sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_looks_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});

/** Un look con las tallas de cada prenda (`look: null` si ya no se ve). Una sola lectura por visita aunque la pidan el título y la página
 *  (`cache` de React, por petición). */
export const leerLook = cache(async (id: string, sedeId: string | null): Promise<{ sede: string | null; look: Look | null } | null> => {
  try {
    return interpretarLook(await lookCompartido(id, sedeId));
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_look_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});
