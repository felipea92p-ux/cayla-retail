import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerFilasOrdenes, RPC_LISTA_ORDENES, type OrdenCompraFila } from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362, fase 1): lectura del servidor, por `fn_ordenes_compra` (20261010214500). Quien tiene el módulo ve las
// órdenes de todas las sedes (decisiones 34 y 37); el candado vive en la función. Si la lectura falla —la web publicada antes que la
// migración, o la base caída—, lo dice (principio 9): nunca una lista vacía que parezca «no hay órdenes».
export async function listarOrdenesCompra(): Promise<{ filas: OrdenCompraFila[]; falla: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC_LISTA_ORDENES as never);
  if (error) {
    console.error(`${RPC_LISTA_ORDENES}: ${error.message}`);
    return { filas: [], falla: "No se pudieron leer las órdenes de compra. Vuelve a intentarlo en un momento; si sigue, avísale a tu líder." };
  }
  return { filas: leerFilasOrdenes(data), falla: null };
}
