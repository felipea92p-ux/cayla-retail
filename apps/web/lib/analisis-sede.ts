import "server-only";
import type { PrendaSede } from "@/lib/analisis-tipos";

// Análisis v4 (ADR-0356): las prendas de cada tienda, leídas de la base. PROVISIONAL: devuelve vacío hasta que exista la
// función de la base que las lee (actividad 2). La forma de lo que devuelve es el contrato con `analisis-datos.ts`.

export type LecturaSedes = {
  /** Por id de tienda: sus prendas (libres, vendidas en 30 días o con algo que decir). */
  porSede: Record<string, PrendaSede[]>;
  /** Por id de tienda: de cada 100 líneas vendidas en 30 días, cuántas llevaron rebaja (null si no vendió). */
  rebajaDe100: Record<string, number | null>;
  /** Lo que no se pudo leer, en una frase; null si todo respondió. */
  falla: string | null;
};

export async function getPrendasPorSede(ubicacionIds: readonly string[]): Promise<LecturaSedes> {
  return { porSede: Object.fromEntries(ubicacionIds.map((id) => [id, []])), rebajaDe100: Object.fromEntries(ubicacionIds.map((id) => [id, null])), falla: null };
}
