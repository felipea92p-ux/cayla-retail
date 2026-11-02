// Finanzas ▸ Impuestos (ADR-0598): cuánto del costo de CAYLA tiene un papel que SUNAT acepta y qué renta tocaría pagar en marzo
// por el año. La declaración anual cobra sobre la utilidad, pero un costo sin comprobante no se resta (art. 20 y 37 de la Ley del
// Impuesto a la Renta): para SUNAT esa prenda costó cero. Lógica pura, sin React ni Supabase; las tasas y la UIT llegan de los
// parámetros tributarios, nunca escritas aquí.

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- El papel de cada costo ----------------------------------------------------------------------------------------------

/**
 * Qué hace cada papel en la renta del año:
 *  · `sustenta`: resta entero — factura, recibo por honorarios, planilla de movilidad (art. 37 inc. a1);
 *  · `con_tope`: resta solo hasta el 6 % de lo sustentado y 200 UIT al año — boleta y ticket (art. 37 inc. z, pensado para el
 *    Nuevo RUS; se asume que todo el que da boleta lo es, que es lo más favorable: el contador lo afina);
 *  · `no_sustenta`: no resta — nota de venta, sin comprobante, y cualquier papel que la regla todavía no conozca (lo prudente).
 */
export type ClasePapel = "sustenta" | "con_tope" | "no_sustenta";

const CLASE: Record<string, ClasePapel> = {
  factura: "sustenta",
  recibo_por_honorarios: "sustenta",
  planilla_movilidad: "sustenta",
  boleta: "con_tope",
  ticket: "con_tope",
};

export function clasePapel(papel: string): ClasePapel {
  return CLASE[papel] ?? "no_sustenta";
}

export type OrigenCosto = "mercaderia" | "taller" | "gasto";

/** Una fila de `fn_sustento_costos`: lo gastado sin IGV de un proveedor con un papel. */
export type FilaSustento = {
  origen: OrigenCosto;
  proveedorId: string | null;
  proveedor: string | null;
  papel: string;
  documentos: number;
  monto: number;
};

export function leerFilaSustento(f: Fila): FilaSustento {
  return {
    origen: (texto(f.origen) ?? "gasto") as OrigenCosto,
    proveedorId: texto(f.proveedor_id),
    proveedor: texto(f.proveedor),
    papel: texto(f.papel) ?? "sin_comprobante",
    documentos: num(f.documentos),
    monto: num(f.monto),
  };
}

// ---- Las tasas (de los parámetros tributarios) ---------------------------------------------------------------------------

/** Régimen MYPE Tributario: `tasaTramo` hasta `tramoUit` UIT de utilidad y `tasaResto` sobre lo demás; el tope de las boletas. */
export type TasasRenta = {
  uit: number;
  tramoUit: number;
  tasaTramo: number;
  tasaResto: number;
  topeBoletasPct: number;
  topeBoletasUit: number;
};

/** La renta del año sobre una utilidad tributaria: escala de dos tramos. Sin utilidad, cero. */
export function impuestoRenta(base: number, t: TasasRenta): number {
  if (!(base > 0)) return 0;
  const tramo = t.tramoUit * t.uit;
  return r2(Math.min(base, tramo) * t.tasaTramo + Math.max(0, base - tramo) * t.tasaResto);
}

/** Lo que cuesta en renta el último sol de utilidad: la tasa del tramo donde cae la base. */
export function tasaMarginal(base: number, t: TasasRenta): number {
  return base > t.tramoUit * t.uit ? t.tasaResto : t.tasaTramo;
}

// ---- Cuánto del costo tiene papel ----------------------------------------------------------------------------------------

export type Bolsa = { total: number; sustenta: number; conTope: number; noSustenta: number };

export type Sustento = {
  /** Lo que entra al inventario: mercadería y Taller. Se vende después, así que pesa por proporción sobre el costo de lo vendido. */
  inventario: Bolsa;
  /** Los gastos del período: se restan enteros el mismo año, así que pesan directo. */
  gasto: Bolsa;
  /** De las boletas y tickets, cuánto entra bajo el tope y cuánto se pasa. */
  boletasQueRestan: number;
  boletasQueNoRestan: number;
  /** Parte del inventario que no resta (sin papel + boletas sobre el tope), de 0 a 1. */
  pctInventarioSinSustento: number;
  /** Gastos que no restan (sin papel + su parte de las boletas sobre el tope). */
  gastoNoDeducible: number;
};

const bolsaVacia = (): Bolsa => ({ total: 0, sustenta: 0, conTope: 0, noSustenta: 0 });

export function resumirSustento(filas: readonly FilaSustento[], t: TasasRenta): Sustento {
  const inventario = bolsaVacia();
  const gasto = bolsaVacia();
  for (const f of filas) {
    const b = f.origen === "gasto" ? gasto : inventario;
    const clase = clasePapel(f.papel);
    b.total += f.monto;
    if (clase === "sustenta") b.sustenta += f.monto;
    else if (clase === "con_tope") b.conTope += f.monto;
    else b.noSustenta += f.monto;
  }
  // El tope de las boletas se mide contra TODO lo sustentado del año y se reparte entre inventario y gastos según cuánto aporta cada uno.
  const boletas = inventario.conTope + gasto.conTope;
  const tope = Math.max(0, Math.min((inventario.sustenta + gasto.sustenta) * t.topeBoletasPct, t.topeBoletasUit * t.uit));
  const restan = Math.min(boletas, tope);
  const sobran = boletas - restan;
  const parteInventario = boletas > 0 ? inventario.conTope / boletas : 0;
  const sinSustentoInventario = inventario.noSustenta + sobran * parteInventario;
  return {
    inventario: redondearBolsa(inventario),
    gasto: redondearBolsa(gasto),
    boletasQueRestan: r2(restan),
    boletasQueNoRestan: r2(sobran),
    pctInventarioSinSustento: inventario.total > 0 ? Math.min(1, Math.max(0, sinSustentoInventario / inventario.total)) : 0,
    gastoNoDeducible: r2(gasto.noSustenta + sobran * (1 - parteInventario)),
  };
}

const redondearBolsa = (b: Bolsa): Bolsa => ({ total: r2(b.total), sustenta: r2(b.sustenta), conTope: r2(b.conTope), noSustenta: r2(b.noSustenta) });

// ---- La renta de marzo ---------------------------------------------------------------------------------------------------

export type EntradaRenta = {
  /** Utilidad antes de impuestos del Estado de resultados (consolidado) en los meses con datos. */
  utilidad: number;
  /** Costo de lo vendido del Estado de resultados en esos meses. */
  costoVentas: number;
  /** Lo gastado por proveedor y papel en esos meses (`fn_sustento_costos`). */
  filas: readonly FilaSustento[];
  /** Cuántos meses cubren esas cifras (1 a 12). Con menos de 12 se proyecta el año a ese ritmo. */
  meses: number;
  /** Renta pagada a cuenta en esos meses (el 1 % mensual). */
  pagosACuenta: number;
};

export type RentaDelAno = {
  /** Por cuánto se multiplicó lo medido para llegar a un año (12 / meses; 1 si ya es un año). */
  factor: number;
  sustento: Sustento;
  utilidad: number;
  costoNoDeducible: number;
  gastoNoDeducible: number;
  /** La utilidad para SUNAT: la contable más lo que no resta. */
  baseRenta: number;
  renta: number;
  /** La renta si todo el costo tuviera factura. */
  rentaConFactura: number;
  /** Lo que la falta de papel suma a la renta. */
  cuestaSinFactura: number;
  pagosACuenta: number;
  /** Lo que quedaría por pagar en marzo, después de los pagos a cuenta. */
  faltaEnMarzo: number;
  tasaMarginal: number;
};

/** La renta del año, proyectada a 12 meses al ritmo de lo medido. */
export function proyectarRenta(e: EntradaRenta, t: TasasRenta): RentaDelAno {
  const meses = Math.min(12, Math.max(1, Math.round(e.meses)));
  const factor = 12 / meses;
  const anual = e.filas.map((f) => ({ ...f, monto: f.monto * factor }));
  const sustento = resumirSustento(anual, t);
  const utilidad = r2(e.utilidad * factor);
  const costoNoDeducible = r2(Math.max(0, e.costoVentas * factor) * sustento.pctInventarioSinSustento);
  const gastoNoDeducible = sustento.gastoNoDeducible;
  const baseRenta = r2(utilidad + costoNoDeducible + gastoNoDeducible);
  const renta = impuestoRenta(baseRenta, t);
  const rentaConFactura = impuestoRenta(utilidad, t);
  const pagosACuenta = r2(e.pagosACuenta * factor);
  return {
    factor,
    sustento,
    utilidad,
    costoNoDeducible,
    gastoNoDeducible,
    baseRenta,
    renta,
    rentaConFactura,
    cuestaSinFactura: r2(renta - rentaConFactura),
    pagosACuenta,
    faltaEnMarzo: r2(Math.max(0, renta - pagosACuenta)),
    tasaMarginal: tasaMarginal(baseRenta, t),
  };
}
