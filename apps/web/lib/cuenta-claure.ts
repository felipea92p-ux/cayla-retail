import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerFilaClaure, type FilaClaure } from "@/lib/cuenta-claure-reglas";
import type { Lectura } from "@/lib/cuentas-dinero";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, 20261029004000). Todo sale de `fn_claure_cuenta`, que ya mira solo lo que la cuenta ve
// (el líder, todo; con el módulo Cuentas y dinero, su sede). El saldo lo SUMA `resumenClaure`, nunca se guarda. Si la lectura falla, la
// pantalla se dibuja igual y lo dice (principio 9): nunca muestra un cero como si fuera un dato.

export type CuentaClaure = { filas: FilaClaure[]; desde: string | null };

export async function getCuentaClaure(): Promise<Lectura<CuentaClaure>> {
  const supabase = await createClient();
  type Respuesta = { data: unknown; error: { message: string } | null };
  const [cuenta, desde] = (await Promise.all([supabase.rpc("fn_claure_cuenta" as never), supabase.rpc("fn_claure_cuenta_desde" as never)])) as unknown as [Respuesta, Respuesta];
  if (cuenta.error) return { datos: { filas: [], desde: null }, falla: `No se pudo leer la cuenta con CLAURE: ${cuenta.error.message}` };
  return {
    datos: {
      filas: ((cuenta.data ?? []) as Record<string, unknown>[]).map(leerFilaClaure),
      // La fecha solo adorna la frase de arriba: si no se pudo leer, la frase se dice sin ella.
      desde: typeof desde.data === "string" ? desde.data : null,
    },
    falla: null,
  };
}
