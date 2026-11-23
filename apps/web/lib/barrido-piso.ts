import { createClient } from "@/lib/supabase/server";
import { tolerar } from "@/lib/resultado";
import {
  RPC_DETALLE_BARRIDO,
  RPC_ESTADO_BARRIDO,
  RPC_HISTORIAL_BARRIDOS,
  RPC_POR_RESOLVER_BARRIDO,
  leerDetalleBarrido,
  leerEstadoBarrido,
  leerHistorial,
  leerPorResolver,
  type DetalleBarrido,
  type EstadoBarrido,
  type FilaHistorial,
  type PorResolver,
} from "@/lib/barrido-piso-reglas";

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

/**
 * Lo que los barridos confirmados de la sede dejaron por resolver (actividad 8). Si no se puede leer —una web publicada antes que su
 * migración— la sección no se dibuja: el barrido sigue funcionando igual.
 */
export async function getPorResolver(ubicacionId: string): Promise<PorResolver | null> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc(RPC_POR_RESOLVER_BARRIDO as never, { p_ubicacion_id: ubicacionId } as never), "lo que el barrido dejó por resolver");
  if (fallo) {
    console.error(fallo);
    return null;
  }
  return leerPorResolver(datos);
}

/** Los barridos de la sede para el historial (actividad 9), o `{ fallo }` si no se pudo leer (una web publicada antes que su migración). */
export async function getHistorialBarridos(ubicacionId: string): Promise<{ historial: { barridos: FilaHistorial[]; total: number }; fallo: null } | { historial: null; fallo: string }> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc(RPC_HISTORIAL_BARRIDOS as never, { p_ubicacion_id: ubicacionId, p_limite: 100 } as never), "el historial de barridos");
  if (fallo) {
    console.error(fallo);
    return { historial: null, fallo: "No se pudo leer el historial de barridos de esta tienda. Vuelve a intentarlo en un momento." };
  }
  return { historial: leerHistorial(datos), fallo: null };
}

/** Un barrido del historial, o `null` si no existe, es de otra sede o no se pudo leer. */
export async function getDetalleBarrido(barridoId: string): Promise<DetalleBarrido | null> {
  const supabase = await createClient();
  const { datos, fallo } = tolerar(await supabase.rpc(RPC_DETALLE_BARRIDO as never, { p_barrido_id: barridoId } as never), "un barrido del historial");
  if (fallo) {
    console.error(fallo);
    return null;
  }
  return leerDetalleBarrido(datos);
}
