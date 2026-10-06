import "server-only";
import { LIQUIDAR_DEFECTO } from "@/lib/analisis-reglas";

// Análisis v4 (ADR-0356): «Liquidar desde», uno para todas las tiendas y todas las personas (Felipe, 2026-10-06). PROVISIONAL:
// devuelve el valor de fábrica hasta que exista su lugar en la base (actividad 4).

export async function getLiquidarDesde(): Promise<{ dias: number; falla: string | null }> {
  return { dias: LIQUIDAR_DEFECTO, falla: null };
}
