import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { leerNoDeduciblesCon } from "@/lib/no-deducible";
import {
  RPC_APROBAR_RENDICION,
  RPC_DEVOLVER_RENDICION,
  RPC_MI_CICLO_FONDO,
  RPC_MI_RENDICION_ABIERTA,
  RPC_RENDICION_ITEMS,
  RPC_RENDIR_FONDO,
  leerItemsRendicion,
  leerMiRendicionAbierta,
  type DecisionFaltante,
  type ItemRendicion,
} from "@/lib/rendicion-reglas";

// La rendición del fondo (ADR-0362, fase 6 · actividad 5): lo que las hojas le piden a la base. Las reglas viven en las funciones
// (20261013235000); aquí solo se arma la llamada con su firma. Rendir va SIEMPRE con la cuenta de su dueña (`fondo_rendir`: desde una
// terminal la base no deja); aprobar y devolver, con la cuenta de quien revisa (`fondo_rendicion_aprobar`, `fondo_rendicion_devolver`)
// o, desde una terminal, con el combo «Responsable». Las lecturas no piden el combo.

export type { ErrorDeBase };

/** Cuánto espera una hoja la lista de lo rendido antes de decir que no pudo leerla (en vez de quedarse en esqueleto sin decir nada). */
const ESPERA_LISTA_MS = 10_000;

/**
 * Lo que la dueña todavía no rindió (`fn_mi_ciclo_fondo`), o las filas de una rendición (`fn_rendicion_fondo_items`), cada una con lo que
 * la base dice no deducible (actividad 6). Si esa segunda lectura falla, las filas llegan igual, sin la marca. Si la base no contesta en
 * `ESPERA_LISTA_MS`, vuelve con error (/formidable 2026-10-14, cambio 2): la hoja lo dice y ofrece volver a intentar.
 */
export async function leerItems(rendicionId: string | null): Promise<{ items: ItemRendicion[]; error: ErrorDeBase }> {
  const supabase = createClient();
  const corte = AbortSignal.timeout(ESPERA_LISTA_MS);
  const { data, error } = rendicionId
    ? await supabase.rpc(RPC_RENDICION_ITEMS as never, { p_rendicion_id: rendicionId } as never).abortSignal(corte)
    : await supabase.rpc(RPC_MI_CICLO_FONDO as never).abortSignal(corte);
  if (error) return { items: [], error };
  const items = leerItemsRendicion(data);
  const nd = await leerNoDeduciblesCon(supabase, items.map((i) => i.clave));
  return { items: items.map((i) => ({ ...i, noDeducible: nd.get(i.clave) ?? null })), error: null };
}

/**
 * La rendición por aprobar de quien pregunta, con su explicación (`fn_mi_rendicion_abierta`, 20261014222000): «Ver tu rendición» la usa
 * para decir qué pasa con el faltante. `undefined` si no se pudo leer (la hoja dice entonces las dos cosas, que es lo único seguro).
 */
export async function miRendicionAbierta(): Promise<{ id: string; explicacion: string | null } | null | undefined> {
  const { data, error } = await createClient()
    .rpc(RPC_MI_RENDICION_ABIERTA as never)
    .abortSignal(AbortSignal.timeout(ESPERA_LISTA_MS));
  if (error) return undefined;
  return leerMiRendicionAbierta(data);
}

/** Con la marca de `useIntento` (el token sigue a lo que se manda, 20261014194000) y la señal de corte. */
export function rendirFondo(
  args: { p_efectivo: number; p_explicacion: string | null },
  firma: Firma | FirmaOmitida | null,
  token: string,
  senal: AbortSignal,
) {
  return firmar(createClient().rpc(RPC_RENDIR_FONDO as never, { ...args, p_token: token } as never), firma).abortSignal(senal);
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
