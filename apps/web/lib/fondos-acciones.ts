import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { RPC_ANULAR_MOVIMIENTO_FONDO, RPC_DEVOLVER_FONDO, RPC_ENTREGAR_FONDO } from "@/lib/fondos-reglas";

// Fondos por rendir (ADR-0362, fase 6 · actividad 1): lo que las hojas le piden a la base para guardar. Las reglas viven en las
// funciones (20261013182000); aquí solo se arma la llamada con su firma: con la cuenta de una persona, `firmaOmitida("fondo_entregar")`,
// `("fondo_devolver")` o `("fondo_anular")` (firma ella, sin combo); desde una terminal, la del combo «Responsable» (decisión 39).
// El `p_token` lo genera la hoja una vez: un doble clic o un reintento tras un corte devuelve el MISMO movimiento.

export type { ErrorDeBase };

export async function entregarFondo(
  args: { p_persona_id: string; p_cuenta_origen_id: string; p_monto: number; p_motivo: string; p_token: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_ENTREGAR_FONDO as never, args as never), firma);
  return { id: typeof data === "string" ? data : null, error: error ?? null };
}

export async function devolverFondo(
  args: { p_persona_id: string; p_cuenta_destino_id: string; p_monto: number; p_nota: string | null; p_token: string },
  firma: Firma | FirmaOmitida | null,
): Promise<{ id: string | null; error: ErrorDeBase }> {
  const { data, error } = await firmar(createClient().rpc(RPC_DEVOLVER_FONDO as never, args as never), firma);
  return { id: typeof data === "string" ? data : null, error: error ?? null };
}

export async function anularMovimientoFondo(args: { p_id: string; p_motivo: string }, firma: Firma | FirmaOmitida | null): Promise<{ error: ErrorDeBase }> {
  const { error } = await firmar(createClient().rpc(RPC_ANULAR_MOVIMIENTO_FONDO as never, args as never), firma);
  return { error: error ?? null };
}
