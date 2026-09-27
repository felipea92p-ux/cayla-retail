import { createClient } from "@/lib/supabase/server";
import { pedidoEntreSedesDeFila, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";

// «Pedir a otra sede» (ADR-0242 D-7, 20260927210000): los pedidos de reposición que la sede hizo o le hicieron.
// Solo la lectura server-side; las escrituras (`pedir_a_otra_sede`, `enviar_pedido_a_otra_sede`,
// `cancelar_pedido_a_otra_sede`) se llaman desde los componentes cliente, como el resto de Traslados.
//
// Es secundaria en la pantalla de Traslados: si la migración todavía no está en esta base (PGRST202) o la lectura
// falla, devuelve una lista vacía y la tarjeta simplemente no aparece — la lista de traslados no se cae por esto.
export async function getPedidosEntreSedes(ubicacionId: string): Promise<PedidoEntreSedes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pedidos_entre_sedes", { p_ubicacion_id: ubicacionId });
  if (error) {
    if (error.code !== "PGRST202") console.error("No se pudieron leer los pedidos entre sedes:", error.message);
    return [];
  }
  return (data ?? []).map((f) => pedidoEntreSedesDeFila(f as unknown as Record<string, unknown>));
}
