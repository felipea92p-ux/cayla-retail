// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A5 y A15): el ritmo con la base que lo sostiene. Lógica pura
// (sin base ni React) y sin depender de las demás reglas de Análisis: las usan `analisis-reglas.ts` (el desempate de lo que se acaba),
// `analisis-acaba.ts` (las palabras de la fila) y la ficha.
//
// EL PROBLEMA. «Te quedan 14 días» sale de dividir lo que hay entre lo vendido por día en la ventana de la prenda. Con 2 ventas en 7 días eso es
// un número que parece sólido y no lo es: hoy 17 de 40 modelos que se acaban en Trujillo (y 10 de 14 agotados) descansan en UNA sola unidad
// vendida, y 22 de 40 en una o dos. Quien compra decide por el peor caso, y la pantalla no le decía ni cuántas ventas sostienen el número ni
// cuánto se puede equivocar.
//
// LA DECISIÓN. No se corrige el ritmo (el backtest del 16-oct muestra que la pantalla sobrestima, no subestima, a los modelos elegidos por sus
// ventas recientes: no hay un factor que aplicar). Se muestra la base («Vendió 2 en 7 días») y el rango en el que cabe el ritmo de verdad:
// un intervalo exacto de Poisson al 80 % (10 % de azar por cada lado), calculado sobre las ventas observadas y la ventana de ritmo
// (`ventanaDeRitmo`). Poisson porque una venta es un conteo de sucesos sueltos en una ventana de tiempo; exacto porque con 1 o 2 ventas la
// aproximación normal da números sin sentido (límites negativos). Ni «Poisson» ni «80 %» van a la vista (ley 4 de /formidable): quien compra
// lee «puede acabarse en 5 días» y, de detalle, «entre 5 y 53».
//
// UN PISO, NO UN PROMEDIO. El ritmo de un modelo que estuvo agotado parte de la ventana es un PISO: `ventanaDeRitmo` divide entre los días desde
// que se colgó, no entre los días con stock (Producción sí usa los días con stock). Un modelo agotado 10 de sus últimos 14 días vende más rápido
// de lo que dice la pantalla, y sus días «que quedan» salen más largos de lo real. El intervalo mide el azar de pocas ventas; NO corrige ese
// sesgo.
//
// A15 (cuánto cuesta esperar) vive aquí también porque comparte la ventana: lo que dejas de ganar por día cuando un modelo está agotado.

import { IGV_TASA } from "./registro-contable";

/** Un lado del intervalo: la probabilidad que se deja fuera por cada punta (80 % de confianza = 10 % por lado). */
const AZAR_POR_LADO = 0.1;

/** Los límites de la media de ventas (λ) de una ventana, para `k` ventas observadas. `bajo` es 0 si `k` es 0. */
type LimitesPoisson = { bajo: number; alto: number };

// ln(n!) hasta donde se haya pedido: se arma una vez y se reusa. En log, porque con λ de cientos `e^-λ` solo se desborda hacia cero.
const LN_FACTORIAL: number[] = [0];
function lnFactorial(n: number): number {
  while (LN_FACTORIAL.length <= n) LN_FACTORIAL.push(LN_FACTORIAL[LN_FACTORIAL.length - 1]! + Math.log(LN_FACTORIAL.length));
  return LN_FACTORIAL[n]!;
}

/** P(X ≤ k) para X ~ Poisson(λ), sumando cada término en log. */
function acumuladaPoisson(k: number, lambda: number): number {
  if (!(lambda > 0)) return 1;
  const ln = Math.log(lambda);
  let suma = 0;
  for (let i = 0; i <= k; i++) suma += Math.exp(-lambda + i * ln - lnFactorial(i));
  return Math.min(1, suma);
}

/** La raíz de `f(x) = objetivo` en [0, techo] para una `f` que baja al subir `x` (bisección: 100 vueltas sobran para la precisión de un double). */
function raizDecreciente(f: (x: number) => number, objetivo: number, techo: number): number {
  let lo = 0;
  let hi = techo;
  for (let i = 0; i < 100; i++) {
    const medio = (lo + hi) / 2;
    if (f(medio) > objetivo) lo = medio;
    else hi = medio;
  }
  return (lo + hi) / 2;
}

const MEMORIA = new Map<number, LimitesPoisson>();

/**
 * Los límites exactos (Clopper-Pearson) de la media de una Poisson con `k` ventas observadas, al 80 %:
 *   · bajo: la λ más chica que todavía deja ver `k` o más ventas con 10 % de probabilidad, P(X ≥ k | λ) = 0,1;
 *   · alto: la λ más grande que todavía deja ver `k` o menos con 10 %, P(X ≤ k | λ) = 0,1.
 * Sale de los cuantiles de la χ² (`χ²(0,1; 2k) / 2` y `χ²(0,9; 2k+2) / 2`), resueltos por bisección sobre la Poisson para no depender de
 * ninguna librería. Ejemplos: k = 1 → 0,105 a 3,890; k = 2 → 0,532 a 5,322. Depende solo de `k`: se guarda.
 */
function limitesPoisson(k: number): LimitesPoisson {
  const guardado = MEMORIA.get(k);
  if (guardado) return guardado;
  const alto = raizDecreciente((lambda) => acumuladaPoisson(k, lambda), AZAR_POR_LADO, k + 5 * Math.sqrt(k + 1) + 15);
  const bajo = k === 0 ? 0 : raizDecreciente((lambda) => acumuladaPoisson(k - 1, lambda), 1 - AZAR_POR_LADO, k);
  const limites = { bajo, alto };
  MEMORIA.set(k, limites);
  return limites;
}

/** Los días que le quedan a una prenda, en el peor y en el mejor caso. */
export type RangoDeDias = {
  /** El peor caso, tal cual sale (con decimales): sirve para las pruebas y para ordenar. */
  desdeExacto: number;
  /** El mejor caso, tal cual sale. */
  hastaExacto: number;
  /** El peor caso como se dice en tienda: días enteros, nunca menos de 1 (igual que `diasQueQuedan`). */
  desde: number;
  /** El mejor caso como se dice en tienda. */
  hasta: number;
};

/**
 * El rango de días que le quedan a lo que hay, con las ventas observadas en la ventana de ritmo: `enStock × ventana / λ`, con λ entre el
 * límite bajo y el alto de las `ventas` (`limitesPoisson`). Ejemplos: 2 ventas en 7 días con 4 en stock → 5,3 a 52,7 días; 1 venta en 9 días
 * con 1 en stock → 2,3 a 85,4. null si no hay base para decirlo: sin ventas no hay ritmo, y con nada en stock ya no hay días que contar (la
 * prenda ya se agotó).
 */
export function rangoDeDias(entrada: { ventas: number; ventana: number; enStock: number }): RangoDeDias | null {
  const { ventas, ventana, enStock } = entrada;
  if (!(ventas > 0) || !(ventana > 0) || !(enStock > 0)) return null;
  const { bajo, alto } = limitesPoisson(Math.round(ventas));
  const dias = enStock * ventana;
  const desdeExacto = dias / alto;
  const hastaExacto = dias / bajo;
  return { desdeExacto, hastaExacto, desde: Math.max(1, Math.round(desdeExacto)), hasta: Math.max(1, Math.round(hastaExacto)) };
}

/** Una sola venta: el ritmo no se puede leer (D6 de Felipe, 2026-10-16: sigue en «Comprar», pero se dice y no grita en rojo). */
export const unaSolaVenta = (vendidas30: number): boolean => vendidas30 === 1;

/**
 * Lo que queda de cada prenda vendida, sin el IGV: `precio / (1 + IGV) − costo`. El precio de venta de CAYLA lo trae incluido y el costo de
 * compra no (la misma cuenta que «Lo que más rinde», `analisis-rinde.ts`), así que restar el costo del precio entero inflaba la ganancia en el
 * 15 % del precio. null si falta uno de los dos o si no deja nada (sin ganancia no hay nada que se esté dejando de ganar).
 */
function gananciaPorPrenda(precio: number | null, costo: number | null): number | null {
  if (precio === null || costo === null) return null;
  const ganancia = precio / (1 + IGV_TASA) - costo;
  return Number.isFinite(ganancia) && ganancia > 0 ? ganancia : null;
}

/**
 * Lo que se gana por día con lo que se vende de un modelo: `vendidas30 / ventana × (precio sin IGV − costo)`. null si falta el precio o el
 * costo (sin costo no se inventa la cifra) o si cada una deja cero o pérdida. Es el margen del modelo promedio de sus tallas y colores
 * (`analisis-modelo.ts`): una cifra de «más o menos», no de contabilidad. Es la que SE MUESTRA («Dejas de ganar ~S/ 4 por día»).
 */
export function margenPorDia(p: { vendidas30: number; precio: number | null; costo: number | null }, ventana: number): number | null {
  if (!(p.vendidas30 > 0) || !(ventana > 0)) return null;
  const porPrenda = gananciaPorPrenda(p.precio, p.costo);
  return porPrenda === null ? null : (p.vendidas30 / ventana) * porPrenda;
}

/**
 * La misma cuenta con el ritmo en su cota BAJA (el mismo intervalo de `rangoDeDias`), para ORDENAR. Con una sola venta el ritmo puntual es el
 * menos fiable y, sin esto, una prenda de una venta de S/ 150 de ganancia (5 por día) pasaba delante de otra de cuatro ventas de S/ 30 (4 por
 * día): rankear por la cifra más alta con poca muestra premia al azar. La cota baja crece con las ventas, así que a igual cifra gana la que
 * tiene más base. No se muestra: lo que se lee en pantalla es `margenPorDia`.
 */
export function margenPrudentePorDia(p: { vendidas30: number; precio: number | null; costo: number | null }, ventana: number): number | null {
  if (!(p.vendidas30 > 0) || !(ventana > 0)) return null;
  const porPrenda = gananciaPorPrenda(p.precio, p.costo);
  return porPrenda === null ? null : (limitesPoisson(Math.round(p.vendidas30)).bajo / ventana) * porPrenda;
}

/**
 * Cuánto se muestra de lo que se deja de ganar por día: soles enteros desde 1; por debajo, a los diez céntimos; y nada si no llega a diez
 * céntimos (una cifra que no mueve una compra no se pinta). null si no hay cifra.
 */
export function montoPorDia(margen: number | null): number | null {
  if (margen === null || !(margen > 0)) return null;
  const mostrado = margen >= 1 ? Math.round(margen) : Math.round(margen * 10) / 10;
  return mostrado >= 0.1 ? mostrado : null;
}

/**
 * Orden por lo que se deja de ganar: primero el que más (`Array.sort`). Quien no tiene la cifra (sin costo) va después de quien sí la tiene,
 * y entre dos sin ella no decide nada. Es solo un DESEMPATE: nunca mueve a una prenda de su lugar por días.
 */
export function compararMargen(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
