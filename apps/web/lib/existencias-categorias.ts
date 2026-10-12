import type { FilaResumen } from "@/lib/resumen-reglas";

/* ====================================================================
   existencias-categorias · el delta de «Disponible total» en Existencias

   Puro: recibe las filas de la semana (`getFilasSemanaDeSede`, 7 días).
   `stockInicial` de esa ventana ES el disponible de hace 7 días; `utilizable`
   es el de HOY — no hace falta una segunda consulta para el delta.

   El nombre viene del overlay de categorías («Disponible total», 2026-09-22),
   que agrupaba esta misma semana por categoría. Ninguna pantalla lo abría desde
   el rediseño de Prioridades de hoy (2026-09-29), y el 2026-10-06 se borró junto
   con sus agregados y el recorte de la fila que viajaba al navegador.
   ==================================================================== */

/** Lo único de `FilaResumen` que pide el delta de la sede. */
export type FilaSemana = Pick<FilaResumen, "utilizable" | "stockInicial">;

function deltaPct(hoy: number, hace7d: number): number | null {
  if (hace7d === 0) return hoy === 0 ? 0 : null; // de 0 a algo no es "% de aumento" — se muestra la unidad, no un porcentaje inventado
  return ((hoy - hace7d) / hace7d) * 100;
}

/** Para la tarjeta «Disponible total»: el delta de TODA la sede (todas las categorías, con o sin `categoriaId`). */
export function deltaDisponibleSede(filas: FilaSemana[]): { hoy: number; hace7d: number; pct: number | null } {
  const hoy = filas.reduce((acc, f) => acc + f.utilizable, 0);
  const hace7d = filas.reduce((acc, f) => acc + f.stockInicial, 0);
  return { hoy, hace7d, pct: deltaPct(hoy, hace7d) };
}
