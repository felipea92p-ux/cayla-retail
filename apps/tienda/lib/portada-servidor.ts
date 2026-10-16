import "server-only";
import { cache } from "react";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarPortada, PORTADA_SIN_DATOS, type Portada } from "./portada";

/** La campaña se comparte entre visitas un minuto (es la misma para todos; lo que se cambia en el ERP se ve en menos de un minuto). */
const portadaCompartida = lecturaCompartida("tienda-portada-v1", 60, async () => {
  const [fila] = await db()`select retail.tienda_portada() as portada`;
  return fila?.portada ?? null;
});

/** La campaña que anuncia la tienda (la franja de arriba, la portada sin cuenta y el héroe del Inicio). Si la base no responde, sale
 *  sin campaña: un cliente nunca ve una página caída por la base. Una vez por petición: la franja y el héroe la comparten. */
export const leerPortada = cache(async (): Promise<Portada> => {
  try {
    return interpretarPortada(await portadaCompartida());
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_portada_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return PORTADA_SIN_DATOS;
  }
});
