import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ClienteDeLectura } from "@/lib/plan-compra-inversion-lectura";

// El cliente real de la base para la lectura de «Inversión en mercadería» (ADR-0527). La política (cuáles campañas, qué hacer cuando algo cae) vive en `plan-compra-inversion-lectura.ts`, que no toca
// la red y se prueba sola; aquí solo se entrega el cliente de la sesión de quien mira el Resumen, con lo mínimo que esa política le pide.
export async function clienteDeLectura(): Promise<ClienteDeLectura> {
  const supabase = await createClient();
  return { rpc: (nombre, args) => supabase.rpc(nombre as never, (args ?? {}) as never) as unknown as ReturnType<ClienteDeLectura["rpc"]> };
}
