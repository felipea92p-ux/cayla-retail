// Eficiencia del Taller (ADR-0133, F7; D-31 y D-33 de DECISIONES-2026-09-12). Puro: sin Supabase ni React.
//
// D-31 dice que el Taller NO le vende a las tiendas: el costo real de producir se pega a la prenda y viaja con ella, y el Taller se mide por lo que
// cuesta cada prenda terminada. Esa cuenta se arma con tres fuentes que ya existen, sin duplicar nada:
//   · MATERIALES: la tela, los avíos y la maquila que quedaron en las órdenes CERRADAS (costos reales, ya corregidos al cerrar).
//   · CONVERSIÓN: lo que cuesta transformar el material en prenda —la planilla del Taller (Dynamic, D-33: `retail.planilla_por_sede`, costo total con
//     provisiones y aportes) y los gastos generales del Taller (alquiler, servicios… en `gastos`, ubicación Taller)— dividido entre las prendas buenas.
//   · PRENDAS BUENAS: las de las órdenes cerradas en el período. Las segundas no se cuentan (el costo de lo que salió mal lo pagan las buenas).
// El período es el de la planilla de Dynamic (del 29 al 28). Sin planilla visible, NO se inventa la conversión: se dice que falta.
//
// La segunda mitad de D-31 —comparar contra una cotización real de maquila externa— la DESCARTÓ Felipe el 2026-09-22: no se registra ninguna cotización.

import { hoyLima, sumarDias } from "./fechas-lima";
import { redondear2 } from "./comprobantes-produccion-reglas";

export type PlanillaPeriodo = { periodoId: string; ini: string; fin: string; personas: number; pagado: number; provisiones: number; costoTotal: number };
export type GastoTaller = { categoria: string; total: number; fecha: string };
export type OrdenParaEficiencia = {
  id: string;
  referencia: string;
  estado: string;
  esMuestra: boolean;
  /** Cuándo entró al stock (cierre), `YYYY-MM-DD` en hora de Lima; `null` si no se cerró. */
  cerradaEn: string | null;
  fechaEntrega: string | null;
  cantidadPlan: number;
  cantidadBuenas: number | null;
  costoTela: number;
  costoAvios: number;
  costoMaquila: number;
};

export type VentanaPeriodo = { clave: string; ini: string; fin: string; etiqueta: string; planilla: PlanillaPeriodo | null };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
export const etiquetaPeriodo = (ini: string, fin: string) => `${corto(ini)} – ${corto(fin)}`;

/** Un timestamp de la base (UTC) a la fecha de Lima. */
export const fechaLimaDe = (iso: string | null): string | null => (iso ? hoyLima(new Date(iso)) : null);

/**
 * Los períodos a mirar, del más reciente al más viejo. Con planilla de Dynamic son sus períodos pagados (del 29 al 28). Sin planilla visible se usan los últimos 3
 * meses calendario, y `planilla` queda en `null`: la producción se mide igual, la conversión no.
 */
export function ventanasDePeriodos(planillas: PlanillaPeriodo[], hoy: string, cuantos = 6): VentanaPeriodo[] {
  if (planillas.length > 0)
    return [...planillas]
      .sort((a, b) => b.ini.localeCompare(a.ini))
      .slice(0, cuantos)
      .map((p) => ({ clave: p.periodoId, ini: p.ini, fin: p.fin, etiqueta: etiquetaPeriodo(p.ini, p.fin), planilla: p }));
  const out: VentanaPeriodo[] = [];
  const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    const ini = d.toISOString().slice(0, 10);
    const fin = sumarDias(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10), -1);
    out.push({ clave: ini, ini, fin, etiqueta: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`, planilla: null });
  }
  return out;
}

export type EficienciaPeriodo = {
  ventana: VentanaPeriodo;
  ordenesCerradas: number;
  prendasBuenas: number;
  prendasPlan: number;
  /** Buenas ÷ planeadas de las órdenes cerradas (0 a 1); `null` sin órdenes. */
  calidad: number | null;
  materiales: number;
  maquila: number;
  /** Planilla del Taller en el período (costo total, con provisiones y aportes); `null` si no se puede ver. */
  planilla: number | null;
  gastos: number;
  gastosPorCategoria: { categoria: string; total: number }[];
  /** (planilla + gastos) ÷ prendas buenas; `null` sin prendas o sin planilla (no se inventa). */
  conversionPorPrenda: number | null;
  /** (materiales + maquila) ÷ prendas buenas. */
  materialesPorPrenda: number | null;
  /** Costo real de una prenda: materiales + conversión. `null` si falta cualquiera de las dos. */
  costoPorPrenda: number | null;
  entregas: { aTiempo: number; tarde: number; sinFecha: number };
  /** Lo que gastó el Taller en el período: planilla + gastos + materiales y maquila de lo que cerró. */
  gastadoTotal: number;
};

const dentro = (f: string | null, v: VentanaPeriodo) => f !== null && f >= v.ini && f <= v.fin;

export function eficienciaDePeriodo(v: VentanaPeriodo, ordenes: OrdenParaEficiencia[], gastos: GastoTaller[]): EficienciaPeriodo {
  const cerradas = ordenes.filter((o) => o.estado === "terminada" && !o.esMuestra && (o.cantidadBuenas ?? 0) > 0 && dentro(o.cerradaEn, v));
  const buenas = cerradas.reduce((s, o) => s + (o.cantidadBuenas ?? 0), 0);
  const plan = cerradas.reduce((s, o) => s + o.cantidadPlan, 0);
  const materiales = redondear2(cerradas.reduce((s, o) => s + o.costoTela + o.costoAvios, 0));
  const maquila = redondear2(cerradas.reduce((s, o) => s + o.costoMaquila, 0));
  const delPeriodo = gastos.filter((g) => g.fecha >= v.ini && g.fecha <= v.fin);
  const gastosTotal = redondear2(delPeriodo.reduce((s, g) => s + g.total, 0));
  const porCat = new Map<string, number>();
  for (const g of delPeriodo) porCat.set(g.categoria, (porCat.get(g.categoria) ?? 0) + g.total);
  const planilla = v.planilla ? v.planilla.costoTotal : null;
  const conversion = buenas > 0 && planilla !== null ? redondear2((planilla + gastosTotal) / buenas) : null;
  const matPorPrenda = buenas > 0 ? redondear2((materiales + maquila) / buenas) : null;
  const entregas = { aTiempo: 0, tarde: 0, sinFecha: 0 };
  for (const o of cerradas) {
    if (!o.fechaEntrega || !o.cerradaEn) entregas.sinFecha++;
    else if (o.cerradaEn <= o.fechaEntrega) entregas.aTiempo++;
    else entregas.tarde++;
  }
  return {
    ventana: v,
    ordenesCerradas: cerradas.length,
    prendasBuenas: buenas,
    prendasPlan: plan,
    calidad: plan > 0 ? buenas / plan : null,
    materiales,
    maquila,
    planilla,
    gastos: gastosTotal,
    gastosPorCategoria: [...porCat.entries()].map(([categoria, total]) => ({ categoria, total: redondear2(total) })).sort((a, b) => b.total - a.total),
    conversionPorPrenda: conversion,
    materialesPorPrenda: matPorPrenda,
    costoPorPrenda: conversion !== null && matPorPrenda !== null ? redondear2(conversion + matPorPrenda) : null,
    entregas,
    gastadoTotal: redondear2(materiales + maquila + gastosTotal + (planilla ?? 0)),
  };
}

/** Cambio porcentual de `actual` respecto de `anterior` (0,1 = +10 %); `null` si falta alguno o el anterior es 0. */
export function variacion(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null;
  return (actual - anterior) / anterior;
}

export type PartePlata = { clave: "materiales" | "maquila" | "planilla" | "gastos"; etiqueta: string; monto: number; parte: number };

/** «¿En qué se fue la plata del Taller?»: cuánto de lo gastado fue material, maquila, planilla y gastos generales. Vacío si no se gastó nada. */
export function repartoDelGasto(e: EficienciaPeriodo): PartePlata[] {
  const total = e.gastadoTotal;
  if (total <= 0) return [];
  const partes: [PartePlata["clave"], string, number][] = [
    ["planilla", "Planilla (sueldos y cargas)", e.planilla ?? 0],
    ["materiales", "Tela y avíos de lo que cerró", e.materiales],
    ["maquila", "Maquila", e.maquila],
    ["gastos", "Gastos generales", e.gastos],
  ];
  return partes.filter(([, , m]) => m > 0).map(([clave, etiqueta, monto]) => ({ clave, etiqueta, monto, parte: monto / total }));
}
