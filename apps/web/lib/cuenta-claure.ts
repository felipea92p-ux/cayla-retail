import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerFilaClaure, leerGastoClaure, leerPagoClaure, leerVentasClaure, type FilaClaure, type GastoClaure, type PagoClaure, type VentasClaure } from "@/lib/cuenta-claure-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, 20261029004000 y 20261029011000). Todo sale de `fn_claure_cuenta` (lo cobrado) y
// `fn_claure_pagos` (lo ya pagado), que miran solo lo que la cuenta ve (el líder, todo; con el módulo Cuentas y dinero, su sede). El saldo lo
// SUMA `resumenClaure`, nunca se guarda. Si una lectura falla, la pantalla se dibuja igual y lo dice (principio 9): sin los pagos el saldo
// sería más alto de lo real, así que tampoco se muestra una cifra a medias.

export type CuentaClaure = { filas: FilaClaure[]; pagos: PagoClaure[]; gastos: GastoClaure[]; desde: string | null };

/**
 * Lo vendido de CLAURE entre dos días (`fn_claure_ventas_en`), para decir «de eso, CLAURE» en Impuestos y «no incluye» en el Estado de resultados.
 * Es información de apoyo (principio 9): sin permiso, sin CLAURE o si la lectura falla devuelve `null` y la pantalla se ve como siempre.
 */
export async function getVentasClaure(desde: string, hasta: string): Promise<VentasClaure | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_claure_ventas_en" as never, { p_desde: desde, p_hasta: hasta } as never);
  return error ? null : leerVentasClaure(data);
}

/** `sinAcceso`: la cuenta no tiene el módulo Cuentas y dinero (`42501`): no es una falla, solo no ve CLAURE. Las pantallas que la muestran de paso (el Resumen) la esconden. */
export async function getCuentaClaure(): Promise<Lectura<CuentaClaure> & { sinAcceso: boolean }> {
  const supabase = await createClient();
  type Respuesta = { data: unknown; error: { message: string; code?: string } | null };
  const [cuenta, pagos, desde, gastos] = (await Promise.all([
    supabase.rpc("fn_claure_cuenta" as never),
    supabase.rpc("fn_claure_pagos" as never),
    supabase.rpc("fn_claure_cuenta_desde" as never),
    supabase.rpc("fn_claure_gastos" as never),
  ])) as unknown as [Respuesta, Respuesta, Respuesta, Respuesta];
  // Sin los gastos el saldo saldría más alto que el real, igual que sin los pagos: no se muestra una cifra a medias.
  const error = cuenta.error ?? pagos.error ?? gastos.error;
  if (error) return { datos: { filas: [], pagos: [], gastos: [], desde: null }, falla: `No se pudo leer la cuenta con CLAURE: ${error.message}`, sinAcceso: error.code === "42501" };
  return {
    datos: {
      filas: ((cuenta.data ?? []) as Record<string, unknown>[]).map(leerFilaClaure),
      pagos: ((pagos.data ?? []) as Record<string, unknown>[]).map(leerPagoClaure),
      gastos: ((gastos.data ?? []) as Record<string, unknown>[]).map(leerGastoClaure),
      // La fecha solo adorna la frase de arriba: si no se pudo leer, la frase se dice sin ella.
      desde: typeof desde.data === "string" ? desde.data : null,
    },
    falla: null,
    sinAcceso: false,
  };
}
