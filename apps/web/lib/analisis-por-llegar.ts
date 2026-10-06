import "server-only";
import type { LlegadaPrenda } from "@/lib/analisis-tipos";

// Análisis v4 (ADR-0356): lo que viene en camino a una tienda, por prenda. PROVISIONAL: devuelve vacío hasta que exista la
// función de la base que lo lee (actividad 3). La forma de lo que devuelve es el contrato con `analisis-datos.ts`.

export type LecturaPorLlegar = {
  /** Por id de variante: de dónde viene cada parte, cuánto y cuándo se espera. */
  porVariante: Record<string, LlegadaPrenda[]>;
  falla: string | null;
};

export async function getPorLlegar(ubicacionId: string): Promise<LecturaPorLlegar> {
  return { porVariante: {}, falla: ubicacionId ? null : "Falta la tienda" };
}
