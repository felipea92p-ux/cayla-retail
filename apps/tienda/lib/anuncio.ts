// La franja de anuncios de arriba (`components/Anuncio.tsx`): qué frase se ve en cada vuelta y cuál se está yendo. Las frases las arma
// `anuncios()` (lib/portada.ts); aquí, solo el turno de cada una. Lógica pura, con su prueba al lado.

/** Cada cuánto cambia de frase. */
export const CADA_MS = 4500;

/**
 * En qué está cada frase de la franja en la vuelta `vuelta`: la que se ve al cargar la página (`fija`, sin animación), la que entra, la
 * que sale (la de la vuelta anterior, mientras se apaga) o ninguna (`null`: escondida, pero ocupando su lugar, para que la franja tome
 * el alto de la más larga y no salte al cambiar).
 *
 * `desde` es la vuelta en la que la franja apareció (2026-10-17): al pasar a una página que dibuja su propia franja (la bolsa, «Mi
 * perfil»), sigue en la frase que se estaba viendo, quieta, en vez de volver a la primera; la que entra con animación es recién la
 * siguiente.
 */
export type EstadoFrase = "fija" | "entra" | "sale" | null;

export function estadoDeFrase(i: number, vuelta: number, cantidad: number, desde = 0): EstadoFrase {
  if (cantidad <= 0 || i < 0 || i >= cantidad) return null;
  if (i === vuelta % cantidad) return vuelta <= desde ? "fija" : "entra";
  return vuelta > desde && i === (vuelta - 1) % cantidad ? "sale" : null;
}
