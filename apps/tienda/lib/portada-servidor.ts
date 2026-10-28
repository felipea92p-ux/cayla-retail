import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarPortada, PORTADA_SIN_DATOS, type Portada } from "./portada";

/** La campaña se comparte entre visitas un minuto (es la misma para todos; lo que se cambia en el ERP se ve en menos de un minuto). */
const portadaCompartida = lecturaCompartida("tienda-portada-v1", 60, async () => {
  const [fila] = await db()`select retail.tienda_portada() as portada`;
  return fila?.portada ?? null;
});

// Dos capas (ADR-0432): `unstable_cache` guarda el JSON crudo entre instancias de Vercel (una consulta a la base para todas), y
// `"use cache"` por encima deja que Next arme POR ADELANTADO la página que lo usa (una lectura sin `"use cache"` cuenta como dato de
// la petición y la página sale dinámica). Si la base no responde NO se lanza el error (Next daría por rota una página que se arma
// por adelantado, y con ella toda la publicación): se devuelve `null`, la página sale con su respaldo y esa copia dura 5 segundos,
// no el minuto de una respuesta buena. Lo mismo hacen las demás lecturas `*Guardada` de `lib/`.
async function portadaGuardada(): Promise<unknown> {
  "use cache";
  try {
    const cruda = await portadaCompartida();
    cacheLife({ stale: 300, revalidate: 60, expire: 3600 });
    return cruda;
  } catch (error) {
    // Sin base: no se lanza (Next daría por rota la página que se arma por adelantado) y el respaldo dura segundos, no minutos.
    console.error(JSON.stringify({ evento: "tienda_portada_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** La campaña que anuncia la tienda (la franja de arriba, la portada sin cuenta y el héroe del Inicio). Si la base no responde, sale
 *  sin campaña: un cliente nunca ve una página caída por la base. Una vez por petición: la franja y el héroe la comparten. */
export const leerPortada = cache(async (): Promise<Portada> => {
  try {
    return interpretarPortada(await portadaGuardada());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_portada_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return PORTADA_SIN_DATOS;
  }
});
