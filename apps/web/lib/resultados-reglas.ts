// Reglas de presentación del Estado de Resultados (ADR-0109 / ADR-0120), sin acceso a datos.
//
// Qué NO hace este archivo: calcular plata. Todas las cifras vienen de `fn_estado_resultados` (que
// lee del diario `fn_asientos`); aquí solo se decide cómo se muestran, qué avisos se levantan y qué
// dice la ayuda «(!)» de cada cifra. Si un número está mal, se corrige en la base, no aquí.

export type DetalleMerma = { regla: string; monto: number };
export type DetalleGasto = { cuenta: string; nombre: string; monto: number };

export type FilaResultados = {
  /** `null` en «De la empresa» y en el consolidado (los distingue `esConsolidado`). */
  ubicacionId: string | null;
  nombre: string;
  esConsolidado: boolean;
  ventasNetas: number;
  costoVentas: number;
  fletes: number;
  mermas: number;
  margenBruto: number;
  gastosOperacion: number;
  utilidadOperativa: number;
  igvVentas: number;
  ventasBrutas: number;
  detalleMermas: DetalleMerma[];
  detalleGastos: DetalleGasto[];
  unidadesSinCosto: number;
  mermasSinCosto: number;
  asientosDescuadrados: number;
};

/** Consolidado arriba, luego las sedes y al final «De la empresa» (la base ya las entrega en ese orden). */
export function separarFilas(filas: FilaResultados[]): { consolidado: FilaResultados | null; sedes: FilaResultados[]; empresa: FilaResultados | null } {
  return {
    consolidado: filas.find((f) => f.esConsolidado) ?? null,
    sedes: filas.filter((f) => !f.esConsolidado && f.ubicacionId !== null),
    empresa: filas.find((f) => !f.esConsolidado && f.ubicacionId === null) ?? null,
  };
}

/** «S/ 1,234.50», y «−S/ 93.57» para un negativo (con el signo menos de verdad, no el guion). */
export function solesConSigno(n: number): string {
  const abs = Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 && Math.round(Math.abs(n) * 100) > 0 ? `−S/ ${abs}` : `S/ ${abs}`;
}

/** Margen bruto sobre ventas netas, en %, o `null` si no hubo ventas (dividir entre cero no es un margen). */
export function porcentajeMargen(f: Pick<FilaResultados, "margenBruto" | "ventasNetas">): number | null {
  return f.ventasNetas > 0 ? Math.round((f.margenBruto / f.ventasNetas) * 1000) / 10 : null;
}

export function textoPorcentaje(p: number | null): string {
  if (p === null) return "—";
  const abs = Math.abs(p).toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${p < 0 ? "−" : ""}${abs} %`;
}

/** «De la empresa» no vende ni tiene mercadería: solo gastos. Mostrarle cinco ceros no dice nada. */
export const esEmpresa = (f: Pick<FilaResultados, "ubicacionId" | "esConsolidado">): boolean => f.ubicacionId === null && !f.esConsolidado;

/** Una fila sin ninguna actividad: la tarjeta se dibuja apagada («todavía no hay datos»). */
export const sinActividad = (f: FilaResultados): boolean =>
  f.ventasNetas === 0 && f.costoVentas === 0 && f.mermas === 0 && f.gastosOperacion === 0 && f.fletes === 0;

export type Aviso = { tono: "ambar" | "rojo"; texto: string };

/**
 * Lo que vuelve honestas las cifras. Un margen inflado en silencio es peor que un aviso, y un
 * número calculado sobre datos que no cuadran es peor que ninguno.
 */
export function avisosDe(f: FilaResultados): Aviso[] {
  const out: Aviso[] = [];
  if (f.asientosDescuadrados > 0) {
    out.push({
      tono: "rojo",
      texto: `${f.asientosDescuadrados === 1 ? "Hay 1 operación" : `Hay ${f.asientosDescuadrados} operaciones`} cuyo cobro no suma lo que se vendió. Estas cifras no son confiables hasta revisarlo.`,
    });
  }
  if (f.unidadesSinCosto > 0) {
    out.push({
      tono: "ambar",
      texto: `${f.unidadesSinCosto === 1 ? "1 prenda vendida sin costo cargado" : `${f.unidadesSinCosto} prendas vendidas sin costo cargado`}: su costo no está restado y el margen sale más alto de lo real.`,
    });
  }
  if (f.mermasSinCosto > 0) {
    out.push({
      tono: "ambar",
      texto: `${f.mermasSinCosto === 1 ? "1 prenda perdida" : `${f.mermasSinCosto} prendas perdidas`} no se pudo valorizar (sin costo): las mermas están subestimadas.`,
    });
  }
  return out;
}

/** El origen de cada merma, como lo lee quien decide (la base entrega el código de la regla). */
export function etiquetaOrigenMerma(regla: string): string {
  switch (regla) {
    case "merma_merma":
      return "Mermas registradas a mano";
    case "merma_cuarentena":
      return "Prendas dañadas botadas o donadas";
    case "merma_conteo":
      return "Faltantes de conteo";
    case "anulacion":
      return "Ventas anuladas con prenda no vendible";
    default:
      return regla;
  }
}

/** Texto de la ayuda «(!)» de cada cifra: de dónde sale, en lenguaje CAYLA. */
export const AYUDA = {
  ventas: {
    titulo: "Ventas netas",
    texto:
      "Lo que vendieron las tiendas este mes SIN el IGV (el 18 % que se le paga a SUNAT y no es tuyo). Sale de las ventas registradas en Vender, y ya descuenta las anulaciones, devoluciones y cambios que ocurrieron ESTE mes, aunque la venta original sea de otro mes.",
  },
  costo: {
    titulo: "Costo de ventas",
    texto:
      "Lo que costó lo que se vendió, con el costo que tenía cada prenda el día de la venta (queda guardado en la venta). Si una prenda no tiene costo cargado, su costo NO entra y el margen sale más alto de lo real: por eso te avisamos cuántas son.",
  },
  mermas: {
    titulo: "Mermas",
    texto:
      "Prendas que se perdieron: dañadas que se botaron o donaron, mermas registradas y faltantes de conteo, valorizadas al costo de ese día. No incluye lo que se devolvió al proveedor (eso no es pérdida) ni los sobrantes de conteo.",
  },
  fletes: {
    titulo: "Fletes de compra",
    texto:
      "El flete de un fardo pertenece al margen bruto, pero todavía no hay dónde registrarlo en el sistema. Mientras tanto no se resta y el margen sale un poco más alto de lo real.",
  },
  margen: {
    titulo: "Margen bruto",
    texto:
      "Ventas netas − costo − mermas − fletes: lo que deja la mercadería antes de pagar el local y la gente. El porcentaje es cuántos soles de cada 100 vendidos quedan después de pagar la mercadería.",
  },
  gastos: {
    titulo: "Gastos de operación",
    texto:
      "Alquiler, luz, planilla, publicidad… lo que registraste en Gastos con fecha de este mes, sin el IGV de las facturas. Los gastos «de la empresa» (oficina, contador) no pertenecen a ninguna tienda: solo se suman en el consolidado.",
  },
  utilidad: {
    titulo: "Utilidad operativa",
    texto:
      "Margen bruto − gastos de operación: si el negocio ganó o perdió operando este mes. Todavía NO resta la depreciación de equipos ni el impuesto a la renta, y el mes aún no se puede cerrar: si se registra algo con fecha de este mes, cambia.",
  },
} as const;

/** Lo que este estado simplifica, dicho a la vista (nunca escondido). */
export const SIMPLIFICACIONES = [
  "Todavía no se puede cerrar un mes: si alguien registra un gasto, una anulación o una devolución con fecha de un mes pasado, ese mes cambia.",
  "El costo es el promedio ponderado por prenda (no por lote): dos fardos con costo distinto se mezclan.",
  "Sin depreciación de equipos, sin impuesto a la renta y sin fletes de compra: todavía no hay dónde registrarlos.",
  "Las ventas de prendas hechas en el Taller no se separan de las de mercadería comprada: todo se cuenta como venta de mercadería.",
] as const;
