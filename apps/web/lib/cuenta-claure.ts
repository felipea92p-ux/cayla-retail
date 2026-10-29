import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerFilaClaure, leerPagoClaure, type FilaClaure, type PagoClaure } from "@/lib/cuenta-claure-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, 20261029004000 y 20261029011000). Todo sale de `fn_claure_cuenta` (lo cobrado) y
// `fn_claure_pagos` (lo ya pagado), que miran solo lo que la cuenta ve (el líder, todo; con el módulo Cuentas y dinero, su sede). El saldo lo
// SUMA `resumenClaure`, nunca se guarda. Si una lectura falla, la pantalla se dibuja igual y lo dice (principio 9): sin los pagos el saldo
// sería más alto de lo real, así que tampoco se muestra una cifra a medias.

export type CuentaClaure = { filas: FilaClaure[]; pagos: PagoClaure[]; desde: string | null };

/** `sinAcceso`: la cuenta no tiene el módulo Cuentas y dinero (`42501`): no es una falla, solo no ve CLAURE. Las pantallas que la muestran de paso (el Resumen) la esconden. */
export async function getCuentaClaure(): Promise<Lectura<CuentaClaure> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  type Respuesta = { data: unknown; error: { message: string; code?: string } | null };
  const [cuenta, pagos, desde] = (await Promise.all([
    supabase.rpc("fn_claure_cuenta" as never),
    supabase.rpc("fn_claure_pagos" as never),
    supabase.rpc("fn_claure_cuenta_desde" as never),
  ])) as unknown as [Respuesta, Respuesta, Respuesta];
  const error = cuenta.error ?? pagos.error;
  if (error) return { datos: { filas: [], pagos: [], desde: null }, falla: `No se pudo leer la cuenta con CLAURE: ${error.message}`, sinAcceso: error.code === "42501" };
  return {
    datos: {
      filas: ((cuenta.data ?? []) as Record<string, unknown>[]).map(leerFilaClaure),
      pagos: ((pagos.data ?? []) as Record<string, unknown>[]).map(leerPagoClaure),
      // La fecha solo adorna la frase de arriba: si no se pudo leer, la frase se dice sin ella.
      desde: typeof desde.data === "string" ? desde.data : null,
    },
    falla: null,
    sinAcceso: false,
  };
}
