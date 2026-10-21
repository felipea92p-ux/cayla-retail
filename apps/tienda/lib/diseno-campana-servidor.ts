import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { db, lecturaCompartida } from "./compartido-servidor";
import { interpretarDisenoCampana, type DisenoDeLaTienda } from "./diseno-campana";

/** El diseño se comparte entre visitas un minuto, como la campaña (lo que se programa en el ERP se ve en menos de un minuto). */
const disenoCompartido = lecturaCompartida("tienda-diseno-campana-v1", 60, async () => {
  const [fila] = await db()`select retail.tienda_diseno_campana() as diseno`;
  return fila?.diseno ?? null;
});

// Dos capas, igual que la portada (ADR-0432): lo crudo se guarda entre instancias y `"use cache"` deja armar la página por adelantado. Sin base no se
// lanza el error (Next daría por rota la página que se arma por adelantado): se devuelve `null`, la tienda se ve como siempre y esa copia dura segundos.
async function disenoGuardado(): Promise<unknown> {
  "use cache";
  try {
    const crudo = await disenoCompartido();
    cacheLife({ stale: 300, revalidate: 60, expire: 3600 });
    return crudo;
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_diseno_campana_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    cacheLife({ stale: 300, revalidate: 5, expire: 3600 });
    return null;
  }
}

/** El diseño de la campaña que anuncia la portada (`nombre`), o `null`: sin diseño, sin base o con un diseño que no se sabe pintar, la tienda
 *  se ve como siempre. Una vez por petición: la franja y el héroe lo comparten. */
export const leerDisenoDeCampana = cache(async (nombre: string | null | undefined): Promise<DisenoDeLaTienda | null> => {
  if (!nombre) return null;
  try {
    return interpretarDisenoCampana(await disenoGuardado(), nombre);
  } catch (error) {
    console.error(JSON.stringify({ evento: "tienda_diseno_campana_fallo", mensaje: error instanceof Error ? error.message : String(error) }));
    return null;
  }
});
