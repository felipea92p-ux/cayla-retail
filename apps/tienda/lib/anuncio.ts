// La franja de anuncios de arriba (`components/Anuncio.tsx`): qué frase se ve en cada vuelta y cuál se está yendo. Las frases las arma
// `anuncios()` (lib/portada.ts); aquí, solo el turno de cada una. Lógica pura, con su prueba al lado.

/** Cada cuánto cambia de frase. */
export const CADA_MS = 4500;

/**
 * En qué está cada frase de la franja en la vuelta `vuelta`: la que se ve al cargar la página (`fija`, sin animación), la que entra, la
 * que sale (la de la vuelta anterior, mientras se apaga) o ninguna (`null`: escondida, pero ocupando su lugar, para que la franja tome
 * el alto de la más larga y no salte al cambiar).
 */
export type EstadoFrase = "fija" | "entra" | "sale" | null;

export function estadoDeFrase(i: number, vuelta: number, cantidad: number): EstadoFrase {
  if (cantidad <= 0 || i < 0 || i >= cantidad) return null;
  if (i === vuelta % cantidad) return vuelta === 0 ? "fija" : "entra";
  return vuelta > 0 && i === (vuelta - 1) % cantidad ? "sale" : null;
}
