// Análisis v4 (ADR-0357, «Actualización 2026-10-16 — Análisis para decidir compras», A6, decisión D5 de Felipe): la TEMPORADA de «Qué pedir».
// Lógica pura (sin base ni React). El servidor lee el historial (`analisis-campanas.ts`) y aquí se calcula y se dice.
//
// EL PROBLEMA. «¿Para cuánto te alcanza?» divide lo que tienes entre el ritmo de estos días: un ritmo plano. Pero diciembre vende más que octubre.
// Con las ventas históricas de Trujillo (2017 a 2025, sin 2020), de aquí al 25-dic se vende por día ~1,3 veces lo de octubre (de 1,1 a 1,7) y ~3
// veces en la última semana. Un tipo que «alcanza» 80 días a un ritmo plano dura unos 61 si se vende 1,3 veces más: la compra de diciembre se
// subestimaba. (R-19 de `docs/datos/15-COMO-OPERA-CAYLA.md` dice diciembre ÷ los 60 días anteriores, 1,59 a 2,30: otro periodo y otra base, no se
// contradicen.)
//
// LA DECISIÓN (D5). UNA línea más por tipo («con temporada: unos 61 días») y NINGUNA cifra base tocada: la fila sigue diciendo lo de siempre. Solo si
// la tienda tiene 3 o más años de historia con ventas; si no (Arequipa tiene 2; Lima, ninguno), «sin historia suficiente» y el ritmo plano. No se usa
// `productos.temporada` (vacío en el 70 % de los productos).
//
// CÓMO SE CALCULA. Para cada uno de los últimos 5 años: los soles por día de lo que va de HOY a la meta (mismo día y mes de ese año) entre los soles
// por día de la ventana del ritmo (los mismos días del año). Misma vara que el Plan de campaña (`plan-compra-historial.ts`): un día sin venta cuenta
// como día, así que el domingo cerrado pesa igual arriba y abajo. La temporada es la MEDIANA de esos años, con su mínimo y su máximo a la vista.
// Un año sin ventas en alguna de las dos ventanas (la pandemia de 2020, una tienda que aún no abría, un hueco de Sinatra) no cuenta. Es soles, no
// unidades: Sinatra no sabe de unidades. Y es de la TIENDA, no del tipo: ni Sinatra ni el ERP de antes separan por tipo.
//
// LO QUE NO HACE. No duplica el efecto de la campaña: la base de cada año son las mismas fechas de la ventana, así que si Aniversario cae todos los
// octubres ya está en los dos lados. Si ese año no hubo campaña, la temporada sale algo más baja de lo real (conservador hacia «no hay temporada»).

import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { mismaFechaEn } from "./plan-compra-historial";
import { plural } from "./analisis-reglas";

/** Años de historia que hacen falta para hablar de temporada (D5). */
export const ANIOS_TEMPORADA_MIN = 3;
/** Cuántos años hacia atrás se miran (las llamadas a la base son una por año). */
export const ANIOS_TEMPORADA_MAX = 5;
/** Qué parte de los días de una ventana tiene que tener venta para que el año valga (el domingo cerrado y un feriado no lo invalidan). */
export const PARTE_CON_VENTA = 0.5;
/** Debajo de esta distancia a 1 la temporada no cambia nada que se lea: la fila no la dice. */
export const FACTOR_QUE_SE_NOTA = 0.05;

export type TramoTemporada = { desde: string; hasta: string };
/** Las dos ventanas de UN año: la del ritmo (los días que terminan «hoy») y la que va de mañana a la meta. */
export type RangoTemporada = { anio: number; base: TramoTemporada; meta: TramoTemporada };

const llevarA = (iso: string, atras: number): string => mismaFechaEn(iso, Number(iso.slice(0, 4)) - atras);

/**
 * Las ventanas de cada uno de los últimos `anios` años, con el mismo día y mes de hoy, de la ventana y de la meta. Las dos son contiguas (la base
 * termina hoy y la meta empieza mañana), así que una sola lectura del historial por año alcanza: de `base.desde` a `meta.hasta`.
 */
export function rangosDeTemporada(hoy: string, ventana: number, hasta: string, anios: number = ANIOS_TEMPORADA_MAX): RangoTemporada[] {
  const desdeBase = sumarDias(hoy, -(Math.max(1, Math.round(ventana)) - 1));
  const rangos: RangoTemporada[] = [];
  for (let k = 1; k <= anios; k++) {
    rangos.push({
      anio: Number(hoy.slice(0, 4)) - k,
      base: { desde: llevarA(desdeBase, k), hasta: llevarA(hoy, k) },
      meta: { desde: llevarA(sumarDias(hoy, 1), k), hasta: llevarA(hasta, k) },
    });
  }
  return rangos;
}

/** El rango que se pide a la base para un año: de la ventana a la meta, de corrido. */
export const lecturaDelAnio = (r: RangoTemporada): TramoTemporada => ({ desde: r.base.desde, hasta: r.meta.hasta });

/** Soles por día de un tramo (un día sin venta cuenta como día); null si menos de la mitad de sus días tuvo venta (no hay con qué medir). */
function solesPorDia(dias: ReadonlyMap<string, number>, t: TramoTemporada): number | null {
  const largo = diasEntreFechas(t.desde, t.hasta) + 1;
  if (!(largo > 0)) return null;
  let soles = 0;
  let conVenta = 0;
  for (let f = t.desde; f <= t.hasta; f = sumarDias(f, 1)) {
    const s = dias.get(f);
    if (s !== undefined && s > 0) {
      soles += s;
      conVenta += 1;
    }
  }
  return conVenta >= largo * PARTE_CON_VENTA ? soles / largo : null;
}

/** La mediana de una lista (con cantidad par, el punto medio de las dos del centro). */
function mediana(xs: readonly number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

/** Lo que se sabe de la temporada de una tienda. `anios` son los años que sirvieron; `hasta` la meta de este año. */
export type TemporadaDatos =
  | { estado: "ok"; factor: number; minimo: number; maximo: number; anios: number }
  | { estado: "poca_historia"; anios: number }
  /** La meta es «plazo + 1 mes» (cada tipo tiene la suya): no hay un día fijo con el que comparar años. */
  | { estado: "sin_horizonte" }
  /** Quien mira no ve el módulo «Plan de campaña», el único que deja leer el historial de ventas. */
  | { estado: "sin_modulo" }
  | { estado: "fallo" };

/**
 * La temporada de la tienda con sus soles por día (`dias`: fecha → soles, todos los años que se leyeron) y las ventanas de cada año. Mediana de
 * los años que sirvieron; con menos de 3, «poca historia». El factor es por día: 1,3 = se vende 1,3 veces lo de estos días.
 */
export function temporadaDe(dias: ReadonlyMap<string, number>, rangos: readonly RangoTemporada[]): TemporadaDatos {
  const factores: number[] = [];
  for (const r of rangos) {
    const base = solesPorDia(dias, r.base);
    const meta = solesPorDia(dias, r.meta);
    if (base !== null && base > 0 && meta !== null) factores.push(meta / base);
  }
  if (factores.length < ANIOS_TEMPORADA_MIN) return { estado: "poca_historia", anios: factores.length };
  return { estado: "ok", factor: mediana(factores), minimo: Math.min(...factores), maximo: Math.max(...factores), anios: factores.length };
}

const unDecimal = (n: number): string => n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Lo que se dice UNA vez sobre la temporada (bajo la lista de tipos): de dónde sale y, si no hay, por qué. null si no hay nada que decir
 * (la meta de plazo, o una lectura que falló: eso ya lo dicen las fallas).
 * `hastaLaMeta`: «hasta el 31 dic.» (de `analisis-horizonte.ts`); `ciudad`: «Arequipa».
 */
export function notaDeTemporada(t: TemporadaDatos, hastaLaMeta: string, ciudad: string): string | null {
  if (t.estado === "ok") {
    const rango = `entre ${unDecimal(t.minimo)} y ${unDecimal(t.maximo)}`;
    return `Temporada: en ${t.anios} años, de aquí ${hastaLaMeta} se vendió por día ${unDecimal(t.factor)} ${t.factor === 1 ? "vez" : "veces"} lo de estos días (${rango}).`;
  }
  if (t.estado === "poca_historia") {
    const tiene = t.anios === 0 ? "sin años con ventas comparables" : `${t.anios} ${plural(t.anios, "año", "años")} con ventas comparables`;
    return `Sin historia suficiente de ${ciudad} para ver la temporada (${tiene}): el ritmo se toma plano.`;
  }
  if (t.estado === "sin_modulo") return "Tu rol no ve el historial de ventas: el ritmo se toma plano, sin temporada.";
  return null;
}
