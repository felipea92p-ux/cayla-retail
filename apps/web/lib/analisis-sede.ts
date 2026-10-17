import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PrendaSede } from "@/lib/analisis-tipos";
import { fraseFallaSedes, leerAnalisisSede, RPC_ANALISIS_SEDE, type LecturaDeSede } from "@/lib/analisis-sede-lectura";
import { datosDe, LENTA_SEDE_MS, type ResultadoLectura } from "@/lib/analisis-con-tope";
import { leerPieza } from "@/lib/analisis-lectura";
import { getUbicaciones } from "@/lib/ubicaciones";

// Análisis v4 (ADR-0357): las prendas de cada tienda, leídas de la base (`retail.fn_analisis_sede`, migraciones 20261006214000 y
// 20261007120000, 20261010120000).
// Una llamada por tienda, todas a la vez. La encargada y el líder reciben lo mismo (decisión 8): la puerta es la de Análisis, no
// la de la sede. Si una tienda no responde (o no responde a tiempo: `analisis-con-tope.ts`), esa queda vacía, se dice en `falla` con su
// nombre y su id va a `sedesSinLeer` (principio 9): nunca «sin ventas» por un error. Cómo se entiende cada fila:
// `analisis-sede-lectura.ts`.

export type LecturaSedes = {
  /** Por id de tienda: sus prendas (libres, vendidas en 8 semanas, llegadas en 30 días o en camino). */
  porSede: Record<string, PrendaSede[]>;
  /** Por id de tienda: de cada 100 líneas vendidas en 30 días, cuántas llevaron rebaja (null si no vendió o no se pudo leer). */
  rebajaDe100: Record<string, number | null>;
  /** Por id de tienda que respondió: si sus filas dicen cuándo salió al piso cada prenda (20261007120000). */
  sabePiso: Record<string, boolean>;
  /** Por id de tienda que respondió: si sus filas dicen la última venta de cada prenda (20261010120000). */
  sabeUltimaVenta: Record<string, boolean>;
  /** Los ids de las tiendas que no se pudieron leer (error, sin datos o tope vencido): su lista de `porSede` viene vacía por eso, no
   *  porque no haya nada. Vacío si todas respondieron. Qué se hace con ellas lo decide cada regla (A11), no esta lectura. */
  sedesSinLeer: string[];
  /** Lo que no se pudo leer, en una frase; null si todo respondió. */
  falla: string | null;
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Una tienda: su lectura, o por qué no se pudo (ya avisado a Sentry, una vez por hora: `analisis-lectura.ts`). */
function leerSede(supabase: Cliente, ubicacionId: string): Promise<ResultadoLectura<LecturaDeSede>> {
  return leerPieza(
    "sede",
    { ubicacion_id: ubicacionId },
    async () => {
      const { data, error } = await supabase.rpc(RPC_ANALISIS_SEDE as never, { p_ubicacion_id: ubicacionId } as never);
      if (error) throw error;
      // null = la base respondió sin datos (sin permiso para analizar, o una forma que no se entiende).
      return leerAnalisisSede(data);
    },
    LENTA_SEDE_MS,
  );
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
  const lecturas = await Promise.all(ubicacionIds.map(async (id) => ({ id, resultado: await leerSede(supabase, id) })));
  const leidas = lecturas.map(({ id, resultado }) => ({ id, lectura: datosDe(resultado) }));
  const sedesSinLeer = leidas.filter((l) => l.lectura === null).map((l) => l.id);
  return {
    porSede: Object.fromEntries(leidas.map(({ id, lectura }) => [id, lectura?.prendas ?? []])),
    rebajaDe100: Object.fromEntries(leidas.map(({ id, lectura }) => [id, lectura?.rebajaDe100 ?? null])),
    sabePiso: Object.fromEntries(leidas.filter((l) => l.lectura !== null).map(({ id, lectura }) => [id, lectura!.sabePiso])),
    sabeUltimaVenta: Object.fromEntries(leidas.filter((l) => l.lectura !== null).map(({ id, lectura }) => [id, lectura!.sabeUltimaVenta])),
    sedesSinLeer,
    falla: sedesSinLeer.length === 0 ? null : fraseFallaSedes(await nombresDe(sedesSinLeer)),
  };
}
