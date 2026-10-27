// Plan de campaña ▸ Presupuesto: lo que la pestaña dice, dicho como lo diría quien compra. Lógica pura, sin React ni red.
//
// La cuenta (cuánto compra cada categoría con un precio de la plata, qué se espera ganar) es de `lib/plan-compra-tope.ts`; aquí solo se arma lo que se
// muestra: las cifras, las barras de «Dónde se va la plata», la tabla de costos y las frases de los supuestos.
//
// CONTRATO
//   PROMETE: nunca un porcentaje sin base (null), nunca una frase de descuento que no sea la de lo que está guardado en el plan, y una etiqueta de
//            «cuánto creerle» por categoría que sale del mismo dato que el aviso de exactitud (`exactitudDeLosDatos`), no de otro.
//   NO HACE: no calcula la compra ni el tope (eso es `plan-compra-tope`) ni decide qué se guarda.

import { exactitudDeLosDatos } from "./plan-compra-periodo";
import type { FilaPlan } from "./plan-compra-reglas";
import type { PropuestaCategoria } from "./plan-compra-propuesta";
import { porcentajeDe, type PlanConGanancia, type PlanDeTope } from "./plan-compra-tope";

const centavos = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** Soles enteros para lo que se lee de un vistazo («S/ 33,482»): una decena de miles no necesita centavos. Nunca «-0». */
export const solesEnterosES = (n: number) => `S/\u00a0${(Math.round(n) || 0).toLocaleString("es-PE")}`;

// ---------------------------------------------------------------------------------------------------------------------
// 1. Las cifras de arriba
// ---------------------------------------------------------------------------------------------------------------------

export type CifrasDelPresupuesto = {
  inversion: number;
  prendas: number;
  /** El tope guardado; null = sin tope. */
  tope: number | null;
  /** Lo que se pasa del tope (positivo) o lo que queda para comprar (negativo); null si no hay tope. */
  pasa: number | null;
  /** De lo que se pasa, el % del tope. null si no se pasa o no hay tope. */
  pasaPct: number | null;
  /** Lo que se espera ganar con la compra, después de lo que sobra. */
  ganancia: number;
  /** Lo que se espera ganar por cada sol que se paga; null si no se compra nada. */
  porSol: number | null;
};

/** Las cuatro cifras del Presupuesto: cuánto cuesta, contra qué tope, qué se espera ganar y cuánto por cada sol. */
export function cifrasDelPresupuesto(plan: Pick<PlanConGanancia, "inversion" | "prendas" | "ganancia" | "porSol">, tope: number | null): CifrasDelPresupuesto {
  const pasa = tope === null ? null : centavos(plan.inversion - tope);
  return {
    inversion: plan.inversion,
    prendas: plan.prendas,
    tope,
    pasa,
    pasaPct: pasa !== null && pasa > 0 && tope !== null ? porcentajeDe(pasa, tope) : null,
    ganancia: plan.ganancia,
    porSol: plan.porSol,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Dónde se va la plata
// ---------------------------------------------------------------------------------------------------------------------

export type TramoDeLaPlata = { clave: string; nombre: string; valor: number };

/** Las categorías que cuestan algo, de la que más a la que menos (a igual costo, por nombre): una por tramo de la barra. */
export function tramosDeLaPlata(plan: Pick<PlanDeTope, "filas">): TramoDeLaPlata[] {
  return plan.filas
    .filter((f) => f.calculo.inversion > 0)
    .map((f) => ({ clave: f.clave, nombre: f.nombre, valor: f.calculo.inversion }))
    .sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, "es"));
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Cuánto cuesta cada categoría
// ---------------------------------------------------------------------------------------------------------------------

/** Cuánto creerle a los números de una categoría, en una etiqueta: el tono es el de `Chip`. */
export type EtiquetaDeDatos = { tono: "ambar" | "pizarra" | "verde" | "neutro"; texto: string; ayuda: string };

/**
 * Cuánto creerle a la propuesta de una categoría. Sale del mismo dato que el aviso «Los datos todavía no son exactos» (`exactitudDeLosDatos`): los días de
 * ventas que lleva el ERP y si la misma campaña del año pasado ya está en él. Una categoría que no vendió nada no tiene de dónde proponer: su plan es
 * lo que se escribió a mano. `propuesta` undefined = la base no manda la propuesta: no se inventa una etiqueta.
 */
export function etiquetaDeLosDatos(propuesta: PropuestaCategoria | null | undefined, dias: number | undefined, conCampanaAnterior: boolean): EtiquetaDeDatos | null {
  if (propuesta === undefined) return null;
  if (propuesta === null) return { tono: "neutro", texto: "Sin ventas", ayuda: "No vendió en los días que lleva el ERP: lo que hay aquí lo escribiste tú." };
  if (dias === undefined) return null;
  const x = exactitudDeLosDatos(dias, conCampanaAnterior);
  if (!x) return { tono: "verde", texto: "Exacto", ayuda: "El ERP ya tiene 90 días de ventas y la misma campaña del año pasado." };
  return x.nivel === 1 ? { tono: "ambar", texto: "Orientativo", ayuda: x.detalle } : { tono: "pizarra", texto: "Aproximado", ayuda: x.detalle };
}

export type FilaDeCosto = {
  clave: string;
  nombre: string;
  comprar: number;
  /** Lo que cuesta cada prenda. */
  costo: number;
  inversion: number;
  /** De lo que cuesta todo el plan, el % de esta categoría; null si el plan no cuesta nada. */
  pctDelTotal: number | null;
  /** Lo que se espera ganar por cada sol que se paga en esta categoría; null si no se compra. */
  retorno: number | null;
  datos: EtiquetaDeDatos | null;
};

/** La tabla «Cuánto cuesta cada categoría»: las que tienen plan, de la que más cuesta a la que menos. `filas` pone la etiqueta de datos de cada una. */
export function filasDeCosto(plan: PlanConGanancia, filas: readonly FilaPlan[]): FilaDeCosto[] {
  const porClave = new Map(filas.map((f) => [f.c.id, f]));
  return plan.filas
    .map((f): FilaDeCosto => {
      const de = porClave.get(f.clave);
      return {
        clave: f.clave,
        nombre: f.nombre,
        comprar: f.calculo.comprar,
        costo: f.costo,
        inversion: f.calculo.inversion,
        pctDelTotal: porcentajeDe(f.calculo.inversion, plan.inversion),
        retorno: f.retorno,
        datos: etiquetaDeLosDatos(de?.propuesta, de?.diasDeVentas, de?.conCampanaAnterior ?? false),
      };
    })
    .sort((a, b) => b.inversion - a.inversion || a.nombre.localeCompare(b.nombre, "es"));
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Los supuestos de toda la campaña
// ---------------------------------------------------------------------------------------------------------------------

/**
 * El descuento que el plan supone, dicho para toda la campaña: «Sin descuento», «−20 %» si todas las categorías suponen lo mismo, o el rango si varía.
 * null si la base todavía no guarda el descuento (no se puede decir) o no hay categorías con plan.
 */
export function fraseDelDescuentoDelPlan(filas: readonly FilaPlan[]): string | null {
  const con = filas.filter((f) => f.linea);
  if (con.length === 0 || con.some((f) => f.conDescuento !== true)) return null;
  const valores = [...new Set(con.map((f) => f.linea!.descuentoPct ?? 0))].sort((a, b) => a - b);
  if (valores.length === 1) return valores[0] === 0 ? "Sin descuento" : `−${pct(valores[0])} %`;
  const max = valores[valores.length - 1];
  const min = valores[0];
  return min === 0 ? `Varía por categoría: de sin descuento a −${pct(max)} %` : `Varía por categoría: de −${pct(min)} % a −${pct(max)} %`;
}

/** «45 % del precio», con su origen si es el de la campaña anterior; null si nadie lo fijó (cada categoría lo escribe). */
export function fraseDelRecuperoDelPlan(r: { pct: number | null; heredado: boolean }): string | null {
  return r.pct === null ? null : `${r.pct} % del precio${r.heredado ? " (el de la campaña anterior)" : ""}`;
}
