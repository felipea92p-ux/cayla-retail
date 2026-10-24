import "server-only";
import { leerConRespaldo } from "./base";
import { esLlaveDeVistaPrevia, interpretarVistaPrevia, type VistaPreviaDeCampana } from "./vista-previa-campana";

/** La vista previa de la llave del enlace, o `null`: llave que no es de las que crea el ERP, vencida, de una campaña que ya terminó o sin base.
 *  Cada visita pregunta a la base (sin caché compartida: la llave es privada y el diseño es lo que el líder acaba de guardar). */
export async function leerVistaPrevia(llave: string): Promise<VistaPreviaDeCampana | null> {
  if (!esLlaveDeVistaPrevia(llave)) return null;
  const crudo = await leerConRespaldo(
    "tienda_vista_previa_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_diseno_campana_previa(${llave}) as vista`;
      return fila?.vista ?? null;
    },
    null,
  );
  return interpretarVistaPrevia(crudo, process.env.TIENDA_FOTOS_ORIGEN);
}
