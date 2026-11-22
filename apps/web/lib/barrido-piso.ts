import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import { RPC_ESTADO_BARRIDO, leerEstadoBarrido, type EstadoBarrido } from "@/lib/barrido-piso-reglas";

// Lecturas del servidor para «El barrido del piso» (ADR-0690). Solo LEE y solo por funciones de la base: el barrido abierto de la
// sede y lo que lleva sale de `fn_barrido_piso_estado` (20261122191000). Abrir y escanear los pide el navegador, con la firma de
// quien escanea.

/**
 * El barrido abierto de una sede (o ninguno): `{ estado }`, o `{ fallo }` si no se pudo leer — por ejemplo, una web publicada antes
 * que la migración. La pantalla lo dice y no ofrece empezar: escanear fallaría con «Could not find the function».
 */
export async function getBarridoEstado(ubicacionId: string): Promise<{ estado: EstadoBarrido; fallo: null } | { estado: null; fallo: string }> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc(RPC_ESTADO_BARRIDO as never, { p_ubicacion_id: ubicacionId } as never), "el barrido del piso de esta sede");
  if (fallo) {
    console.error(fallo);
    return { estado: null, fallo: "No se pudo leer el barrido del piso de esta tienda. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { estado: leerEstadoBarrido(datos), fallo: null };
}
