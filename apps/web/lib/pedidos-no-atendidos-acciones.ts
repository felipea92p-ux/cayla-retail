import { createClient } from "@/lib/supabase/client";
import type { ErrorEscritura } from "@/lib/error-escritura";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { argsRegistrarPedido, type DatosPedidoNoAtendido } from "@/lib/se-probo-reglas";

// La escritura de «Pedidos no atendidos» desde el navegador: «Anotar que no había» (modal de talla y Cambios) y, cuando
// se integre en Cobrar, «¿Se la probó y no la llevó?» al quitar una prenda del ticket (ADR-0288 D-6). Una función por
// RPC, para que la pantalla no sepa de Supabase. Lo que se puede anotar lo decide la base (`registrar_pedido_no_atendido`,
// 20260930240000): candado de ubicación, motivo y razón válidos; firma el responsable del combo (`fn_actor_persona_id(true)`).

export type ResultadoPedido = { id: string | null; error: ErrorEscritura };

/**
 * Anota «buscó y no había» (`motivo: "no_habia_talla"`) o «se la probó y no la llevó» (`motivo: "se_probo_no_llevo"`, con
 * su razón opcional). Sin producto ni descripción no llama a la base: devuelve el mismo rechazo que ella daría.
 */
export async function registrarPedidoNoAtendido(datos: DatosPedidoNoAtendido, firma: Firma | null): Promise<ResultadoPedido> {
  const args = argsRegistrarPedido(datos);
  if (!args) {
    return {
      id: null,
      error: { message: "Anota el modelo del catálogo o describe lo que pidió el cliente", code: "P0001", details: "", hint: "" },
    };
  }
  const { data, error } = await firmar(createClient().rpc("registrar_pedido_no_atendido", args), firma);
  return { id: (data as string | null) ?? null, error };
}
