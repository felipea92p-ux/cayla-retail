import { formatoRotacion, formatoSellThrough, formatoVariacion } from "./resumen-formato";
import { cambioMostrado, detalleCambio, type AnalisisComparacion, type FiltroCambio } from "./resumen-comparacion";
import type { AnalisisDesempeno } from "./resumen-desempeno";

// «Cambio relevante» del Análisis de inventario (rediseño 2026-09-22, decidido por Felipe): UNA frase por
// variante que dice qué hacer con lo que muestran sus cifras. La calculan reglas fijas, en orden, y gana la
// primera que se cumple. No hay fórmulas nuevas ni IA: cada regla lee métricas que `resumen-desempeno.ts` y
// `resumen-comparacion.ts` ya calcularon. El mismo dato da siempre la misma frase.
//
//   1. Cifras estimadas     el historial no cuadra con el stock de hoy (≈): antes que nada, no afirmar
//   2. Se agotó             vendió y cerró el período en 0 → pendiente reponer
//   3. Sin ventas con stock no vendió nada en un período largo y le queda stock → liquidar o trasladar
//   4. Cambió el ritmo      Desempeño: la 2.ª mitad contra la 1.ª (±25 %). Comparar: el cambio más importante
//                           de A a B, con la prioridad de siempre (`cambioMostrado`: ritmo, rotación, sell-through)
//   5. Vendió casi todo     sell-through ≥ 80 %
//   6. Rota lento           solo Desempeño: sell-through < 15 % con 20 unidades o más al cierre
//   7. Sin cambio relevante hay datos y ninguna regla se cumplió. Sin nada medible: null (la celda dice «—»)
//
// El rojo de esta pantalla es urgencia de inventario (agotado); lo que pide atención sin ser urgente va en
// ámbar y lo que va bien, en verde.

/** Sell-through a partir del cual una variante «vendió casi todo» lo que tuvo disponible. */
export const LECTURA_VENDIO_CASI_TODO_PCT = 80;
/** «Rota lento»: sell-through por debajo de esto… */
export const LECTURA_ROTA_LENTO_PCT = 15;
/** …con al menos estas unidades al cierre (con 3 prendas no hay capital parado que mover). */
export const LECTURA_ROTA_LENTO_MIN_UNIDADES = 20;
/** Días mínimos del período para afirmar «sin ventas»: en una semana, no vender una prenda no dice nada. */
export const LECTURA_SIN_VENTAS_DIAS_MIN = 14;

export type TonoLectura = "rojo" | "ambar" | "verde" | "neutro";

export type ReglaLectura = "estimada" | "agotada" | "sin_ventas" | "acelero" | "desacelero" | "mejoro_rotacion" | "sell_through_sube" | "sell_through_baja" | "vendio_casi_todo" | "rota_lento" | "sin_cambio";

export type Lectura = {
  regla: ReglaLectura;
  texto: string;
  tono: TonoLectura;
  /** El porqué con números, para el `title` de la celda. */
  detalle: string;
};

const ESTIMADA: Lectura = {
  regla: "estimada",
  texto: "Cifras estimadas: el historial no cuadra con el stock",
  tono: "ambar",
  detalle: "El historial de movimientos no explica el stock de hoy. Un conteo lo corrige.",
};

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** Reglas 2, 3 y 5 (compartidas): miran el período que se lee (el período en Desempeño, B en Comparar). */
function reglasDeStock(p: { ventasNetas: number; stockCierre: number; sellThrough: number | null }, dias: number, cuando: string): { antes: Lectura | null; despues: Lectura | null } {
  let antes: Lectura | null = null;
  if (p.stockCierre === 0 && p.ventasNetas > 0) {
    antes = { regla: "agotada", texto: `Se agotó ${cuando}: pendiente reponer`, tono: "rojo", detalle: `Vendió ${unidades(p.ventasNetas)} y cerró sin stock.` };
  } else if (p.ventasNetas <= 0 && p.stockCierre > 0 && dias >= LECTURA_SIN_VENTAS_DIAS_MIN) {
    antes = { regla: "sin_ventas", texto: `Sin ventas con ${p.stockCierre} u. en stock: liquidar o trasladar`, tono: "ambar", detalle: `No se vendió en ${dias} días y cerró con ${unidades(p.stockCierre)}.` };
  }
  const despues: Lectura | null =
    p.sellThrough !== null && p.sellThrough >= LECTURA_VENDIO_CASI_TODO_PCT
      ? { regla: "vendio_casi_todo", texto: `Vendió el ${formatoSellThrough(p.sellThrough)} de lo disponible`, tono: "verde", detalle: `Sell-through ${formatoSellThrough(p.sellThrough)}: ventas netas ÷ (stock al inicio + entradas).` }
      : null;
  return { antes, despues };
}

/** La lectura de una variante en Desempeño. `dias` = días del período analizado. */
export function lecturaDesempeno(x: AnalisisDesempeno, dias: number): Lectura | null {
  if (!x.fila.ledgerConsistente) return ESTIMADA;
  const p = x.periodo;
  const { antes, despues } = reglasDeStock({ ventasNetas: p.ventasNetas, stockCierre: p.stockCierre, sellThrough: x.sellThrough }, dias, "en el período");
  if (antes) return antes;

  const t = x.tendencia;
  if (t && t.direccion === "alza") return { regla: "acelero", texto: `Aceleró ${formatoVariacion(t.variacionPct)} en la 2.ª mitad`, tono: "verde", detalle: "Ritmo de venta de la 2.ª mitad del período contra el de la 1.ª." };
  if (t && t.direccion === "baja") return { regla: "desacelero", texto: `Desaceleró ${formatoVariacion(t.variacionPct)} en la 2.ª mitad`, tono: "ambar", detalle: "Ritmo de venta de la 2.ª mitad del período contra el de la 1.ª." };

  if (despues) return despues;

  if (x.sellThrough !== null && x.sellThrough < LECTURA_ROTA_LENTO_PCT && p.stockCierre >= LECTURA_ROTA_LENTO_MIN_UNIDADES) {
    return { regla: "rota_lento", texto: `Rota lento: ${p.stockCierre} u. al cierre`, tono: "ambar", detalle: `Vendió el ${formatoSellThrough(x.sellThrough)} de lo disponible y cerró con ${unidades(p.stockCierre)}.` };
  }

  const medible = x.ritmo !== null || x.sellThrough !== null || p.rotacion !== null;
  return medible ? { regla: "sin_cambio", texto: "Sin cambio relevante", tono: "neutro", detalle: "Ninguna de las reglas de lectura se cumplió en este período." } : null;
}

/** La lectura de una variante en Comparar períodos. Con un filtro de cambio activo, la regla 4 respeta ese
 *  filtro (filtrar por «Mejoró rotación» y leer «Aceleró» en cada fila contradice al filtro). */
export function lecturaComparacion(x: AnalisisComparacion, diasB: number, filtro: FiltroCambio = "todos"): Lectura | null {
  if (!x.fila.ledgerConsistente) return ESTIMADA;
  const { antes, despues } = reglasDeStock({ ventasNetas: x.b.ventasNetas, stockCierre: x.b.stockCierre, sellThrough: x.b.sellThrough }, diasB, "en B");
  if (antes) return antes;

  const c = cambioMostrado(x, filtro);
  if (c !== null && c !== "sin_cambio") {
    const detalle = detalleCambio(x, c);
    switch (c) {
      case "acelero":
        return { regla: c, texto: `Aceleró ${formatoVariacion(x.ritmo?.variacionPct ?? 0)} frente a A`, tono: "verde", detalle };
      case "desacelero":
        return { regla: c, texto: `Desaceleró ${formatoVariacion(x.ritmo?.variacionPct ?? 0)} frente a A`, tono: "ambar", detalle };
      case "mejoro_rotacion":
        return { regla: c, texto: `Rotó más: ${x.a.rotacion === null ? "N/D" : formatoRotacion(x.a.rotacion)} → ${formatoRotacion(x.b.rotacion ?? 0)}`, tono: "verde", detalle };
      case "sell_through_sube":
        return { regla: c, texto: `Sell-through subió ${formatoVariacion(x.deltaSellThroughPp ?? 0).replace("%", " pp")}`, tono: "verde", detalle };
      case "sell_through_baja":
        return { regla: c, texto: `Sell-through bajó ${formatoVariacion(x.deltaSellThroughPp ?? 0).replace("%", " pp")}`, tono: "ambar", detalle };
    }
  }

  if (despues) return despues;
  return c === "sin_cambio" ? { regla: "sin_cambio", texto: "Sin cambio relevante", tono: "neutro", detalle: "Ninguna de las reglas de lectura se cumplió entre A y B." } : null;
}
