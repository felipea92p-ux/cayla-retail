/**
 * Lectura repetida: «Ya está en la lista · ¿Sumar otra?» (ADR-0562, Felipe 2026-10-28; maqueta
 * `docs/maquetas/escaneo-repetido-2026-10/`, dirección A).
 *
 * El problema, en palabras de la tienda: la colaboradora deja la etiqueta frente al lector (la pistola o la cámara) más de la
 * cuenta, el lector la vuelve a leer y la prenda se suma dos veces sin que nadie lo note. Hasta hoy toda lectura sumaba 1.
 *
 * La regla, igual para todo escáner que suma de a uno (Bajar al piso, Cuadrar el piso):
 *  · la PRIMERA lectura de una prenda se registra como siempre;
 *  · la misma prenda otra vez NO suma sola: se pregunta, con lo que lleva de esa prenda (1 → 2);
 *  · mientras se pregunta, la misma etiqueta se ignora (solo se cuenta: es lo que antes duplicaba);
 *  · otra prenda mientras se pregunta es un «No» a la anterior, y esa otra se lee como siempre;
 *  · «Cambiar cantidad» declara una PILA: esa prenda deja de preguntar hasta que se pida otra vez.
 * Se responde tocando, nunca con Enter (la pistola remata cada código con Enter: diría «Sí» sola). Eso lo cuida la pieza
 * (`components/ui/AvisoRepetida.tsx`), no esta función. Sin red y sin React, para probarla.
 */

/** La pregunta abierta: de qué prenda y cuántas lecturas de su misma etiqueta se ignoraron mientras tanto. */
export type PreguntaRepetida = { varianteId: string; ignoradas: number };

export type EstadoRepetida = {
  pregunta: PreguntaRepetida | null;
  /** Las prendas declaradas con «Cambiar cantidad»: no preguntan. */
  pilas: readonly string[];
};

export const ESTADO_REPETIDA_VACIO: EstadoRepetida = { pregunta: null, pilas: [] };

export type DecisionRepetida =
  /** Se lee como siempre. `cierraPregunta`: había otra prenda preguntando y esta lectura le dice «No». */
  | { tipo: "sigue"; cierraPregunta: boolean }
  /** No se suma: se abre la pregunta (y se cierra la de otra prenda, si había). */
  | { tipo: "pregunta"; cierraPregunta: boolean; pregunta: PreguntaRepetida }
  /** La misma etiqueta mientras se pregunta por ella: no suma, solo se cuenta. */
  | { tipo: "ignora"; pregunta: PreguntaRepetida };

/**
 * Qué hacer con una lectura de una prenda reconocida.
 * @param yaEnLista cuántas lleva de esa prenda ANTES de esta lectura (0 si no está, o si está «por escanear»).
 * @param sumaria si el escáner, por su cuenta, la sumaría (no lo hace con el tope del almacén, una prenda archivada…). Lo que
 *   no suma se lee como siempre: su propio aviso dice por qué.
 */
export function decidirLectura(varianteId: string, yaEnLista: number, sumaria: boolean, estado: EstadoRepetida): DecisionRepetida {
  const { pregunta, pilas } = estado;
  if (pregunta && pregunta.varianteId === varianteId) return { tipo: "ignora", pregunta: { ...pregunta, ignoradas: pregunta.ignoradas + 1 } };
  const cierraPregunta = pregunta !== null;
  if (!sumaria || yaEnLista <= 0 || pilas.includes(varianteId)) return { tipo: "sigue", cierraPregunta };
  return { tipo: "pregunta", cierraPregunta, pregunta: { varianteId, ignoradas: 0 } };
}

/** «Cambiar cantidad»: esa prenda deja de preguntar. */
export function declararPila(pilas: readonly string[], varianteId: string): string[] {
  return pilas.includes(varianteId) ? [...pilas] : [...pilas, varianteId];
}

/** «Preguntar de nuevo», o la prenda salió de la lista: vuelve a preguntar. */
export function soltarPila(pilas: readonly string[], varianteId: string): string[] {
  return pilas.filter((id) => id !== varianteId);
}

/**
 * Los números que admite «Cantidad total»: desde una más de las que lleva hasta el tope (lo libre en el almacén,
 * o sin tope). `null` si no cabe ni una más: entonces «Cambiar cantidad» no se ofrece.
 */
export function rangoDeVarias(yaEnLista: number, tope: number | null): { min: number; max: number } | null {
  const min = Math.max(1, yaEnLista + 1);
  const max = tope ?? 99999;
  return max >= min ? { min, max } : null;
}

/** El número escrito o tocado en «Cantidad total», dentro del rango; lo que no es un número queda en el mínimo. */
export function acotarVarias(n: number, rango: { min: number; max: number }): number {
  if (!Number.isFinite(n)) return rango.min;
  return Math.min(rango.max, Math.max(rango.min, Math.floor(n)));
}
