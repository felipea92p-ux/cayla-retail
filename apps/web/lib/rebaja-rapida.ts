import { createClient } from "@/lib/supabase/client";

/** Un error de la base como lo devuelve PostgREST. */
export type ErrorDeRebaja = { message: string; code?: string | null; hint?: string | null; details?: string | null };

/** Una llamada a la base que se puede firmar (`firmar` le pone los encabezados del responsable) y esperar. */
export type LlamadaRebaja<T> = PromiseLike<{ data: T | null; error: ErrorDeRebaja | null }> & {
  setHeader(nombre: string, valor: string): LlamadaRebaja<T>;
};

type Rpc = <T>(funcion: string, args: object) => LlamadaRebaja<T>;

/**
 * Las funciones de «Poner un %» (ADR-0669, 20261116182000 y 20261116183000) desde el navegador. No están en los tipos generados de la base
 * hasta que se regeneren después de pegarlas en producción; mientras tanto se llaman por su nombre, en este solo lugar.
 */
export function rpcRebaja<T = unknown>(funcion: "campanas_rebaja_de_prenda" | "campanas_rebajas_de_tienda" | "campanas_rebaja_prendas" | "buscar_prenda_para_rebaja" | "poner_rebaja" | "quitar_rebaja" | "campanas_rebaja_de_variantes", args: object): LlamadaRebaja<T> {
  const supabase = createClient();
  return (supabase.rpc.bind(supabase) as unknown as Rpc)<T>(funcion, args);
}
