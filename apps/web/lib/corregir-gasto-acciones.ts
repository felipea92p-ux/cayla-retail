import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { firmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { leerCorrecciones, type CorreccionHecha } from "@/lib/corregir-compra-reglas";
import {
  RPC_CORREGIR_GASTO,
  RPC_GASTO_CORRECCIONES,
  RPC_GASTO_PARA_CORREGIR,
  leerGastoParaCorregir,
  type GastoParaCorregir,
} from "@/lib/corregir-gasto-reglas";

// «Corregir un gasto de otra cosa» (ADR-0572): lo que la hoja le pide a la base desde el navegador. Leer es `fn_` (lectura: sin el loader a pantalla completa).
// Corregir lleva un identificador que nace al abrir la hoja: un doble clic o un reintento tras un corte devuelve lo que ya quedó (`ya_estaba`).
// Solo con la cuenta de una persona (Mis compras no se muestra desde una terminal): firma ella, sin combo.

export type { ErrorDeBase };

/** El gasto tal como está hoy. `gasto: null` y sin error = la base respondió algo que no se entiende. */
export async function cargarGastoParaCorregir(gastoId: string): Promise<{ gasto: GastoParaCorregir | null; error: ErrorDeBase }> {
  const { data, error } = (await firmar(
    createClient().rpc(RPC_GASTO_PARA_CORREGIR as never, { p_gasto_id: gastoId } as never),
    firmaOmitida("gasto_corregir"),
  )) as unknown as { data: unknown; error: ErrorDeBase };
  if (error) return { gasto: null, error };
  return { gasto: leerGastoParaCorregir(data), error: null };
}

export async function corregirGasto(args: {
  p_gasto_id: string;
  p_lote: string;
  p_concepto: string;
  p_nota: string | null;
  p_monto: number;
  p_foto_ruta: string | null;
}): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_CORREGIR_GASTO as never, args as never), firmaOmitida("gasto_corregir"));
  return { error: error ?? null };
}

/** Lo que se corrigió de un gasto (de lo más nuevo a lo más viejo). Es un dato secundario: si no se puede leer, no se muestra nada. */
export async function cargarCorreccionesDeGasto(gastoId: string): Promise<CorreccionHecha[]> {
  const { data, error } = (await createClient().rpc(RPC_GASTO_CORRECCIONES as never, { p_gasto_id: gastoId } as never)) as unknown as {
    data: unknown;
    error: ErrorDeBase;
  };
  return error ? [] : leerCorrecciones(data);
}
