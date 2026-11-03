// Finanzas ▸ Impuestos (ADR-0598): cuánto del costo de CAYLA tiene un papel que SUNAT acepta y qué renta tocaría pagar en marzo
// por el año. La declaración anual cobra sobre la utilidad, pero un costo sin comprobante no se resta (art. 20 y 37 de la Ley del
// Impuesto a la Renta): para SUNAT esa prenda costó cero. Lógica pura, sin React ni Supabase; las tasas y la UIT llegan de los
// parámetros tributarios, nunca escritas aquí.

import { delAnio, vigenteEnAnio, type NombreParametro, type ParametroFila } from "./impuestos-reglas";

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

/**
 * Lo del año ANTES de que Finanzas tuviera datos, según el contador (Configuración ▸ Impuestos). Su contador anota solo lo que tiene comprobante
 * (Felipe, 2026-11-02): su utilidad YA trae como cero lo comprado sin factura, así que entra a la base tal cual; `sinPapel` solo dice cuánto costó.
 */
export type PrevioRenta = { meses: number; utilidad: number; sinPapel: number; pagado: number };

export type EntradaRenta = {
  /** Utilidad antes de impuestos del Estado de resultados (consolidado) en los meses con datos. */
  utilidad: number;
  /** Costo de lo vendido del Estado de resultados en esos meses. */
  costoVentas: number;
  /** Lo gastado por proveedor y papel en esos meses (`fn_sustento_costos`). */
  filas: readonly FilaSustento[];
  /** Cuántos meses cubren esas cifras (puede ser fracción: un mes y dos días es 1.07). Lo que falta del año se proyecta a ese ritmo. */
  meses: number;
  /** Renta pagada a cuenta en esos meses (el 1 % mensual). */
  pagosACuenta: number;
  /** Lo de antes del sistema, si el contador ya lo dio; sin él, todo el año sale del ritmo del sistema. */
  previo?: PrevioRenta | null;
};

export type RentaDelAno = {
  /** Por cuánto se multiplicó lo medido por el sistema para cubrir lo que el contador no cubre (sin «lo de antes», 12 / meses). */
  factor: number;
  /** Meses que vienen del contador (0 si no se cargó «lo de antes»). */
  mesesPrevio: number;
  sustento: Sustento;
  utilidad: number;
  costoNoDeducible: number;
  gastoNoDeducible: number;
  /** La utilidad para SUNAT: la contable más lo que no resta. */
  baseRenta: number;
  renta: number;
  /** La renta si todo el costo tuviera factura. */
  rentaConFactura: number;
  /** Lo que la falta de papel suma a la renta (incluye lo comprado sin factura antes del sistema). */
  cuestaSinFactura: number;
  pagosACuenta: number;
  /** Lo que quedaría por pagar en marzo, después de los pagos a cuenta. */
  faltaEnMarzo: number;
  tasaMarginal: number;
};

/**
 * La renta del año: lo de antes del sistema (si está) más lo del sistema proyectado a los meses que faltan, al ritmo medido.
 * Solo la parte del sistema suma de vuelta el costo sin papel: la del contador ya no lo restó.
 */
export function proyectarRenta(e: EntradaRenta, t: TasasRenta): RentaDelAno {
  const previo = e.previo ?? null;
  const mesesPrevio = previo ? Math.min(11, Math.max(0, Math.round(previo.meses))) : 0;
  const restante = 12 - mesesPrevio;
  const meses = Math.min(restante, Math.max(1, e.meses));
  const factor = restante / meses;
  const anual = e.filas.map((f) => ({ ...f, monto: f.monto * factor }));
  const sustento = resumirSustento(anual, t);
  const utilidad = r2(e.utilidad * factor + (previo?.utilidad ?? 0));
  const costoNoDeducible = r2(Math.max(0, e.costoVentas * factor) * sustento.pctInventarioSinSustento);
  const gastoNoDeducible = sustento.gastoNoDeducible;
  const baseRenta = r2(utilidad + costoNoDeducible + gastoNoDeducible);
  const renta = impuestoRenta(baseRenta, t);
  // Si todo hubiera tenido factura: lo del sistema ya trae su costo; lo del contador habría restado lo que compró sin papel.
  const rentaConFactura = impuestoRenta(utilidad - (previo?.sinPapel ?? 0), t);
  const pagosACuenta = r2(e.pagosACuenta * factor + (previo?.pagado ?? 0));
  return {
    factor,
    mesesPrevio,
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

// ---- Lo que la tarjeta de Impuestos necesita, armado desde lo que lee el servidor --------------------------------------------

/** La escala de la renta del año, de los parámetros tributarios. `null` si falta alguno (la base no tiene la migración o la UIT del año). */
export function tasasDelAno(parametros: readonly ParametroFila[], anio: number): TasasRenta | null {
  const v = (n: NombreParametro) => vigenteEnAnio(parametros, n, anio)?.valor ?? null;
  const t = {
    uit: v("uit"),
    tramoUit: v("renta_tramo_uit"),
    tasaTramo: v("renta_tasa_tramo"),
    tasaResto: v("renta_tasa_resto"),
    topeBoletasPct: v("boletas_tope_pct"),
    topeBoletasUit: v("boletas_tope_uit"),
  };
  return Object.values(t).some((x) => x === null) ? null : (t as TasasRenta);
}

/** «Lo de antes del sistema» del año, si se cargó al menos la utilidad del contador. Cubre de enero al mes antes de que Finanzas empezara. */
export function previoDelAno(parametros: readonly ParametroFila[], anio: number, mesesPrevio: number): PrevioRenta | null {
  if (mesesPrevio <= 0) return null;
  const utilidad = delAnio(parametros, "renta_utilidad_previa", anio)?.valor ?? null;
  if (utilidad === null) return null;
  return {
    meses: mesesPrevio,
    utilidad,
    sinPapel: delAnio(parametros, "renta_sin_papel_previo", anio)?.valor ?? 0,
    pagado: delAnio(parametros, "renta_pagada_previa", anio)?.valor ?? 0,
  };
}

/** Desde cuándo cuenta el sistema en el año: el 1 de enero, o el inicio de Finanzas si fue después. */
export function desdeDelSistema(anio: number, inicioFinanzas: string | null): string {
  const enero = `${anio}-01-01`;
  return inicioFinanzas && inicioFinanzas > enero ? inicioFinanzas : enero;
}

/** Cuántos meses (con fracción) hay de `desde` a `hasta`, los dos incluidos: del 1 de octubre al 2 de noviembre, 1.07. */
export function mesesEntre(desde: string, hasta: string): number {
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  return Math.max(0, dias / (365.25 / 12));
}

export type RentaPantalla = {
  anio: number;
  desdeSistema: string;
  hasta: string;
  mesesSistema: number;
  /** Meses de enero que el sistema no cubre (de enero al inicio de Finanzas). */
  mesesAntes: number;
  /** ¿El contador ya dio lo de esos meses? Si no, el año entero sale del ritmo del sistema. */
  previoCargado: boolean;
  proyeccion: RentaDelAno;
  /** El costo por papel tal como se midió desde `desdeSistema` (sin proyectar): lo que dibuja la barra y lista la hoja. */
  medido: Sustento;
  filas: FilaSustento[];
};

/** Arma la tarjeta; `null` si falta la escala (sin ella no hay renta que estimar: la tarjeta lo dice). */
export function armarRentaDelAno(e: {
  hoy: string;
  inicioFinanzas: string | null;
  parametros: readonly ParametroFila[];
  filas: readonly FilaSustento[];
  utilidad: number;
  costoVentas: number;
  ventasSinIgv: number;
}): RentaPantalla | null {
  const anio = Number(e.hoy.slice(0, 4));
  const tasas = tasasDelAno(e.parametros, anio);
  if (!tasas) return null;
  const desdeSistema = desdeDelSistema(anio, e.inicioFinanzas);
  const mesesAntes = Number(desdeSistema.slice(5, 7)) - 1;
  const previo = previoDelAno(e.parametros, anio, mesesAntes);
  const tasaPagoCuenta = vigenteEnAnio(e.parametros, "renta_pago_cuenta", anio)?.valor ?? 0;
  const mesesSistema = mesesEntre(desdeSistema, e.hoy);
  const proyeccion = proyectarRenta(
    { utilidad: e.utilidad, costoVentas: e.costoVentas, filas: e.filas, meses: mesesSistema, pagosACuenta: e.ventasSinIgv * tasaPagoCuenta, previo },
    tasas
  );
  return { anio, desdeSistema, hasta: e.hoy, mesesSistema, mesesAntes, previoCargado: previo !== null, proyeccion, medido: resumirSustento(e.filas, tasas), filas: [...e.filas] };
}

// ---- A quién pedirle factura -----------------------------------------------------------------------------------------------

export type ProveedorSinFactura = {
  clave: string;
  /** `null`: gastos sin proveedor (luz, taxis…). */
  proveedor: string | null;
  origen: OrigenCosto;
  /** Lo comprado sin papel que resta (nota de venta, sin comprobante). */
  sinPapel: number;
  /** Lo comprado con boleta o ticket: resta solo bajo el tope del 6 %. */
  enBoleta: number;
  documentos: number;
  /** La renta que se ahorraría si todo eso viniera con factura, a la tasa del último sol. */
  ahorroRenta: number;
  /** Hasta cuánto (sin IGV) se le podría pagar con factura y salir igual: lo de hoy / (1 − tasa). El IGV de la factura se recupera aparte. */
  precioConFactura: number;
};

/** Los proveedores ordenados por lo que se les compró sin factura, de mayor a menor: por quién empezar a pedirla. */
export function proveedoresSinFactura(filas: readonly FilaSustento[], tasa: number): ProveedorSinFactura[] {
  const grupos = new Map<string, ProveedorSinFactura>();
  for (const f of filas) {
    const clase = clasePapel(f.papel);
    if (clase === "sustenta") continue;
    const clave = `${f.origen}:${f.proveedorId ?? "sin-proveedor"}`;
    const g = grupos.get(clave) ?? { clave, proveedor: f.proveedor, origen: f.origen, sinPapel: 0, enBoleta: 0, documentos: 0, ahorroRenta: 0, precioConFactura: 0 };
    if (clase === "con_tope") g.enBoleta += f.monto;
    else g.sinPapel += f.monto;
    g.documentos += f.documentos;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => {
      const total = g.sinPapel + g.enBoleta;
      return { ...g, sinPapel: r2(g.sinPapel), enBoleta: r2(g.enBoleta), ahorroRenta: r2(total * tasa), precioConFactura: r2(total / (1 - tasa)) };
    })
    .filter((g) => g.sinPapel + g.enBoleta > 0)
    .sort((a, b) => b.sinPapel + b.enBoleta - (a.sinPapel + a.enBoleta) || (a.proveedor ?? "").localeCompare(b.proveedor ?? "", "es"));
}
