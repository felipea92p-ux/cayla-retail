import "server-only";
import { createClient } from "@/lib/supabase/server";
import { esFirmaDesconocida } from "@/lib/plan-compra-propuesta-guardada";
import { RPC_PEDIDOS_CAMPANA, leerPedidosDeCampana, type PedidoDeCampana } from "@/lib/pedidos-campana-reglas";

// Compras ▸ Órdenes de compra ▸ «Pendientes de campaña» (ADR-0530): los pedidos que el Plan de campaña mandó a Compras, por `fn_pedidos_campana`. Todos los pendientes, y lo pedido o rectificado hace poco.
// Es un agregado de la pantalla, no su razón de ser: si la base todavía no tiene la función (la web se publicó antes que la migración) la sección simplemente no sale. Si FALLA (la base lenta o caída), la
// pantalla lo dice: quien compra no debe creer que «no hay nada pendiente» cuando lo que pasó es que no se pudo leer (principio 9).
export async function getPedidosDeCampana(): Promise<{ pedidos: PedidoDeCampana[]; falla: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_PEDIDOS_CAMPANA as never);
  if (error) {
    if (esFirmaDesconocida(error)) return { pedidos: [], falla: false };
    console.error(`${RPC_PEDIDOS_CAMPANA}: ${error.message}`);
    return { pedidos: [], falla: true };
  }
  return { pedidos: leerPedidosDeCampana(data) ?? [], falla: false };
}
