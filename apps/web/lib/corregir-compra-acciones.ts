import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { RPC_COMPRA_PARA_CORREGIR, RPC_CORREGIR_COMPRA, leerCompraParaCorregir, type CompraParaCorregir } from "@/lib/corregir-compra-reglas";

// «Corregir una compra» (ADR-0561): lo que la hoja le pide a la base desde el navegador. Leer es `fn_` (lectura: sin el loader a pantalla completa).
// Corregir lleva un identificador que nace al abrir la hoja: un doble clic o un reintento tras un corte devuelve lo que ya quedó (`ya_estaba`).
// Solo con la cuenta de una persona (Mis compras no se muestra desde una terminal): firma ella, sin combo.

export type { ErrorDeBase };

/** La compra con sus prendas, tal como está hoy. `compra: null` y sin error = la base respondió algo que no se entiende. */
export async function cargarCompraParaCorregir(papelId: string): Promise<{ compra: CompraParaCorregir | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(
    createClient().rpc(RPC_COMPRA_PARA_CORREGIR as never, { p_papel_id: papelId } as never),
    firmaOmitida("compra_corregir"),
  )) as unknown as { data: unknown; error: ErrorDeBase };
  if (error) return { compra: null, error };
  return { compra: leerCompraParaCorregir(data), error: null };
}

export async function corregirCompra(
  args: { p_papel_id: string; p_lote: string; p_cambios: Record<string, unknown>[] },
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_CORREGIR_COMPRA as never, args as never), firmaOmitida("compra_corregir"));
  return { error: error ?? null };
}
