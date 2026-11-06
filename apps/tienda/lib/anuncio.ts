// La franja de anuncios de arriba (`components/Anuncio.tsx`): se ve un mensaje a la vez y la persona pasa de uno a otro con las flechas. Es manual a
// propósito (Felipe 2026-11-05): nada se mueve mientras se lee, y los mismos beneficios se repiten bajo la portada. Las frases las arma `anuncios()`
// (lib/portada.ts); aquí, solo el turno de cada una. Lógica pura, con su prueba al lado.

/** A qué mensaje se llega con una flecha: `paso` es 1 o −1, y al final da la vuelta. */
export function fraseVecina(actual: number, paso: 1 | -1, cantidad: number): number {
  if (cantidad <= 0) return 0;
  return (actual + paso + cantidad) % cantidad;
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
