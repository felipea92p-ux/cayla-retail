// Cuentas y dinero ▸ Dónde está: el resumen de arriba, un círculo que reparte la plata entre las sedes (Felipe 2026-10-28, que pidió
// presentarla como un informe y no como una lista). Lógica pura: no suma plata que la base no haya sumado, solo toma los grupos que ya
// armó `gruposDeDinero` y decide qué porción del círculo le toca a cada uno.
//
// Un círculo reparte un total entre partes que valen MÁS que cero. Lo que tiene saldo negativo (hoy, «En camino» cuando se anotaron
// más depósitos que ventas con tarjeta) no cabe en una porción: se dice aparte, y el total resta lo negativo para que coincida con el
// «Tienes» de la cabecera. Un grupo en cero no se dibuja. Con menos de dos porciones el círculo no dice nada (una sede elegida es
// un solo grupo): no hay resumen y la pantalla muestra solo las cuentas.

import { colorDeGrupo, type GrupoCuentas } from "./dinero-telar-reglas";
import type { SedeTelar } from "./finanzas-telar-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PorcionReparto = {
  clave: string;
  titulo: string;
  monto: number;
  /** Cuánto del círculo, de 0 a 100, exacto. */
  pct: number;
  /** El mismo porcentaje en enteros que SUMAN 100 (si no, un círculo de tres tercios diría 33 + 33 + 33). */
  pctEntero: number;
  /** Un token de color (`var(--color-sede-*)`), el mismo que la sede tiene en toda Finanzas. */
  color: string;
  /** Dónde empieza y termina en grados desde arriba, en el sentido del reloj; la primera empieza en 0 y la última acaba en 360. */
  desde: number;
  hasta: number;
};

export type RepartoDeDinero = {
  /** De la que más tiene a la que menos: así se lee un informe. */
  porciones: PorcionReparto[];
  /** Los grupos con saldo negativo: no entran al círculo. */
  aparte: { clave: string; titulo: string; monto: number }[];
  /** Lo que suman las porciones. */
  enCuentas: number;
  /** Todo, restando lo negativo: es el «Tienes» de la cabecera. */
  neto: number;
  /** Algún grupo tiene un saldo que no le toca ver a quien mira: lo que suma no lo incluye. */
  ocultos: boolean;
};

/** Reparte 100 en enteros por el método del mayor resto: la suma da siempre 100 y a nadie se le quita de más. */
export function porcentajesEnteros(partes: readonly number[]): number[] {
  const total = partes.reduce((a, b) => a + b, 0);
  if (total <= 0) return partes.map(() => 0);
  const exactos = partes.map((p) => (p / total) * 100);
  const base = exactos.map(Math.floor);
  let faltan = 100 - base.reduce((a, b) => a + b, 0);
  const porResto = exactos.map((e, i) => ({ i, resto: e - base[i]! })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    base[i]! += 1;
    faltan -= 1;
  }
  return base;
}

/** El resumen de «Dónde está», o nulo si no hay al menos dos grupos con plata (un círculo de una sola porción no cuenta nada). */
export function repartoDeDinero(grupos: readonly GrupoCuentas[], sedes: readonly Pick<SedeTelar, "clave" | "color">[]): RepartoDeDinero | null {
  const conPlata = grupos.filter((g) => g.total > 0).sort((a, b) => b.total - a.total);
  if (conPlata.length < 2) return null;
  const enCuentas = r2(conPlata.reduce((a, g) => a + g.total, 0));
  const enteros = porcentajesEnteros(conPlata.map((g) => g.total));
  let acumulado = 0;
  const porciones = conPlata.map((g, i) => {
    const pct = (g.total / enCuentas) * 100;
    const desde = acumulado;
    acumulado += (g.total / enCuentas) * 360;
    return {
      clave: g.clave,
      titulo: g.titulo,
      monto: g.total,
      pct,
      pctEntero: enteros[i]!,
      color: colorDeGrupo(g.clave, sedes),
      desde,
      hasta: i === conPlata.length - 1 ? 360 : acumulado,
    };
  });
  const aparte = grupos.filter((g) => g.total < 0).map((g) => ({ clave: g.clave, titulo: g.titulo, monto: g.total }));
  return {
    porciones,
    aparte,
    enCuentas,
    neto: r2(grupos.reduce((a, g) => a + g.total, 0)),
    ocultos: grupos.some((g) => g.ocultos),
  };
}

/**
 * El trazo de una porción del anillo, de `desde` a `hasta` grados (0 = arriba, en el sentido del reloj) sobre un radio `r` con el
 * centro en `c`. Deja un hueco entre porciones —de `hueco` grados, nunca más de dos quintos de la porción: una rebanada fina no
 * puede desaparecer ni voltearse—, así se ve de dónde a dónde va cada una.
 */
export function trazoDeArco(desde: number, hasta: number, r: number, c = 100, hueco = 2.4): string {
  const h = Math.min(hueco, (hasta - desde) * 0.4) / 2;
  const a0 = desde + h;
  const a1 = hasta - h;
  const punto = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${r2(c + r * Math.sin(rad))} ${r2(c - r * Math.cos(rad))}`;
  };
  return `M${punto(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${punto(a1)}`;
}
