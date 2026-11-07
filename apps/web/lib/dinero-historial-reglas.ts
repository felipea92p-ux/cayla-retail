// Cuentas y dinero ▸ Dónde está ▸ historial de movimientos entre cuentas (rediseño Felipe 2026-10-31, maqueta docs/maquetas/finanzas-dinero-rediseno-2026-10/):
// una ventana con el período que se quiere ver (día, semana, mes o todo), separada por día y paginada de 30 o 40. Lógica pura sobre los movimientos
// que la pantalla ya lee (`fn_movimientos_dinero`, los últimos 150): no pide nada nuevo a la base. El día de un movimiento es el de Lima.

import { diaLima } from "./fechas-lima";
import type { MovimientoDinero } from "./cuentas-dinero-reglas";

export type Periodo = "dia" | "semana" | "mes" | "todo";
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const aFecha = (d: string) => new Date(`${d}T12:00:00Z`);
const aTexto = (f: Date) => f.toISOString().slice(0, 10);
const sumarDias = (d: string, n: number) => {
  const f = aFecha(d);
  f.setUTCDate(f.getUTCDate() + n);
  return aTexto(f);
};

/** «martes 13 de octubre». */
export function nombreDeDia(d: string): string {
  const f = aFecha(d);
  return `${DIAS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES[f.getUTCMonth()]}`;
}

/** Desde y hasta (inclusive) del período que contiene `ref`: la semana va de lunes a domingo; «todo» no tiene tope. */
export function rangoDe(periodo: Periodo, ref: string): { desde: string; hasta: string } {
  if (periodo === "dia") return { desde: ref, hasta: ref };
  if (periodo === "semana") {
    const lunes = sumarDias(ref, -((aFecha(ref).getUTCDay() + 6) % 7));
    return { desde: lunes, hasta: sumarDias(lunes, 6) };
  }
  if (periodo === "mes") {
    const f = aFecha(ref);
    const desde = aTexto(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 1, 12)));
    const hasta = aTexto(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0, 12)));
    return { desde, hasta };
  }
  return { desde: "0000-01-01", hasta: "9999-12-31" };
}

/** El período, escrito: «jueves 15 de octubre de 2026», «12 – 18 de octubre», «octubre 2026». */
export function etiquetaDePeriodo(periodo: Periodo, ref: string): string {
  const { desde, hasta } = rangoDe(periodo, ref);
  if (periodo === "dia") return `${nombreDeDia(desde)} de ${desde.slice(0, 4)}`;
  if (periodo === "semana") {
    const a = aFecha(desde);
    const b = aFecha(hasta);
    return `${a.getUTCDate()}${a.getUTCMonth() !== b.getUTCMonth() ? ` de ${MESES[a.getUTCMonth()]}` : ""} – ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]}`;
  }
  if (periodo === "mes") return `${MESES[aFecha(desde).getUTCMonth()]} ${desde.slice(0, 4)}`;
  return "Todo el historial";
}

/** Pasa al período de al lado (`dir` = -1 o 1) sin pasarse de hoy. */
export function moverPeriodo(periodo: Periodo, ref: string, dir: -1 | 1, hoy: string): string {
  const f = aFecha(ref);
  const destino =
    periodo === "dia" ? sumarDias(ref, dir) : periodo === "semana" ? sumarDias(ref, 7 * dir) : aTexto(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + dir, 1, 12)));
  return destino > hoy ? hoy : destino;
}

/** ¿Hay un período siguiente? No si el actual ya llega a hoy (o si es «todo»). */
export const haySiguiente = (periodo: Periodo, ref: string, hoy: string): boolean => periodo !== "todo" && rangoDe(periodo, ref).hasta < hoy;

export const diaDe = (m: Pick<MovimientoDinero, "fecha">) => diaLima(m.fecha) ?? "0000-01-01";

export function delPeriodo<M extends Pick<MovimientoDinero, "fecha">>(movs: readonly M[], periodo: Periodo, ref: string): M[] {
  const { desde, hasta } = rangoDe(periodo, ref);
  return movs.filter((m) => {
    const d = diaDe(m);
    return d >= desde && d <= hasta;
  });
}

/** El día del movimiento más reciente que no pasa de `ref` (para saltar a un período que sí tiene algo); nulo si no hay. */
export function ultimoDiaConMovimientos(movs: readonly Pick<MovimientoDinero, "fecha">[], ref: string): string | null {
  const dias = movs.map(diaDe).filter((d) => d <= ref);
  return dias.length ? dias.reduce((a, b) => (a > b ? a : b)) : null;
}

/** ¿El movimiento toca esta cuenta, saliendo de ella o llegando a ella? */
export const tocaALaCuenta = (m: Pick<MovimientoDinero, "origenId" | "destinoId">, cuentaId: string): boolean => m.origenId === cuentaId || m.destinoId === cuentaId;

export type DiaDeMovimientos<M> = { dia: string; titulo: string; movs: M[]; total: number };
/** Los movimientos agrupados por día, del más nuevo al más viejo, con lo que sumó cada día (con signo si se mira una cuenta). */
export function agruparPorDia<M extends Pick<MovimientoDinero, "fecha" | "monto" | "destinoId">>(movs: readonly M[], cuentaId?: string): DiaDeMovimientos<M>[] {
  const g = new Map<string, M[]>();
  for (const m of movs) g.set(diaDe(m), [...(g.get(diaDe(m)) ?? []), m]);
  return [...g.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, lista]) => ({
      dia,
      titulo: nombreDeDia(dia),
      movs: lista,
      total: Math.round(lista.reduce((a, m) => a + (cuentaId && m.destinoId !== cuentaId ? -m.monto : m.monto), 0) * 100) / 100,
    }));
}
