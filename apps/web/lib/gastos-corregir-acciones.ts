import { createClient } from "@/lib/supabase/client";
import { leerCorrecciones, type CorreccionHecha } from "@/lib/corregir-compra-reglas";
import { RPC_CORRECCIONES_DE_GASTO } from "@/lib/gastos-corregir-reglas";

// Corregir un gasto de Finanzas (ADR-0588): lo que se le pide a la base desde el navegador. Leer el rastro es `fn_` (lectura: sin el loader a
// pantalla completa). Corregir lo firma el responsable del combo, como anular: vive en la hoja.

/** Lo que se corrigió de un gasto (de lo más nuevo a lo más viejo). Es un dato secundario: si no se puede leer, no se muestra nada. */
export async function cargarCorreccionesDeGastoFinanzas(gastoId: string): Promise<CorreccionHecha[]> {
  const { data, error } = (await createClient().rpc(RPC_CORRECCIONES_DE_GASTO as never, { p_gasto_id: gastoId } as never)) as unknown as {
    data: unknown;
    error: unknown;
  };
  return error ? [] : leerCorrecciones(data);
}
