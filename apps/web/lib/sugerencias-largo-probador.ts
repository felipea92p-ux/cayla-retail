// El ejemplo de la caja «Largo» de Vitrina ▸ Probador (ADR-0434, actividad 3; skill `/sugerir`, CLAUDE.md «Sugerencias coherentes»): lo
// que dice la caja vacía tiene que ser verdad para la prenda que se está midiendo.
//
// De dónde sale, en este orden:
//   1. el TÍPICO de su categoría (`vitrina_largos_tipicos`): es el largo que usa el probador si la caja queda vacía, así que el
//      ejemplo dice exactamente lo que va a pasar;
//   2. sin típico, un largo de referencia de su categoría por `categorias.prefijo` (vestidos, faldas, conjuntos y enterizos no tienen
//      típico a propósito: Felipe, 2026-10-16). Es una referencia para escribir, no un valor que se guarde;
//   3. nada: «En cm». Una categoría que un Líder crea sin deploy cae acá, nunca al largo de otra.
//
// Función pura y determinista: mismo contexto, mismo texto.

/** Un largo de referencia (cm) para las categorías sin típico, por `categorias.prefijo`. Felipe los cambia aquí. */
export const REFERENCIA_SIN_TIPICO: Readonly<Record<string, number>> = { VES: 110, FAL: 55, CON: 110, ENT: 140 };

export type OrigenLargo = "tipico" | "referencia" | "neutro";

/** El ejemplo de la caja del largo de una prenda. */
export function sugerirLargo(h: { prefijo: string | null; tipico: number | null }): { texto: string; origen: OrigenLargo } {
  if (h.tipico !== null) return { texto: `${h.tipico} (el típico)`, origen: "tipico" };
  const referencia = h.prefijo ? REFERENCIA_SIN_TIPICO[h.prefijo] : undefined;
  if (referencia !== undefined) return { texto: `Ej. ${referencia}`, origen: "referencia" };
  return { texto: "En cm", origen: "neutro" };
}

/** El ejemplo de la caja del típico de una categoría: su referencia si tiene; si no, ninguno («Sin típico» dice lo que pasa). */
export function sugerirTipico(prefijo: string | null): string {
  const referencia = prefijo ? REFERENCIA_SIN_TIPICO[prefijo] : undefined;
  return referencia !== undefined ? `Ej. ${referencia}` : "Sin típico";
}
