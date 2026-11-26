import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  RPC_COMPRADORES,
  RPC_TODAS_LAS_COMPRAS,
  leerCompradores,
  leerTodasLasCompras,
  type CompraDelLibro,
  type RondaDeCompras,
} from "@/lib/compradores-reglas";

// Compras reestructurado (ADR-0704): lecturas del servidor de Compradores y Todas las compras (20261126152000). Si fallan —la web
// publicada antes que la migración, o la base caída—, devuelven `null` y la pantalla lo dice (principio 9): nunca «nadie compra» inventado.

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Las rondas abiertas y las cerradas de los últimos 60 días, cada una con todas sus compras. `null` si no se pudo leer. */
export async function getCompradores(): Promise<RondaDeCompras[] | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_COMPRADORES as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`compradores: ${r.error.message}`);
    return null;
  }
  return leerCompradores(r.data);
}

export type FiltrosTodasLasCompras = { desde?: string | null; hasta?: string | null; personaId?: string | null; busqueda?: string | null };

/** El libro de compras del rango, lo más nuevo primero. `null` si no se pudo leer. */
export async function getTodasLasCompras(f: FiltrosTodasLasCompras): Promise<CompraDelLibro[] | null> {
  const supabase = await createClient();
  const r = (await supabase.rpc(RPC_TODAS_LAS_COMPRAS as never, {
    p_desde: f.desde ?? null,
    p_hasta: f.hasta ?? null,
    p_persona: f.personaId ?? null,
    p_busqueda: f.busqueda ?? null,
  } as never)) as unknown as Awaited<Respuesta>;
  if (r.error) {
    console.error(`todas las compras: ${r.error.message}`);
    return null;
  }
  return leerTodasLasCompras(r.data);
}
