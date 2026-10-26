import type { Recorrido, TipoHilo } from "./recorrido-plata-reglas";

// Finanzas ▸ Resumen, «De cada S/ 100 que vendes» (Felipe 2026-10-24, spike 3-A). Lógica pura: el recorrido de la plata dicho en la unidad que
// cualquiera entiende. NO calcula plata: toma los hilos que ya armó `recorridoPlata` (lo que entra es igual a lo que sale) y los pone sobre 100.
//
// UNA CUENTA QUE SUMA 100. Cada parte se reparte en cuadros con el método del mayor resto, así que los cuadros suman exactamente 100 (no 99 ni 101 por
// redondear). La base es lo que pasa por el nudo del recorrido: lo vendido más lo poco que sobró en caja, para que lo que entra sea igual a lo que sale.
// Si el mes pierde, no hay cuadro que llenar de verde: solo se dice cuánto se gasta por cada S/ 100 que se vende.

export type ParteCien = { clave: string; nombre: string; tipo: TipoHilo; sedeId?: string; monto: number; cuadros: number };

export type DeCadaCien =
  | { tipo: "queda"; partes: ParteCien[]; queda: number; chip: string; titular: string }
  | { tipo: "pierde"; gastas: number; chip: string; titular: string };

const sol = (n: number) => `S/ ${n}`;

/** Reparte `total` cuadros entre las partes según su monto, con el método del mayor resto: siempre suman `total`. */
export function repartirCuadros(montos: readonly number[], total = 100): number[] {
  const suma = montos.reduce((a, b) => a + b, 0);
  if (suma <= 0) return montos.map(() => 0);
  const brutos = montos.map((m) => (m / suma) * total);
  const base = brutos.map(Math.floor);
  let faltan = total - base.reduce((a, b) => a + b, 0);
  const orden = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((x, y) => y.resto - x.resto || x.i - y.i);
  for (const { i } of orden) {
    if (faltan <= 0) break;
    base[i]! += 1;
    faltan -= 1;
  }
  return base;
}

export function deCadaCien(rec: Recorrido | null): DeCadaCien | null {
  // Solo «vende» (CAYLA o una tienda): lo del Taller y la Empresa no vende, no hay «cada S/ 100 que vendes».
  // Sin ventas no hay «cada S/ 100 que vendes»: un mes que solo tiene un sobrante de caja diría «te quedan S/ 100 de cada S/ 100».
  if (!rec || rec.modo !== "vende" || rec.nudo.total <= 0 || rec.nudo.monto <= 0) return null;

  if (rec.resultado <= -0.5) {
    // Lo que entró de verdad es lo que se vendió (más un sobrante): el hilo «Te faltan» es el hueco, no una venta.
    const falta = rec.entradas.filter((h) => h.tipo === "falta").reduce((a, h) => a + h.monto, 0);
    const base = rec.nudo.total - falta;
    if (base <= 0) return null;
    const gastas = Math.round((rec.nudo.total / base) * 100);
    return { tipo: "pierde", gastas, chip: `Por cada ${sol(100)} vendidos, gastas ${sol(gastas)}`, titular: `Por cada ${sol(100)} que vendes, gastas ${sol(gastas)}.` };
  }

  const salidas = rec.salidas.filter((h) => h.monto > 0);
  const cuadros = repartirCuadros(salidas.map((h) => h.monto));
  const partes: ParteCien[] = salidas.map((h, i) => ({ clave: h.clave, nombre: h.nombre, tipo: h.tipo, sedeId: h.sedeId, monto: h.monto, cuadros: cuadros[i]! }));
  const queda = partes.filter((p) => p.tipo === "deja").reduce((a, p) => a + p.cuadros, 0);
  return {
    tipo: "queda",
    partes,
    queda,
    chip: queda > 0 ? `De cada ${sol(100)} vendidos, te quedan ${sol(queda)}` : `De cada ${sol(100)} vendidos, no te queda nada`,
    titular: queda > 0 ? `De cada ${sol(100)} que vendes, te quedan ${sol(queda)}.` : `De cada ${sol(100)} que vendes, no te queda nada.`,
  };
}
