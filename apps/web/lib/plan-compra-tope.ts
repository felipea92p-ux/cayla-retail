// El plan con tu tope (Plan de campaña ▸ Presupuesto, spike ④ de «la visión», Felipe 2026-10-26). Lógica pura, sin React ni red.
//
// EL PROBLEMA. El plan de siempre decide cada categoría por separado: «cuánto cuesta quedarme corto frente a sobrar». Sumadas, pueden costar más
// de lo que CAYLA puede inmovilizar en mercadería, y entonces la persona recorta a ojo, categoría por categoría, sin saber dónde duele menos.
//
// LA CUENTA. Es el vendedor de diarios con un presupuesto (Hadley y Whitin, 1963): se maximiza lo que se espera ganar con la restricción de que
// lo comprado cueste, al costo, lo que dice el tope. Cada sol inmovilizado pasa a tener un precio λ (el «precio de la plata»), igual para todas
// las categorías, y cada una compra hasta su cuantil
//
//        F = (Cu − λ · costo) ÷ (Cu + Co)         (0 ≤ F ≤ 1)
//
// con Cu y Co los de `cuantilCritico`. λ = 0 es el plan de siempre; λ > 0 aprieta TODAS las categorías a la vez, empezando por donde cada sol rinde
// menos (la categoría con poco margen sobre su costo baja primero); λ < 0 afloja hasta cubrir el escenario bueno. Como la inversión baja cuando λ
// sube, el λ que deja la compra en el tope se busca por bisección (60 vueltas sobre una suma de 20 categorías: instantáneo).
//
// CONTRATO
//   PROMETE: con λ = 0, exactamente el plan de `calcular`; que `precioDeLaPlataPara` devuelva un λ cuyo plan CUESTA lo del tope o menos (si lo
//            hay: con λ ≥ `techoDelPrecio` se compra solo el escenario flojo); que la ganancia esperada salga de la MISMA triangular que la compra.
//   NO HACE: no guarda nada ni compra nada (guardar el λ es de la base); no decide por la persona: propone el plan que cabe y lo compara con el de hoy.
//   «Lo que se espera ganar» NO es la utilidad de la campaña: es lo que suma COMPRAR esto, frente a no comprar nada, sobre lo que ya hay.

import { calcular, cuantilTriangular, precioEnCampana, type Calculo, type FilaPlan, type LineaPlan } from "./plan-compra-reglas";

/** Con λ = −1 toda categoría cubre el escenario bueno (F ≥ 1 ⟺ costo ≥ Co, que se cumple mientras lo que sobra valga algo): no hay más que comprar. */
export const PRECIO_DE_LA_PLATA_MIN = -1;

/** Cuántos cuantiles de la demanda se promedian para la ganancia esperada: 200 dan el orden de magnitud con una triangular y cuestan nada. */
const CUANTILES = 200;

export type DatosDeLinea = Pick<LineaPlan, "flojo" | "normal" | "bueno" | "precio" | "costo" | "recuperoPct" | "descuentoPct">;

/** Una categoría con plan, con lo que cuenta para comprar: lo que hay más lo que viene en camino (`Calculo.stock`). */
export type LineaDeTope = { clave: string; nombre: string; linea: DatosDeLinea; stock: number };

/** Las categorías con plan de la hoja, listas para la cuenta. Las que no tienen plan no compran nada y no entran. */
export function lineasDeTope(filas: readonly FilaPlan[]): LineaDeTope[] {
  return filas.flatMap((f) => (f.linea && f.calculo ? [{ clave: f.c.id, nombre: f.c.nombre, linea: f.linea, stock: f.calculo.stock }] : []));
}

const centavos = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// 1. El plan con un precio de la plata
// ---------------------------------------------------------------------------------------------------------------------

export type FilaDeTope = { clave: string; nombre: string; costo: number; calculo: Calculo };
export type PlanDeTope = { precioDeLaPlata: number; filas: FilaDeTope[]; prendas: number; inversion: number };

/** El plan completo con un λ: lo que compra cada categoría y lo que cuesta. Con λ = 0 es el plan de siempre. */
export function planConPrecioDeLaPlata(lineas: readonly LineaDeTope[], precioDeLaPlata: number): PlanDeTope {
  const filas = lineas.map((x): FilaDeTope => ({ clave: x.clave, nombre: x.nombre, costo: x.linea.costo, calculo: calcular(x.linea, x.stock, precioDeLaPlata) }));
  return {
    precioDeLaPlata,
    filas,
    prendas: filas.reduce((s, f) => s + f.calculo.comprar, 0),
    inversion: centavos(filas.reduce((s, f) => s + f.calculo.inversion, 0)),
  };
}

/** Lo que cuesta el plan con un λ, sin armar las filas (la bisección lo llama decenas de veces). */
function inversionCon(lineas: readonly LineaDeTope[], precioDeLaPlata: number): number {
  return centavos(lineas.reduce((s, x) => s + calcular(x.linea, x.stock, precioDeLaPlata).inversion, 0));
}

/**
 * El λ desde el que ninguna categoría compra más que el escenario flojo (F = 0 para todas): Cu ÷ costo de la que más margen deja, y un pelo más.
 * Es el techo de la búsqueda: un plan más apretado que ese no existe.
 */
export function techoDelPrecio(lineas: readonly LineaDeTope[]): number {
  const topes = lineas.flatMap((x) => {
    const { precio, costo, descuentoPct } = x.linea;
    return costo > 0 ? [Math.max(precioEnCampana(precio, descuentoPct ?? 0) - costo, 0) / costo] : [];
  });
  return topes.length === 0 ? 0 : Math.max(0, ...topes) + 0.001;
}

export type AjusteAlTope = {
  /** El λ que deja el plan en el tope o por debajo. Con `cabe: false`, el más apretado que hay (solo el flojo). */
  precioDeLaPlata: number;
  /** El plan con ese λ cuesta lo del tope o menos. false = ni comprando solo el flojo de cada categoría cabe. */
  cabe: boolean;
  /** Sobra tope y ya se cubre el escenario bueno en todas las categorías: lo demás sería comprar de más. */
  techo: boolean;
};

/**
 * El λ que deja la compra lo más cerca posible del tope sin pasarse (o sin quedarse corto si el tope sobra, hasta cubrir el bueno). La inversión es no
 * creciente en λ, así que se busca el menor λ cuyo plan cabe: bisección entre «todo cubierto» (λ = −1) y «solo el flojo». Se redondea HACIA ARRIBA a
 * milésimas, que solo puede abaratar el plan: el resultado nunca se pasa del tope por redondear.
 */
export function precioDeLaPlataPara(lineas: readonly LineaDeTope[], tope: number): AjusteAlTope {
  const alto = techoDelPrecio(lineas);
  if (inversionCon(lineas, 0) === tope) return { precioDeLaPlata: 0, cabe: true, techo: false };
  if (inversionCon(lineas, PRECIO_DE_LA_PLATA_MIN) <= tope) return { precioDeLaPlata: PRECIO_DE_LA_PLATA_MIN, cabe: true, techo: true };
  if (inversionCon(lineas, alto) > tope) return { precioDeLaPlata: alto, cabe: false, techo: false };
  let bajo = PRECIO_DE_LA_PLATA_MIN;
  let arriba = alto;
  for (let i = 0; i < 60; i++) {
    const medio = (bajo + arriba) / 2;
    if (inversionCon(lineas, medio) > tope) bajo = medio;
    else arriba = medio;
  }
  return { precioDeLaPlata: Math.ceil(arriba * 1000 - 1e-9) / 1000, cabe: true, techo: false };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Lo que se espera ganar
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lo que se espera sacar de TENER `unidades` prendas, sin descontar lo que costaron: lo que alcanza a venderse se cobra al precio de la campaña
 * y lo que sobra se recupera sobre el precio de lista (ADR-0499). Promedia la misma triangular de la compra en `CUANTILES` cuantiles.
 */
export function valorDeTener(l: DatosDeLinea, unidades: number): number {
  const enCampana = precioEnCampana(l.precio, l.descuentoPct ?? 0);
  const recupera = (l.precio * l.recuperoPct) / 100;
  let total = 0;
  for (let k = 0; k < CUANTILES; k++) {
    const demanda = cuantilTriangular(l.flojo, l.normal, l.bueno, (k + 0.5) / CUANTILES);
    total += enCampana * Math.min(demanda, unidades) + recupera * Math.max(unidades - demanda, 0);
  }
  return total / CUANTILES;
}

/**
 * Lo que suma comprar `comprar` prendas sobre las `stock` que ya cuentan: el valor de tener todo menos el de tener solo lo que hay, menos lo que
 * cuesta comprarlo. `retorno` es esa ganancia por cada sol que se paga (0,60 = por cada S/ 1 se esperan S/ 0,60 más); null si no se compra nada.
 */
export function retornoDeComprar(l: DatosDeLinea, stock: number, comprar: number): { ganancia: number; retorno: number | null } {
  if (!(comprar > 0) || !(l.costo > 0)) return { ganancia: 0, retorno: null };
  const ganancia = valorDeTener(l, stock + comprar) - valorDeTener(l, stock) - comprar * l.costo;
  return { ganancia, retorno: ganancia / (comprar * l.costo) };
}

export type FilaConGanancia = FilaDeTope & { ganancia: number; retorno: number | null };
export type PlanConGanancia = Omit<PlanDeTope, "filas"> & { filas: FilaConGanancia[]; ganancia: number; /** Lo que se espera ganar por cada sol que se paga; null si no se compra nada. */ porSol: number | null };

/** El plan de un λ con lo que se espera ganar de cada categoría y de todo junto. */
export function planConGanancia(lineas: readonly LineaDeTope[], precioDeLaPlata: number): PlanConGanancia {
  const plan = planConPrecioDeLaPlata(lineas, precioDeLaPlata);
  const filas = plan.filas.map((f, i): FilaConGanancia => ({ ...f, ...retornoDeComprar(lineas[i].linea, lineas[i].stock, f.calculo.comprar) }));
  const ganancia = filas.reduce((s, f) => s + f.ganancia, 0);
  return { ...plan, filas, ganancia, porSol: plan.inversion > 0 ? ganancia / plan.inversion : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Hoy contra con tope
// ---------------------------------------------------------------------------------------------------------------------

export type CambioDeCategoria = { clave: string; nombre: string; hoy: number; conTope: number; dif: number; difInversion: number };

/** Qué cambia categoría por categoría: las que hoy compran algo o las que el tope mueve. Mismo orden que el plan. */
export function compararPlanes(hoy: PlanDeTope, conTope: PlanDeTope): CambioDeCategoria[] {
  return hoy.filas.flatMap((f, i): CambioDeCategoria[] => {
    const g = conTope.filas[i];
    const dif = g.calculo.comprar - f.calculo.comprar;
    if (dif === 0 && f.calculo.comprar === 0) return [];
    return [{ clave: f.clave, nombre: f.nombre, hoy: f.calculo.comprar, conTope: g.calculo.comprar, dif, difInversion: centavos(g.calculo.inversion - f.calculo.inversion) }];
  });
}

/** Cuánto cuesta lo que cambia, en palabras de tienda: lo que se recorta de lo que se gasta y lo que se deja de ganar. null si no hay base para el porcentaje. */
export const porcentajeDe = (parte: number, base: number): number | null => (base > 0 ? Math.round((parte / base) * 100) : null);

// ---------------------------------------------------------------------------------------------------------------------
// 4. El rango del deslizador
// ---------------------------------------------------------------------------------------------------------------------

export type RangoDelTope = { min: number; max: number; paso: number };

/** El paso del deslizador según lo que se mueve: de a S/ 500 en una campaña de decenas de miles, de a menos cuando es chica. */
export function pasoDelTope(max: number): number {
  return max >= 10_000 ? 500 : max >= 2_000 ? 100 : 50;
}

/**
 * De lo más flaco a lo más lleno: el plan que compra solo el flojo cuesta lo mínimo y el que cubre el bueno en todas, lo máximo. Un tope fuera de
 * ese rango no cambia nada, así que el deslizador no lo ofrece; sí incluye el tope guardado (para poder verlo donde está) y se redondea al paso.
 * null si no hay nada que comprar en ningún escenario (no hay plan que ajustar).
 */
export function rangoDelTope(lineas: readonly LineaDeTope[], topeGuardado: number | null): RangoDelTope | null {
  const minimo = inversionCon(lineas, techoDelPrecio(lineas));
  const maximo = inversionCon(lineas, PRECIO_DE_LA_PLATA_MIN);
  if (!(maximo > 0)) return null;
  const paso = pasoDelTope(Math.max(maximo, topeGuardado ?? 0));
  const bajo = Math.min(minimo, topeGuardado ?? minimo);
  const alto = Math.max(maximo, topeGuardado ?? maximo);
  const min = Math.max(0, Math.floor(bajo / paso) * paso);
  const max = Math.max(min + paso, Math.ceil(alto / paso) * paso);
  return { min, max, paso };
}

/** Lleva el tope a una posición válida del deslizador (dentro del rango y en un múltiplo del paso). */
export function topeEnElRango(tope: number, rango: RangoDelTope): number {
  const enPaso = Math.round(tope / rango.paso) * rango.paso;
  return Math.min(Math.max(enPaso, rango.min), rango.max);
}
