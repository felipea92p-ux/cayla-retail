// Reglas de Traslados en dos fases (20260916150000), sin nada de servidor:
// las lecturas contra Postgres viven en `traslados.ts` (mismo reparto que
// movimientos-v2.ts / movimientos-reglas.ts).

/** Atrasado = pasó la fecha estimada y todavía no se cerró — el mismo
 *  criterio para "en_transito" (nadie confirmó nada) y para
 *  "recibido_con_diferencia" (confirmaron algo, pero sigue sin cerrar). */
export function estaAtrasado(fechaEstimadaLlegada: string, estado: string, ahoraIso: string = new Date().toISOString()): boolean {
  if (estado === "cerrada") return false;
  return new Date(ahoraIso).getTime() > new Date(fechaEstimadaLlegada).getTime();
}
