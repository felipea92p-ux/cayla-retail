import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ArgsCrearOrden, ArgsEditarOrden } from "@/lib/orden-compra-alta";
import { RPC_ANULAR_ORDEN, RPC_CREAR_ORDEN, RPC_EDITAR_ORDEN } from "@/lib/ordenes-compra-reglas";

// Órdenes de compra (ADR-0362): lo que la pantalla le pide a la base para guardar. Las reglas viven en la función; aquí solo se arma
// la llamada con su firma: con la cuenta de una persona, `firmaOmitida("orden_compra_crear")` o `("orden_compra_editar")` (firma ella,
// sin combo); desde una terminal, la del combo «Responsable» (decisión 39).

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

/** Guarda los cambios de una orden «generada». `version` es la que devolvió la base: igual a la de antes si no había nada que cambiar
 *  (o si era un pedido repetido que ya estaba guardado). Si otra persona guardó antes, `error` trae PT409 (`esVersionCambiada`). */
export async function editarOrdenCompra(
  args: ArgsEditarOrden,
  firma: Firma | FirmaOmitida | null,
): Promise<{ numero: number | null; version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_EDITAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { numero?: unknown; version?: unknown } | undefined) : undefined;
  return {
    numero: typeof fila?.numero === "number" ? fila.numero : null,
    version: typeof fila?.version === "number" ? fila.version : null,
    error: error ?? null,
  };
}

/** Anula una orden «generada» con su motivo. Con la versión que se vio: si otra persona la cambió antes, `error` trae PT409. El mismo
 *  pedido repetido (doble clic) devuelve la orden ya anulada, sin error. */
export async function anularOrdenCompra(
  args: { p_id: string; p_version_esperada: number; p_motivo: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ version: number | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_ANULAR_ORDEN as never, args as never), firma);
  const fila = Array.isArray(data) ? (data[0] as { version?: unknown } | undefined) : undefined;
  return { version: typeof fila?.version === "number" ? fila.version : null, error: error ?? null };
}
