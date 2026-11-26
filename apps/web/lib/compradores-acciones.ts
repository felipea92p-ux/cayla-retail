import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { RPC_CERRAR_RONDA_SIN_MOVIMIENTO } from "@/lib/compradores-reglas";

// Compradores (ADR-0704): lo que la hoja «Cerrar su ronda» le pide a la base. La regla vive en `cerrar_ronda_sin_movimiento`
// (20261126152000): solo una ronda sin nada adentro. Con la cuenta de una persona firma ella (`firmaOmitida("ronda_cerrar_sin_movimiento")`);
// desde una terminal, la del combo «Responsable».

export async function cerrarRondaSinMovimiento(rondaId: string, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_CERRAR_RONDA_SIN_MOVIMIENTO as never, { p_ronda: rondaId } as never), firma);
  return { error: error ?? null };
}
