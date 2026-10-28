import { DIAS_POR_DEFECTO, PERIODOS_RAPIDOS, desdeDeUltimosDias } from "./movimientos-reglas";

// Historial de Apartados por fecha (Felipe 2026-10-10, migración 20261010180000). Sin nada de servidor: lo usan la
// página (el rango con que se lee al entrar) y la vista (los botones de período).
//
// El rango acota SOLO lo cerrado (entregado o devuelto), por el día en que se HIZO el apartado. Lo que sigue esperando
// algo —abierto, o liberado con el adelanto por devolver— sale siempre: lo decide `buscar_separaciones` en la base.

/** Los mismos períodos que el Historial de ventas y Movimientos: Hoy, 7, 30 y 90 días, personalizado o todo. */
export type PeriodoApartados = "hoy" | "7" | "30" | "90" | "todo" | "personalizado";

/** Al entrar se ven los últimos 30 días (hoy incluido), como en Movimientos. */
export const PERIODO_DE_FABRICA: PeriodoApartados = String(DIAS_POR_DEFECTO) as PeriodoApartados;

export const PERIODOS_APARTADOS: { id: PeriodoApartados; etiqueta: string }[] = [
  { id: "hoy", etiqueta: "Hoy" },
  ...PERIODOS_RAPIDOS.map((d) => ({ id: String(d) as PeriodoApartados, etiqueta: `${d} días` })),
  { id: "personalizado", etiqueta: "Personalizado" },
];

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

/** ¿El período cambia lo que se lee? Con el de fábrica la página ya trajo la lista: no hace falta volver a la base. */
export const esDeFabrica = (periodo: PeriodoApartados, rango: RangoApartados, hoy: string) =>
  periodo === PERIODO_DE_FABRICA || (rango.desde === rangoDelPeriodo(PERIODO_DE_FABRICA, hoy).desde && rango.hasta === null);

function diaCorto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");
}

/** El período en palabras, para decir qué cerrados se están viendo («de hoy», «de los últimos 30 días», «del 2 oct al 9 oct»). */
export function textoDelPeriodo(periodo: PeriodoApartados, rango: RangoApartados): string {
  if (periodo === "todo" || (!rango.desde && !rango.hasta)) return "de todo el historial";
  if (periodo === "hoy") return "de hoy";
  if (periodo !== "personalizado") return `de los últimos ${periodo} días`;
  if (rango.desde && rango.hasta) return rango.desde === rango.hasta ? `del ${diaCorto(rango.desde)}` : `del ${diaCorto(rango.desde)} al ${diaCorto(rango.hasta)}`;
  return rango.desde ? `desde el ${diaCorto(rango.desde)}` : `hasta el ${diaCorto(rango.hasta!)}`;
}
