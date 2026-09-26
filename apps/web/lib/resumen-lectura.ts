import { formatoRotacion, formatoSellThrough, formatoVariacion, formatoVelocidad } from "./resumen-formato";
import { cambioMostrado, detalleCambio, type AnalisisComparacion, type FiltroCambio } from "./resumen-comparacion";
import type { AnalisisDesempeno } from "./resumen-desempeno";

// «Lectura del período» del Análisis de inventario — Desempeño (`lecturaDesempeno`) reescrita el 2026-09-24
// sobre las 7 categorías CANÓNICAS definidas por Felipe (sección 22 de su pedido), con su texto exacto. UNA
// frase por variante que dice qué hacer con lo que muestran sus cifras; reglas fijas, en orden, gana la
// primera que se cumple. No hay fórmulas nuevas ni IA: cada regla lee métricas que `resumen-desempeno.ts`,
// `resumen-comparacion.ts` e `inventario-exposicion.ts` ya calcularon.
//
// Desempeño (`lecturaDesempeno`), de más a menos prioritaria:
//   1. Cifras estimadas       el historial no cuadra con el stock de hoy (≈): antes que nada, no afirmar
//   F. Reposición reciente    todo el stock de piso es de cohortes sin madurar: no hay base para juzgar TODAVÍA
//   E. Agotamiento            vendió y cerró el período en 0 → pendiente reponer; con exposición corta, el
//                             texto avisa que la demanda pudo estar limitada por el stock, no es demanda plena
//   C. Estancamiento          exposición YA suficiente, con stock, expuesta sin vender ≥14 días Y poco
//                             movimiento (cero ventas, o sell-through de exposición bajo con stock relevante)
//   D. Problema de reposición hay stock total, pero la exposición en piso es escasa (ahora, o hubo un
//                             quiebre-y-reposición documentado en el período): la mercadería no está llegando
//   B. Buena respuesta + sobrestock  rotación total muy por debajo de la de piso: duerme en almacén
//   A. Saludable              ritmo sostenido, exposición suficiente, sin tendencia a la baja
//   Sin cambio relevante      hay datos y ninguna regla se cumplió
//   G. Datos insuficientes    nada de lo anterior se pudo calcular: no hay historial suficiente
//
// Comparar períodos (`lecturaComparacion`) se quedó deliberadamente en el set de reglas anterior (`reglasDeStock`,
// con el cambio más importante de A a B): no tiene piso/almacén por variante todavía en su propio tipo
// (`AnalisisComparacion`); extenderla con las mismas 7 categorías es un paso aparte, simétrico a este.
//
// El rojo de esta pantalla es urgencia de inventario (agotado); lo que pide atención sin ser urgente va en
// ámbar y lo que va bien, en verde.

/** Sell-through a partir del cual una variante «vendió casi todo» lo que tuvo disponible (Comparar). */
export const LECTURA_VENDIO_CASI_TODO_PCT = 80;
/** «Poco movimiento» (Estancamiento, C): sell-through de exposición por debajo de esto… */
export const LECTURA_ROTA_LENTO_PCT = 15;
/** …con al menos estas unidades al cierre (con 3 prendas no hay capital parado que mover). */
export const LECTURA_ROTA_LENTO_MIN_UNIDADES = 20;
/** Días mínimos EXPUESTA SIN VENDER para afirmar «estancamiento»/«sin ventas»: en una semana, no vender una
 *  prenda no dice nada. */
export const LECTURA_SIN_VENTAS_DIAS_MIN = 14;

export type TonoLectura = "rojo" | "ambar" | "verde" | "neutro";

export type ReglaLectura =
  | "estimada"
  | "reposicion_reciente"
  | "agotada"
  | "estancamiento"
  | "problema_reposicion"
  | "sobrestock"
  | "saludable"
  | "datos_insuficientes"
  | "sin_ventas"
  | "vendio_casi_todo"
  | "acelero"
  | "desacelero"
  | "mejoro_rotacion"
  | "sell_through_sube"
  | "sell_through_baja"
  | "sin_cambio";

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

/** Solo Desempeño (`AnalisisDesempeno` trae piso/almacén por variante; `AnalisisComparacion` todavía no):
 *  cuando se pasa, «sin ventas» exige días EXPUESTOS EN PISO (no calendario) y «se agotó»/«vendió casi
 *  todo» avisan que la base es de exposición, no del inventario total. Sin este parámetro (Comparar), el
 *  comportamiento es exactamente el de siempre. */
type ContextoExposicion = { pisoDias: number | null; muestraLimitada: boolean };

/** Reglas 2, 3 y 5 (compartidas): miran el período que se lee (el período en Desempeño, B en Comparar). */
function reglasDeStock(p: { ventasNetas: number; stockCierre: number; sellThrough: number | null }, dias: number, cuando: string, exposicion?: ContextoExposicion): { antes: Lectura | null; despues: Lectura | null } {
  let antes: Lectura | null = null;
  if (p.stockCierre === 0 && p.ventasNetas > 0) {
    antes = {
      regla: "agotada",
      texto: `Se agotó ${cuando}: pendiente reponer`,
      tono: "rojo",
      detalle: exposicion?.muestraLimitada
        ? `Vendió ${unidades(p.ventasNetas)} y cerró sin stock, con poca exposición en piso: el ritmo observado pudo quedar corto frente a la demanda real.`
        : `Vendió ${unidades(p.ventasNetas)} y cerró sin stock.`,
    };
  } else if (p.ventasNetas <= 0 && p.stockCierre > 0) {
    // Sin `exposicion`, la base es el largo del período (como siempre); con ella, los días EXPUESTOS EN
    // PISO — una variante puede tener 30 días de calendario y solo 2 en piso (el resto en almacén): eso
    // NO es una variante estancada, es una que casi no tuvo oportunidad de venderse.
    const diasBase = exposicion ? exposicion.pisoDias : dias;
    if (diasBase !== null && diasBase >= LECTURA_SIN_VENTAS_DIAS_MIN) {
      antes = {
        regla: "sin_ventas",
        texto: `Sin ventas con ${p.stockCierre} u. en stock: liquidar o trasladar`,
        tono: "ambar",
        detalle: exposicion ? `Expuesta en piso ${Math.round(diasBase)} días sin una venta, con ${unidades(p.stockCierre)}.` : `No se vendió en ${dias} días y cerró con ${unidades(p.stockCierre)}.`,
      };
    }
  }
  const despues: Lectura | null =
    p.sellThrough !== null && p.sellThrough >= LECTURA_VENDIO_CASI_TODO_PCT
      ? {
          regla: "vendio_casi_todo",
          texto: `Vendió el ${formatoSellThrough(p.sellThrough)} de lo ${exposicion ? "expuesto" : "disponible"}`,
          tono: "verde",
          detalle: exposicion ? `Sell-through de exposición ${formatoSellThrough(p.sellThrough)}: de las cohortes de piso ya maduras, cuánto se vendió.` : `Sell-through ${formatoSellThrough(p.sellThrough)}: ventas netas ÷ (stock al inicio + entradas).`,
        }
      : null;
  return { antes, despues };
}

/** La lectura de una variante en Desempeño. `dias` = días del período analizado. Autocontenida: ya no
 *  comparte `reglasDeStock` con Comparar (sus condiciones divergieron demasiado — sección 22 del pedido). */
export function lecturaDesempeno(x: AnalisisDesempeno, dias: number): Lectura | null {
  if (!x.fila.ledgerConsistente) return ESTIMADA;
  const p = x.periodo;
  const st = x.sellThroughExposicion;
  const expuestaSinVenta = x.fila.pisoExpuestoDesdeUltimaVentaDias;

  // F. REPOSICIÓN RECIENTE — si TODO el piso de hoy es reposición sin madurar, no hay base para leer el
  // período — ni «va bien» ni «va mal» se pueden afirmar todavía (caso F del pedido).
  if (st.disponibleMaduro === 0 && st.pendienteMadurez > 0) {
    return {
      regla: "reposicion_reciente",
      texto: "La reposición reciente aún no tuvo exposición suficiente para evaluarse",
      tono: "neutro",
      detalle: `${st.pendienteMadurez} ${st.pendienteMadurez === 1 ? "unidad entró" : "unidades entraron"} al piso hace poco: hace falta que maduren para leer su desempeño.`,
    };
  }

  // E. AGOTAMIENTO — vendió y cerró en 0. Con exposición corta, el texto avisa que la demanda pudo estar
  // limitada por el stock (nunca se presenta el ritmo observado como si fuera demanda plena, sección 20);
  // con exposición YA suficiente, el ritmo observado es un dato confiable y no hace falta esa salvedad.
  if (p.stockCierre === 0 && p.ventasNetas > 0) {
    const detalleBase = `Vendió ${unidades(p.ventasNetas)} y cerró sin stock.`;
    return x.muestraLimitada
      ? { regla: "agotada", texto: "Se agotó rápidamente; la demanda pudo estar limitada por stock", tono: "rojo", detalle: `${detalleBase} La exposición en piso fue corta: el ritmo observado pudo quedar corto frente a la demanda real.` }
      : { regla: "agotada", texto: "Se agotó: pendiente reponer", tono: "rojo", detalle: detalleBase };
  }

  // C. ESTANCAMIENTO — combinación de señales (sección 19: nunca solo «edad»): exposición YA suficiente
  // para confiar en la lectura, con stock, expuesta sin vender ≥14 días Y poco movimiento (cero ventas, o
  // sell-through de exposición bajo con stock relevante — no solo cero, «poco», sección 22).
  const pocoMovimiento = p.ventasNetas === 0 || (st.pct !== null && st.pct < LECTURA_ROTA_LENTO_PCT && p.stockCierre >= LECTURA_ROTA_LENTO_MIN_UNIDADES);
  if (!x.muestraLimitada && p.stockCierre > 0 && expuestaSinVenta !== null && expuestaSinVenta >= LECTURA_SIN_VENTAS_DIAS_MIN && pocoMovimiento) {
    return {
      regla: "estancamiento",
      texto: "Riesgo de estancamiento: mucha exposición y poco movimiento",
      tono: "ambar",
      detalle: `Expuesta en piso ${Math.round(expuestaSinVenta)} días sin una venta relevante, con ${unidades(p.stockCierre)} en stock.`,
    };
  }

  // D. PROBLEMA DE REPOSICIÓN — hay stock TOTAL, pero la exposición en piso es escasa: ahora mismo (misma
  // señal que «muestra limitada»), o lo fue en algún tramo del período (`tuvoQuiebre`: el piso llegó a 0 y
  // luego se repuso — evidencia histórica del mismo problema, no un evento distinto).
  if (p.stockCierre > 0 && (x.muestraLimitada || x.tuvoQuiebre)) {
    return {
      regla: "problema_reposicion",
      texto: "Hay inventario disponible, pero poca exposición en piso; revisar reposición",
      tono: "ambar",
      detalle: x.tuvoQuiebre
        ? "El piso llegó a 0 en algún momento del período y luego se repuso: cada quiebre es venta que no se hizo."
        : `Expuesta en piso ${x.diasConStockPiso === null ? "muy poco" : `${Math.round(x.diasConStockPiso)} de ${Math.round(dias)} días`} del período: la mayor parte del tiempo no estuvo disponible para la clienta.`,
    };
  }

  // B. BUENA RESPUESTA + SOBRESTOCK — rota bien en piso, pero la rotación total (en UNIDADES) cae muy por
  // debajo: gran parte del inventario duerme en almacén.
  if (x.sobrestockTotal) {
    return {
      regla: "sobrestock",
      texto: "Responde bien en piso, pero mantiene mucho inventario total",
      tono: "ambar",
      detalle: `Rotación en piso ${p.rotacionPisoUnidades.calculable ? formatoRotacion(p.rotacionPisoUnidades.veces) : "N/D"} contra ${p.rotacionTotalUnidades.calculable ? formatoRotacion(p.rotacionTotalUnidades.veces) : "N/D"} total (en unidades): gran parte del inventario no está expuesta en piso.`,
    };
  }

  // A. SALUDABLE — ritmo sostenido (exposición suficiente, ritmo positivo) y sin tendencia a la baja.
  if (!x.muestraLimitada && x.ritmo !== null && x.ritmo > 0 && (x.tendencia === null || x.tendencia.direccion !== "baja")) {
    return {
      regla: "saludable",
      texto: "Salida sostenida y mantiene velocidad",
      tono: "verde",
      detalle: `Ritmo observado ${formatoVelocidad(x.ritmo)} uds/día, con exposición suficiente en piso para confiar en el dato${x.tendencia?.direccion === "alza" ? ` y acelerando (${formatoVariacion(x.tendencia.variacionPct)})` : ""}.`,
    };
  }

  const medible = x.ritmo !== null || st.pct !== null || p.rotacionTotalUnidades.calculable || p.rotacionPisoUnidades.calculable;
  if (medible) return { regla: "sin_cambio", texto: "Sin cambio relevante", tono: "neutro", detalle: "Ninguna de las reglas de lectura se cumplió en este período." };

  // G. DATOS INSUFICIENTES — nada de lo anterior se pudo calcular: no hay una celda vacía sin explicar.
  return { regla: "datos_insuficientes", texto: "No hay historial suficiente para una lectura fiable", tono: "neutro", detalle: "Ni el ritmo, ni el sell-through de exposición, ni la rotación se pudieron calcular con el historial disponible." };
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
