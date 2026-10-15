import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import {
  leerDocumentosInternos,
  leerResultadoResolucion,
  leerValorDeDeuda,
  RPC_DEUDA_VALOR,
  RPC_RESOLVER_DEUDA,
  type ArgsResolverDeuda,
  type DocumentoInterno,
  type ResultadoResolucion,
  type ValorDeDeuda,
} from "@/lib/nos-debe-reglas";

// «Nos debe» (ADR-0362, fases 5a y 5b): lo que la pantalla le pide a la base. Las reglas viven en la función (la reposición, con Proveedores o
// Recibir; pasar a saldo a favor, con Proveedores; la cantidad de 1 a lo pendiente; «depósito» todavía no); aquí solo se arma la llamada con su
// firma, el combo «Responsable» (`fn_actor_persona_id(true)`), como toda función que guarda.

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

type Respuesta = { data: unknown; error: ErrorDeBase };

/** «Llegó la reposición» a mano: cierra (en todo o en parte) una deuda del proveedor. El token hace seguro el reintento: no anota dos veces. */
export async function resolverDeudaProveedor(args: ArgsResolverDeuda, firma: Firma | null): Promise<{ resultado: ResultadoResolucion | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RESOLVER_DEUDA as never, args as never), firma)) as Respuesta;
  return { resultado: error ? null : leerResultadoResolucion(data), error: error ?? null };
}

/** «Pasar a saldo a favor» (fase 5b, actividad 1): el documento interno DI-… que baja la deuda del comprobante y deja el resto a favor. El token
 *  hace seguro el reintento: no registra dos documentos. */
export async function pasarDeudaASaldoAFavor(
  args: ArgsResolverDeuda,
  firma: Firma | null,
): Promise<{ resultado: ResultadoResolucion | null; documentos: DocumentoInterno[]; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_RESOLVER_DEUDA as never, args as never), firma)) as Respuesta;
  return error ? { resultado: null, documentos: [], error } : { resultado: leerResultadoResolucion(data), documentos: leerDocumentosInternos(data), error: null };
}

/** Cuánto vale pasar N prendas de una deuda a saldo a favor (una lectura: el loader no tapa la hoja). `null` si la base no contestó. */
export async function leerValorDeuda(diferenciaId: string, cantidad: number): Promise<ValorDeDeuda | null> {
  const { data, error } = (await createClient().rpc(RPC_DEUDA_VALOR as never, { p_diferencia_id: diferenciaId, p_cantidad: cantidad } as never)) as Respuesta;
  return error ? null : leerValorDeDeuda(data);
}
