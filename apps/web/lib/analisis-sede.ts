import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PrendaSede } from "@/lib/analisis-tipos";
import { fraseFallaSedes, leerAnalisisSede, RPC_ANALISIS_SEDE, type LecturaDeSede } from "@/lib/analisis-sede-lectura";
import { getUbicaciones } from "@/lib/ubicaciones";

// Análisis v4 (ADR-0357): las prendas de cada tienda, leídas de la base (`retail.fn_analisis_sede`, migración 20261006214000).
// Una llamada por tienda, todas a la vez. La encargada y el líder reciben lo mismo (decisión 8): la puerta es la de Análisis, no
// la de la sede. Si una tienda no responde, esa queda vacía y se dice en `falla` con su nombre (principio 9): nunca «sin ventas»
// por un error. Cómo se entiende cada fila: `analisis-sede-lectura.ts`.

export type LecturaSedes = {
  /** Por id de tienda: sus prendas (libres, vendidas en 8 semanas, llegadas en 30 días o en camino). */
  porSede: Record<string, PrendaSede[]>;
  /** Por id de tienda: de cada 100 líneas vendidas en 30 días, cuántas llevaron rebaja (null si no vendió o no se pudo leer). */
  rebajaDe100: Record<string, number | null>;
  /** Lo que no se pudo leer, en una frase; null si todo respondió. */
  falla: string | null;
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Una tienda: su lectura, o null si la base falló o respondió algo que no se entiende (lo deja escrito en el log). */
async function leerSede(supabase: Cliente, ubicacionId: string): Promise<LecturaDeSede | null> {
  try {
    const { data, error } = await supabase.rpc(RPC_ANALISIS_SEDE as never, { p_ubicacion_id: ubicacionId } as never);
    if (error) {
      console.error(`${RPC_ANALISIS_SEDE} (${ubicacionId}): ${error.message}`);
      return null;
    }
    const lectura = leerAnalisisSede(data);
    if (!lectura) console.error(`${RPC_ANALISIS_SEDE} (${ubicacionId}): la base respondió sin datos (sin permiso para analizar, o una forma que no se entiende)`);
    return lectura;
  } catch (e) {
    console.error(`${RPC_ANALISIS_SEDE} (${ubicacionId}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** El nombre de cada tienda que falló, para decirlo («Tienda Lima»); si ni eso se puede leer, «una tienda». */
async function nombresDe(ids: readonly string[]): Promise<string[]> {
  try {
    const ubicaciones = await getUbicaciones();
    return ids.map((id) => ubicaciones.find((u) => u.id === id)?.nombre ?? "una tienda");
  } catch {
    return ids.map(() => "una tienda");
  }
}

export async function getPrendasPorSede(ubicacionIds: readonly string[]): Promise<LecturaSedes> {
  const supabase = await createClient();
  const lecturas = await Promise.all(ubicacionIds.map(async (id) => ({ id, lectura: await leerSede(supabase, id) })));
  const fallaron = lecturas.filter((l) => l.lectura === null).map((l) => l.id);
  return {
    porSede: Object.fromEntries(lecturas.map(({ id, lectura }) => [id, lectura?.prendas ?? []])),
    rebajaDe100: Object.fromEntries(lecturas.map(({ id, lectura }) => [id, lectura?.rebajaDe100 ?? null])),
    falla: fallaron.length === 0 ? null : fraseFallaSedes(await nombresDe(fallaron)),
  };
}
