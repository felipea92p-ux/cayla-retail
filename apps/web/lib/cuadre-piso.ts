import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { RPC_ESTADO, leerEstadoCuadre, type EstadoCuadre } from "@/lib/cuadre-piso-reglas";

// Lecturas del servidor para «Cuadrar el piso» (ADR-0328). Solo LEE y solo por funciones de la base: la fecha del último cuadre
// de una sede sale de `fn_cuadre_piso_estado` (20261004200100). La previsualización y el cuadre los pide el navegador (la lista
// escaneada vive en él), con la firma del responsable.

/**
 * El último cuadre del piso de una sede: `{ estado }` (con `cuadradoEn` nulo si nunca se cuadró) o `{ fallo }` si no se pudo
 * leer — por ejemplo, una web publicada antes que la migración. La pantalla lo dice y no ofrece cuadrar: confirmar fallaría con
 * «Could not find the function» después de escanear todo el almacén.
 */
export async function getCuadrePisoEstado(ubicacionId: string): Promise<{ estado: EstadoCuadre; fallo: null } | { estado: null; fallo: string }> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc(RPC_ESTADO as never, { p_ubicacion_id: ubicacionId } as never), "el cuadre del piso de esta sede");
  const estado = fallo ? null : leerEstadoCuadre(datos);
  if (!estado) {
    if (fallo) console.error(fallo);
    return { estado: null, fallo: "No se pudo leer el cuadre del piso de esta sede. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { estado, fallo: null };
}
