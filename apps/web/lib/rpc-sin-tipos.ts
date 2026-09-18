// TEMPORAL (ADR-0104). Llama una función SQL que todavía no está en los tipos generados
// de `packages/database` (las escribe otro agente en paralelo; el orquestador regenera
// los tipos cuando terminan). En cuanto los tipos existan, cada uso se reemplaza por la
// llamada tipada `supabase.rpc("nombre", {...})` y este archivo se borra.
//
// Devuelve la misma forma `{ data, error }` que supabase-js, así que se combina con
// `exigir()` / `tolerar()` (lib/resultado.ts) y con `traducirError()` sin cambios.

type ErrorRpc = { message: string; code?: string; details?: string; hint?: string };
type Respuesta<T> = { data: T | null; error: ErrorRpc | null };

export async function rpcSinTipos<T>(supabase: unknown, nombre: string, args?: Record<string, unknown>): Promise<Respuesta<T>> {
  const cliente = supabase as { rpc: (fn: string, a?: Record<string, unknown>) => PromiseLike<Respuesta<T>> };
  return await cliente.rpc(nombre, args);
}
