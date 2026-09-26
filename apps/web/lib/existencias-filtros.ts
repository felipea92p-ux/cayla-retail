import { ORDEN_ACCION_HOY, type TipoAccionHoy } from "./existencias-recomendaciones";

/* ====================================================================
   existencias-filtros · el filtro «Acción» de Existencias (2026-09-25)

   Separación conceptual pedida por Felipe: «Acción» (qué debería hacer la vendedora hoy) y
   «Estado» (en qué condición está el inventario — dañado/cuarentena) son DOS preguntas
   distintas. Antes vivían mezcladas en un solo dropdown/estado de React; ahora el filtro
   «Acción» lee EXCLUSIVAMENTE de `TipoAccionHoy` — nunca una unión con un estado de inventario —
   y «Dañado»/«Cuarentena» vive como su propio eje («Estado», en `InventarioPanel.tsx`).
   ==================================================================== */

/** Las opciones reales del filtro «Acción»: exactamente `TipoAccionHoy`, en el mismo orden que ya
 *  usa la columna y la leyenda de la tabla (`ORDEN_ACCION_HOY`) — nunca "Dañado" mezclado acá. */
export const OPCIONES_FILTRO_ACCION: readonly TipoAccionHoy[] = (Object.keys(ORDEN_ACCION_HOY) as TipoAccionHoy[]).sort(
  (a, b) => ORDEN_ACCION_HOY[a] - ORDEN_ACCION_HOY[b]
);

/** ¿Esta fila coincide con el filtro «Acción»? `filtro === null` = «Acción: todas». */
export function coincideConFiltroAccion(tipoAccionHoy: TipoAccionHoy | null | undefined, filtro: TipoAccionHoy | null): boolean {
  return filtro === null || tipoAccionHoy === filtro;
}

/** ¿Esta fila coincide con el filtro «Estado» (dañado/cuarentena)? Eje INDEPENDIENTE de Acción
 *  hoy: dañado es una condición del inventario, no algo que la vendedora deba decidir hoy. */
export function coincideConFiltroDanado(unidadesDanadas: number | null | undefined, filtroActivo: boolean): boolean {
  return !filtroActivo || (unidadesDanadas ?? 0) > 0;
}
