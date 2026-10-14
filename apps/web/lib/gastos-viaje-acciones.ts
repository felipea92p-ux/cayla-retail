import { createClient } from "@/lib/supabase/client";
import { firmar, type Firma } from "@/lib/responsable-reglas";
import type { FirmaOmitida } from "@/lib/responsable-omitido";
import type { ErrorDeBase } from "@/lib/ordenes-compra-acciones";
import { RPC_ORDENES_PARA_GASTO, RPC_REGISTRAR_GASTO_VIAJE, leerOrdenesParaGasto, type OrdenParaGasto } from "@/lib/gastos-viaje-reglas";

// Gastos del viaje (ADR-0362, fase 6 · actividad 3): lo que la hoja le pide a la base. Las reglas viven en `registrar_gasto_viaje`
// (20261013222000); aquí solo se arma la llamada con su firma: con la cuenta de una persona, `firmaOmitida("gasto_viaje_registrar")`
// (firma ella, sin combo); desde una terminal, la del combo «Responsable» (decisión 39). El `p_token` es la marca de `useIntento`
// (/chaos 2026-10-14, 20261014194000): sigue a lo que se manda; lo mismo devuelve el MISMO gasto, otra cosa es `token_reusado`.

export type { ErrorDeBase };

export function registrarGastoViaje(
  args: {
    p_tipo: string;
    p_concepto: string;
    p_monto: number;
    p_fecha: string;
    p_papel: string;
    p_medio_pago: string;
    p_cuenta_id: string | null;
    p_ordenes: string[];
    p_serie_numero: string | null;
    p_ruc: string | null;
    p_nota: string | null;
  },
  firma: Firma | FirmaOmitida | null,
  token: string,
  senal: AbortSignal,
) {
  return firmar(createClient().rpc(RPC_REGISTRAR_GASTO_VIAJE as never, { ...args, p_token: token } as never), firma).abortSignal(senal);
}

/**
 * De qué sede es el gasto con esas órdenes (`fn_gasto_viaje_sede`, la misma regla que `registrar_gasto_viaje`): la hoja propone la caja
 * de ESA tienda (/chaos 2026-10-14). `fn_`: el loader general no bloquea la hoja. Si la base no contesta, `null` (la hoja usa la de arriba).
 */
export async function leerSedeDelGasto(ordenes: readonly string[]): Promise<string | null> {
  const { data, error } = await (createClient().rpc("fn_gasto_viaje_sede" as never, { p_ordenes: ordenes } as never) as unknown as PromiseLike<{ data: unknown; error: unknown }>);
  return !error && typeof data === "string" ? data : null;
}

/** Las órdenes que se pueden elegir (`fn_`: el loader general no bloquea la hoja). Si la base no contesta, la hoja sigue sin la lista. */
export async function leerOrdenesParaGastoDesdeLaHoja(): Promise<{ ordenes: OrdenParaGasto[]; falla: boolean }> {
  const { data, error } = await (createClient().rpc(RPC_ORDENES_PARA_GASTO as never) as unknown as PromiseLike<{ data: unknown; error: unknown }>);
  return error ? { ordenes: [], falla: true } : { ordenes: leerOrdenesParaGasto(data), falla: false };
}
