// El consejo de las ventas en «Nueva orden», en una línea (hallazgo H5 del /formidable de Producción, Felipe 2026-10-16; palabras de «Producción más clara», 2026-11-26). Puro: sin React ni Supabase.
//
// Antes el consejo ocupaba ~290 px ANTES de «Fases» y «Tela», incluso vacío («Nada que fabricar»), y la colaboradora no entendía «curva sugerida», «motor de demanda» ni «cubrir».
// Ahora es UNA línea que se entiende sola («Las ventas piden unas 24 prendas» con «Usar lo sugerido», o «Las ventas no piden nada ahora») y lo difícil vive bajo «¿Por qué?» (ley 6 de
// Formidable). Ya no dice «la red»: quien entra por primera vez no sabe que así se llama al conjunto de las tiendas. Y lo que hay de cada talla y color ya no va en una frase con puntos
// («Red 4 · Taller 2 · en camino 3»): cada dato es un par con su nombre completo.
// La cuenta NO cambia: la sugerencia sigue saliendo de `sugerirCurva` (`produccion-decision-reglas.ts`); acá solo se arman las frases que la cuentan.

import type { DemandaVariante, Sugerencia } from "./produccion-decision-reglas";

export type FraseDelConsejo = {
  texto: string;
  /** Hay algo que fabricar: solo entonces la línea ofrece «Usar lo sugerido». */
  sugiere: boolean;
};

/** La frase de la línea: cuántas prendas piden las ventas, o que no piden nada ahora. Un total roto (negativo o NaN) cuenta como «nada». */
export function fraseDelConsejo(total: number): FraseDelConsejo {
  if (!Number.isFinite(total) || total <= 0) return { texto: "Las ventas no piden nada ahora", sugiere: false };
  return { texto: total === 1 ? "Las ventas piden 1 prenda" : `Las ventas piden unas ${total} prendas`, sugiere: true };
}

/**
 * Lo primero que dice «¿Por qué?»: de dónde sale la cifra, o por qué no hay ninguna. Sin ventas medidas de ninguna talla y color NO se dice «ya alcanza» (sería mentira: no se sabe);
 * si al menos una se vende y ya tiene para los días elegidos, sí.
 */
export function explicacionDelConsejo(a: { total: number; sugerencias: readonly Pick<Sugerencia, "diasConLoQueHay">[]; diasObjetivo: number }): string {
  if (a.sugerencias.length === 0) return "Todavía no hay datos de venta de este modelo.";
  if (a.total > 0) return "Sale de lo que venden las tiendas y de lo que ya hay en el Taller, viene en camino o se está fabricando.";
  const conRitmo = a.sugerencias.some((s) => s.diasConLoQueHay !== null);
  if (!conRitmo) return "Todavía no hay ventas suficientes de este modelo para decir cuánto hacer.";
  return `Lo que se vende ya alcanza para ${a.diasObjetivo} días con lo que hay y viene: no hace falta fabricar.`;
}

/** Un dato de una talla y color, con su nombre completo. */
type ParDeLaVariante = { clave: "tiendas" | "taller" | "camino" | "fabricando"; rotulo: string; valor: number };

/**
 * Lo que ya hay de una talla y color, dato por dato: en tiendas y en el Taller siempre (un cero también dice algo); en camino y fabricándose solo si hay.
 * Antes era una frase («Red 4 · Taller 2 · en camino 3 · fabricando 5»).
 */
export function paresDeLaVariante(d: Pick<DemandaVariante, "stockRed" | "stockTaller" | "enCamino">, fabricando: number): ParDeLaVariante[] {
  const pares: ParDeLaVariante[] = [
    { clave: "tiendas", rotulo: "En tiendas", valor: d.stockRed },
    { clave: "taller", rotulo: "En el Taller", valor: d.stockTaller },
  ];
  if (d.enCamino > 0) pares.push({ clave: "camino", rotulo: "En camino", valor: d.enCamino });
  if (fabricando > 0) pares.push({ clave: "fabricando", rotulo: "Fabricándose", valor: fabricando });
  return pares;
}
