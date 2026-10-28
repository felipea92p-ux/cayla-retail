// El consejo de la red en «Nueva orden», plegado a una línea (hallazgo H5 del /formidable de Producción, Felipe 2026-10-16). Puro: sin React ni Supabase.
//
// Antes el consejo ocupaba ~290 px ANTES de «Fases» y «Tela», incluso vacío («Nada que fabricar»), y la colaboradora no entendía «curva sugerida», «motor de demanda» ni «cubrir».
// Ahora es UNA línea («La red sugiere 40 prendas · Usarla · ¿Por qué?» o «La red no sugiere nada ahora · ¿Por qué?») y lo difícil vive bajo ese «¿Por qué?» (ley 6 de Formidable).
// La cuenta NO cambia: la sugerencia sigue saliendo de `sugerirCurva` (`produccion-decision-reglas.ts`); acá solo se arman las frases que la cuentan.

import type { Sugerencia } from "./produccion-decision-reglas";

export type FraseDelConsejo = {
  texto: string;
  /** Hay algo que fabricar: solo entonces la línea ofrece «Usarla». */
  sugiere: boolean;
};

/** La frase de la línea: cuántas prendas sugiere la red, o que no sugiere nada ahora. Un total roto (negativo o NaN) cuenta como «nada». */
export function fraseDelConsejo(total: number): FraseDelConsejo {
  if (!Number.isFinite(total) || total <= 0) return { texto: "La red no sugiere nada ahora", sugiere: false };
  return { texto: `La red sugiere ${total} ${total === 1 ? "prenda" : "prendas"}`, sugiere: true };
}

/**
 * Lo primero que dice «¿Por qué?»: de dónde sale la cifra, o por qué no hay ninguna. Sin ventas medidas de ninguna talla y color NO se dice «ya alcanza» (sería mentira: no se sabe);
 * si al menos una se vende y ya tiene para los días elegidos, sí.
 */
export function explicacionDelConsejo(a: { total: number; sugerencias: readonly Pick<Sugerencia, "diasConLoQueHay">[]; diasObjetivo: number }): string {
  if (a.sugerencias.length === 0) return "La red todavía no tiene datos de venta de este modelo.";
  if (a.total > 0) return "Sale de lo que venden las tiendas y de lo que ya hay en el Taller, viene en camino o se está fabricando.";
  const conRitmo = a.sugerencias.some((s) => s.diasConLoQueHay !== null);
  if (!conRitmo) return "Todavía no hay ventas suficientes de este modelo para decir cuánto hacer.";
  return `Lo que se vende ya alcanza para ${a.diasObjetivo} días con lo que hay y viene: no hace falta fabricar.`;
}
