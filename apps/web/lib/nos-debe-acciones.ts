import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { leerResultadoResolucion, RPC_RESOLVER_DEUDA, type ArgsResolverDeuda, type ResultadoResolucion } from "@/lib/nos-debe-reglas";

// «Nos debe» (ADR-0362, fase 5a): lo que la pantalla le pide a la base. Las reglas viven en la función (Proveedores o Recibir, la cantidad de 1
// a lo pendiente, la nota, «saldo a favor» y «depósito» todavía no); aquí solo se arma la llamada con su firma, el combo «Responsable»
// (`fn_actor_persona_id(true)`), como toda función que guarda.

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

type Respuesta = { data: unknown; error: ErrorDeBase };

/** «Llegó la reposición» a mano: cierra (en todo o en parte) una deuda del proveedor. El token hace seguro el reintento: no anota dos veces. */
export async function resolverDeudaProveedor(args: ArgsResolverDeuda, firma: Firma | null): Promise<{ resultado: ResultadoResolucion | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RESOLVER_DEUDA as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoResolucion(data), error: error ?? null };
}
