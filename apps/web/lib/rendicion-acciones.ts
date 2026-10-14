import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import {
  RPC_APROBAR_RENDICION,
  RPC_DEVOLVER_RENDICION,
  RPC_MI_CICLO_FONDO,
  RPC_RENDICION_ITEMS,
  RPC_RENDIR_FONDO,
  leerItemsRendicion,
  type DecisionFaltante,
  type ItemRendicion,
} from "@/lib/rendicion-reglas";

// La rendición del fondo (ADR-0362, fase 6 · actividad 5): lo que las hojas le piden a la base. Las reglas viven en las funciones
// (20261013235000); aquí solo se arma la llamada con su firma. Rendir va SIEMPRE con la cuenta de su dueña (`fondo_rendir`: desde una
// terminal la base no deja); aprobar y devolver, con la cuenta de quien revisa (`fondo_rendicion_aprobar`, `fondo_rendicion_devolver`)
// o, desde una terminal, con el combo «Responsable». Las lecturas no piden el combo.

export type { ErrorDeBase };

/** Lo que la dueña todavía no rindió (`fn_mi_ciclo_fondo`), o las filas de una rendición (`fn_rendicion_fondo_items`). */
export async function leerItems(rendicionId: string | null): Promise<{ items: ItemRendicion[]; error: ErrorDeBase }> {
  const supabase = createClient();
  const { data, error } = rendicionId
    ? await supabase.rpc(RPC_RENDICION_ITEMS as never, { p_rendicion_id: rendicionId } as never)
    : await supabase.rpc(RPC_MI_CICLO_FONDO as never);
  return { items: error ? [] : leerItemsRendicion(data), error: error ?? null };
}

export async function rendirFondo(
  args: { p_efectivo: number; p_explicacion: string | null; p_token: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_RENDIR_FONDO as never, args as never), firma);
  return { id: typeof data === "string" ? data : null, error: error ?? null };
}

export async function aprobarRendicion(
  args: { p_id: string; p_decision: DecisionFaltante | null; p_nota: string | null },
  firma: Firma | FirmaOmitida | null,
): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_APROBAR_RENDICION as never, args as never), firma);
  return { error: error ?? null };
}

export async function devolverRendicion(args: { p_id: string; p_motivo: string }, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_DEVOLVER_RENDICION as never, args as never), firma);
  return { error: error ?? null };
}
