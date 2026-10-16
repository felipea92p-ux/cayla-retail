import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import { leerNotaProveedor, RPC_ADJUNTAR_NOTA_PROVEEDOR, type ArgsNotaProveedor, type NotaProveedorAdjunta } from "@/lib/nota-proveedor-reglas";

// «Llegó su nota de crédito» (ADR-0362, fase 5b, actividad 3): lo que la hoja le pide a la base. Las reglas viven en la función (el módulo Notas
// de crédito, documentos internos de una factura, serie, fecha y monto como el papel); aquí solo se arma la llamada con su firma, el combo
// «Responsable» (`fn_actor_persona_id(true)`), como toda función que guarda.

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

/** Adjunta la nota del proveedor. El token hace seguro el reintento: no adjunta dos veces. */
export async function adjuntarNotaProveedor(args: ArgsNotaProveedor, firma: Firma | null): Promise<{ nota: NotaProveedorAdjunta | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(createClient().rpc(RPC_ADJUNTAR_NOTA_PROVEEDOR as never, args as never), firma)) as { data: unknown; error: ErrorDeBase };
  return error ? { nota: null, error } : { nota: leerNotaProveedor(data), error: null };
}
