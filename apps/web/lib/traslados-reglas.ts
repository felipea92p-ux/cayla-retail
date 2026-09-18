// Reglas de Traslados en dos fases (20260916150000), sin nada de servidor:
// las lecturas contra Postgres viven en `traslados.ts` (mismo reparto que
// movimientos-v2.ts / movimientos-reglas.ts).

/** Atrasado = pasó la fecha estimada y todavía no se cerró — el mismo
 *  criterio para "en_transito" (nadie confirmó nada) y para
 *  "recibido_con_diferencia" (confirmaron algo, pero sigue sin cerrar). */
export function estaAtrasado(fechaEstimadaLlegada: string, estado: string, ahoraIso: string = new Date().toISOString()): boolean {
  if (estado === "cerrada" || estado === "completada") return false;
  return new Date(ahoraIso).getTime() > new Date(fechaEstimadaLlegada).getTime();
}

/** Cómo se lee un traslado DESDE una sede (diseño de Felipe, 2026-09-16):
 *  · por_confirmar  — viene hacia acá y nadie lo confirmó todavía: me toca a mí.
 *  · en_camino      — salió de acá y la otra sede no lo confirmó todavía.
 *  · con_diferencia — lo recibido no coincide; espera a un líder del destino.
 *  · cerrado        — terminó (cerrada, o «completada» del modelo anterior).
 *  Un traslado entre otras dos sedes (que un líder podría ver) no es ninguna
 *  de las dos primeras: se lee por su estado a secas. */
export type VistaTraslado = "por_confirmar" | "en_camino" | "con_diferencia" | "cerrado";

export function vistaTraslado(
  t: { estado: string; ubicacionOrigenId: string; ubicacionDestinoId: string },
  miUbicacionId: string
): VistaTraslado {
  if (t.estado === "recibido_con_diferencia") return "con_diferencia";
  if (t.estado === "en_transito") return t.ubicacionDestinoId === miUbicacionId ? "por_confirmar" : "en_camino";
  return "cerrado";
}

export const ETIQUETA_VISTA_TRASLADO: Record<VistaTraslado, string> = {
  por_confirmar: "Por confirmar",
  en_camino: "En camino",
  con_diferencia: "Con diferencia",
  cerrado: "Cerrados",
};

/** «Blusa Emma, Vestido Sofía +2» — las primeras prendas por nombre y cuántas
 *  más van. `maximo` nombres, el resto se cuenta. */
export function textoPrendas(referencias: string[], maximo = 2): string {
  if (referencias.length === 0) return "Sin prendas";
  const visibles = referencias.slice(0, maximo);
  const resto = referencias.length - visibles.length;
  return resto > 0 ? `${visibles.join(", ")} +${resto}` : visibles.join(", ");
}

/** Si una fecha ISO cae en el día de hoy en Lima (`hoyLima` = `aaaa-mm-dd`). */
export function llegaHoy(fechaIso: string, hoyLima: string): boolean {
  return new Date(fechaIso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) === hoyLima;
}
