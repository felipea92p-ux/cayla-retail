import { DIAS_POR_DEFECTO, desdeDeUltimosDias } from "./movimientos-reglas";

// Historial de Apartados por fecha (Felipe 2026-10-10, migración 20261010180000). Sin nada de servidor: lo usa la página (el rango
// con que se lee al entrar). Desde ADR-0720 el Historial no tiene botones de período: abre en los últimos 30 días y «Todo el historial»
// lee sin fechas (`components/apartados/HistorialVista.tsx`).
//
// El rango acota SOLO lo cerrado (entregado o devuelto), por el día en que se HIZO el apartado. Lo que sigue esperando
// algo —abierto, o liberado con el adelanto por devolver— sale siempre: lo decide `buscar_separaciones` en la base.

/** Los mismos períodos que el Historial de ventas y Movimientos: Hoy, 7, 30 y 90 días, personalizado o todo. */
export type PeriodoApartados = "hoy" | "7" | "30" | "90" | "todo" | "personalizado";

/** Al entrar se ven los últimos 30 días (hoy incluido), como en Movimientos. */
export const PERIODO_DE_FABRICA: PeriodoApartados = String(DIAS_POR_DEFECTO) as PeriodoApartados;

/** Días de Lima (`aaaa-mm-dd`), ambos incluidos; `null` = sin límite de ese lado. */
export type RangoApartados = { desde: string | null; hasta: string | null };

const esFecha = (v?: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** El rango que pide a la base cada período. En «Personalizado» una fecha vacía o mal escrita no limita, y si «desde»
 *  quedó después de «hasta» se dan vuelta: nadie quiere una lista vacía por haber tocado los campos al revés. */
export function rangoDelPeriodo(periodo: PeriodoApartados, hoy: string, fechas: { desde?: string; hasta?: string } = {}): RangoApartados {
  if (periodo === "todo") return { desde: null, hasta: null };
  if (periodo === "hoy") return { desde: hoy, hasta: null };
  if (periodo === "personalizado") {
    const desde = esFecha(fechas.desde) ? fechas.desde : null;
    const hasta = esFecha(fechas.hasta) ? fechas.hasta : null;
    return desde && hasta && desde > hasta ? { desde: hasta, hasta: desde } : { desde, hasta };
  }
  return { desde: desdeDeUltimosDias(Number(periodo), hoy), hasta: null };
}
