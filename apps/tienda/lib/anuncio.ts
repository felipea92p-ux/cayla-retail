// La franja de anuncios de arriba (`components/Anuncio.tsx`): se ve un mensaje a la vez y pasan solos (Felipe 2026-11-06: quieta y con flechas no se
// notaba, y nadie iba a tocarlas). Las frases las arma `anuncios()` (lib/portada.ts); aquí, solo el turno de cada una. Lógica pura, con su prueba al lado.

/** Cuánto se queda cada mensaje a la vista: lo justo para leer una frase corta sin apurarse. */
export const MILISEGUNDOS_POR_FRASE = 4500;

/** Qué mensaje sigue: al final da la vuelta. */
export function fraseSiguiente(actual: number, cantidad: number): number {
  if (cantidad <= 0) return 0;
  return (actual + 1) % cantidad;
}

/**
 * En qué está cada mensaje: el que se ve sin animación (`fija`), el que entra, el que sale o ninguno (`null`: escondido, pero ocupando su lugar, para
 * que la franja tome el alto del más largo y no salte al cambiar). `previa` es de dónde se viene; sin ella, nada se anima.
 */
export type EstadoFrase = "fija" | "entra" | "sale" | null;

export function estadoDeFrase(i: number, actual: number, previa: number | null): EstadoFrase {
  if (i === actual) return previa === null ? "fija" : "entra";
  return i === previa ? "sale" : null;
}
