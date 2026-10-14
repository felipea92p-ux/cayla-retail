import { RPC_NO_DEDUCIBLES, clavesQueSePreguntan, leerNoDeducibles, type NoDeducible } from "./no-deducible-reglas";

// Lo «no deducible» de unas filas del libro de dinero (ADR-0362, fase 6 · actividad 6), desde el servidor o desde el navegador: quien
// llama pasa su cliente de Supabase. Es una marca que informa: si la lectura falla, las filas se ven como siempre, sin la marca
// (principio 9), y el error queda en el registro.

type ConRpc = { rpc: (fn: never, args?: never) => unknown };
type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** La base responde hasta 1,000 claves por vez. */
const POR_VEZ = 1000;

export async function leerNoDeduciblesCon(supabase: ConRpc, claves: readonly string[]): Promise<Map<string, NoDeducible>> {
  const pedir = clavesQueSePreguntan(claves);
  const mapa = new Map<string, NoDeducible>();
  for (let i = 0; i < pedir.length; i += POR_VEZ) {
    const { data, error } = await (supabase.rpc(RPC_NO_DEDUCIBLES as never, { p_claves: pedir.slice(i, i + POR_VEZ) } as never) as unknown as Respuesta);
    if (error) {
      console.error(`lo no deducible: ${error.message}`);
      return new Map();
    }
    for (const [clave, nd] of leerNoDeducibles(data)) mapa.set(clave, nd);
  }
  return mapa;
}
