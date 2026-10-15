import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_ORDENES_INSUMO_POR_RECIBIR, leerOrdenesPorRecibir, type OrdenInsumoPorRecibir } from "@/lib/recepcion-orden-insumo-reglas";

// Recibir en el Taller contra la orden de insumos (ADR-0362, fase 7 parte 2 · actividad 3): la lectura del servidor para Producción ▸
// Recibir. Pide el módulo de Producción y poder operar en el taller (lo exige la función). Si la base no responde —o todavía no tiene la
// función: la web publicada antes que la migración—, lo dice (principio 9) y la pantalla sigue mostrando los papeles de siempre.

// La RPC es nueva y los tipos generados todavía no la conocen: se lee como `unknown` y se valida en `recepcion-orden-insumo-reglas.ts`.
// La llamada nombra su constante (`.rpc(RPC_X as never, …)`): así la lee la prueba de cobertura de roles.
type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function getOrdenesInsumoPorRecibir(tallerId: string): Promise<{ ordenes: OrdenInsumoPorRecibir[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await (supabase.rpc(RPC_ORDENES_INSUMO_POR_RECIBIR as never, { p_ubicacion_id: tallerId } as never) as unknown as Respuesta);
  if (error) {
    console.error(`${RPC_ORDENES_INSUMO_POR_RECIBIR}: ${error.message}`);
    return { ordenes: [], falla: "No se pudieron leer las órdenes de insumos por recibir. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { ordenes: leerOrdenesPorRecibir(data), falla: null };
}
