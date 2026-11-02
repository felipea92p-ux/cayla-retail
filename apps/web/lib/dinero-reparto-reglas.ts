// Cuentas y dinero ▸ Dónde está: el círculo de la franja de arriba (vuelve el 2026-10-31, Felipe: «en la franja», en lugar de la barra partida
// que dejó el rediseño «Fusión»). Es TODA la plata de lo que se mira, partida en una porción por cuenta (Felipe 2026-10-28: que el banco grande
// no se esconda detrás de un rótulo). Lógica pura: no suma plata que la base no haya sumado, solo toma las filas de `filasDeEstado` y decide qué
// porción le toca a cada cuenta y de qué color.
//
// El color sale de la ETAPA, no de la sede: al lado del círculo están las cuatro etapas, y un color que no calza con su celda obliga a adivinar.
// Sigue siendo lo que Felipe pidió el 28-oct («más color, el verde claro y los terracotas de CAYLA»): los bancos en verdes, lo que viene en camino
// en pizarra, y las cajas fuertes y los cajones —que son de las tiendas— en terracotas. Siempre tokens (ADR-0169), nunca un hex.
//
// Un círculo reparte un total entre partes que valen MÁS que cero: una cuenta en negativo no cabe en una porción y se dice aparte; una en cero o
// con el saldo oculto no se dibuja.

import { ETAPAS_EN_ORDEN, type EtapaDinero, type FilaEstado } from "./dinero-estados-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const token = (nombre: string) => `var(--color-${nombre})`;

/** Los tonos de cada etapa: el primero es el firme (el filete de su celda y la insignia de sus cuentas, con letra crema encima: tiene que ser
 *  oscuro); los demás distinguen a la segunda y la tercera cuenta de la misma etapa. */
const TONOS_ETAPA: Record<EtapaDinero, readonly string[]> = {
  banco: ["verde", "reparto-verde-claro", "reparto-menta"],
  camino: ["pizarra", "reparto-pizarra-claro"],
  deposito: ["rojo-profundo", "reparto-terracota", "reparto-arcilla"],
  caja: ["taupe", "reparto-ocre"],
};

/** El color firme de una etapa: el de su celda en la franja y el de la insignia de sus cuentas en «Mis cuentas». */
export const colorDeEtapa = (etapa: EtapaDinero): string => token(TONOS_ETAPA[etapa][0]!);

export type PorcionReparto = {
  id: string;
  nombre: string;
  /** La sede de la cuenta («Tienda Lima»): con dos cajones, «Cajón» solo no dice cuál es. Nulo si todavía no tiene sede (lo que viene en camino). */
  lugar: string | null;
  etapa: EtapaDinero;
  monto: number;
  /** El porcentaje en enteros que SUMAN 100; cero si pesa menos de 1 % (el círculo dice «menos de 1 %»). */
  pctEntero: number;
  color: string;
  /** Dónde empieza y termina, en grados desde arriba y en el sentido del reloj; la primera empieza en 0 y la última acaba en 360. */
  desde: number;
  hasta: number;
};

export type Reparto = {
  /** En el orden de las etapas (del banco a la caja, como las celdas de al lado) y, dentro de cada una, de la que más tiene a la que menos. */
  porciones: PorcionReparto[];
  /** Lo que suman las cuentas en negativo (cero o menos): no entran al círculo. */
  negativo: number;
};

/**
 * Reparte 100 en enteros por el mayor resto: la suma da siempre 100. Lo que pesa menos de 1 % queda en cero y no participa del reparto,
 * así no se le regala un punto que otra porción necesita.
 */
function porcentajesEnteros(partes: readonly number[]): number[] {
  const total = partes.reduce((a, b) => a + b, 0);
  if (total <= 0) return partes.map(() => 0);
  const exactos = partes.map((p) => (p / total) * 100);
  const base = exactos.map((e) => (e < 1 ? 0 : Math.floor(e)));
  let faltan = 100 - base.reduce((a, b) => a + b, 0);
  const porResto = exactos
    .map((e, i) => ({ i, e, resto: e - base[i]! }))
    .filter((x) => x.e >= 1)
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    base[i]! += 1;
    faltan -= 1;
  }
  return base;
}

/** El círculo de lo que se ve. El tono de una cuenta depende de su lugar en la lista de su etapa, no de su saldo: una cuenta no cambia de
 *  color porque hoy tenga más o menos plata. */
export function repartoPorCuenta(filas: readonly Pick<FilaEstado, "id" | "nombre" | "sede" | "sinSede" | "etapa" | "saldo">[]): Reparto {
  type Cuenta = { id: string; nombre: string; lugar: string | null; etapa: EtapaDinero; monto: number; color: string };
  const positivas: Cuenta[] = [];
  let negativo = 0;
  for (const etapa of ETAPAS_EN_ORDEN) {
    const suyas = filas.filter((f) => f.etapa === etapa);
    const tonos = TONOS_ETAPA[etapa];
    const conPlata: Cuenta[] = [];
    suyas.forEach((f, i) => {
      if (f.saldo === null) return;
      if (f.saldo < 0) negativo += f.saldo;
      else if (f.saldo > 0) conPlata.push({ id: f.id, nombre: f.nombre, lugar: f.sinSede ? null : f.sede, etapa, monto: f.saldo, color: token(tonos[i % tonos.length]!) });
    });
    positivas.push(...conPlata.sort((a, b) => b.monto - a.monto));
  }
  const total = positivas.reduce((a, c) => a + c.monto, 0);
  const enteros = porcentajesEnteros(positivas.map((c) => c.monto));
  let acumulado = 0;
  const porciones = positivas.map((c, i) => {
    const desde = acumulado;
    acumulado += (c.monto / total) * 360;
    return { ...c, pctEntero: enteros[i]!, desde, hasta: i === positivas.length - 1 ? 360 : acumulado };
  });
  return { porciones, negativo: r2(negativo) };
}

/**
 * El trazo de una porción, de `desde` a `hasta` grados (0 = arriba, en el sentido del reloj) sobre un radio `r` con centro en `c`. Deja un hueco
 * entre porciones —nunca más de dos quintos de la porción: una rebanada fina no puede desaparecer ni voltearse— para que se vea dónde acaba cada una.
 */
export function trazoDeArco(desde: number, hasta: number, r: number, c = 100, hueco = 2.4): string {
  // Una sola porción es el círculo entero: un arco no puede acabar donde empieza, así que va en dos medias vueltas y sin hueco.
  if (hasta - desde >= 359.99) return `M${c} ${r2(c - r)}A${r} ${r} 0 1 1 ${c} ${r2(c + r)}A${r} ${r} 0 1 1 ${c} ${r2(c - r)}`;
  const h = Math.min(hueco, (hasta - desde) * 0.4) / 2;
  const a0 = desde + h;
  const a1 = hasta - h;
  const punto = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${r2(c + r * Math.sin(rad))} ${r2(c - r * Math.cos(rad))}`;
  };
  return `M${punto(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${punto(a1)}`;
}
