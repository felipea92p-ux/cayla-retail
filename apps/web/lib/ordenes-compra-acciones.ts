import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ArgsCrearOrden } from "@/lib/orden-compra-alta";
import { RPC_CREAR_ORDEN } from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362): lo que la pantalla le pide a la base para guardar. Las reglas viven en la función; aquí solo se arma
// la llamada con su firma: con la cuenta de una persona, `firmaOmitida("orden_compra_crear")` (firma ella, sin combo); desde una
// terminal, la del combo «Responsable» (decisión 39).

export type ErrorDeBase = { code?: string; message: string; hint?: string | null; details?: string | null } | null;

export async function crearOrdenCompra(
  args: ArgsCrearOrden,
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; numero: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_CREAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { id?: unknown; numero?: unknown } | undefined) : undefined;
  return {
    id: typeof fila?.id === "string" ? fila.id : null,
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    error: error ?? null,
  };
}
