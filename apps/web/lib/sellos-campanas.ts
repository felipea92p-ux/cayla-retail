// Insignias y campañas: dos modos sobre la misma tabla `etiquetas` (ADR-0473, Felipe 2026-10-22; se llamaron «Sellos» hasta el
// 2026-10-23, ADR-0481, y en el código siguen llamándose `sellos`: la clave no se renombra).
//
// PROMETE: qué filas ve cada pantalla (una campaña es la que tiene estilo `campana`; todo lo demás es una insignia), cómo
//   se nombra cada una en pantalla (con su género: «la insignia», «la campaña») y en qué tramo cae una campaña por su fecha. Las pilas de
//   Catálogo ▸ Insignias (la billetera de pases, 2026-10-22) salen de aquí: `lib/sellos-pases.ts`.
// ASUME: que `estilo` ya llegó pasado por `estiloConocido` (lib/etiqueta-grupos.ts): un valor raro es una insignia, nunca se pierde.
// Lógica pura, sin red: se importa desde el servidor y desde el cliente, y se prueba con `sellos-campanas.test.ts`.

import { vigenciaDe } from "./etiqueta-vigencia";
import type { EstiloEtiqueta } from "./etiqueta-grupos";

export type ModoEtiquetas = "sellos" | "campanas";

/** ¿Esta fila es de esta pantalla? Una campaña es SOLO la de estilo `campana`; una insignia, todo lo demás. */
export function esDelModo(estilo: EstiloEtiqueta, modo: ModoEtiquetas): boolean {
  return modo === "campanas" ? estilo === "campana" : estilo !== "campana";
}

/** Cómo se dice cada cosa en cada pantalla. «uno» es el sustantivo; «o» la terminación de su género (desactivado/desactivada). */
export const TEXTOS_MODO: Record<
  ModoEtiquetas,
  { uno: string; varios: string; la: string; o: string; nuevo: string; ejemplo: string; filtrar: string; agregarDetalle: string }
> = {
  sellos: {
    uno: "insignia",
    varios: "insignias",
    la: "la",
    o: "a",
    nuevo: "Nueva insignia",
    ejemplo: "Ej. Edición limitada, Básico", // sugerir-fijo: una insignia nueva no depende de nada elegido antes en la hoja
    filtrar: "Filtrar insignias",
    agregarDetalle: "Queda disponible de inmediato para cualquier prenda.",
  },
  campanas: {
    uno: "campaña",
    varios: "campañas",
    la: "la",
    o: "a",
    nuevo: "Nueva campaña",
    ejemplo: "Ej. Día del Padre, Cierre de verano", // sugerir-fijo: una campaña nueva no depende de nada elegido antes en la hoja
    filtrar: "Filtrar campañas",
    agregarDetalle: "Las fechas son opcionales. Después le pones sus ofertas, sus prendas y dónde rige con «Configurar».",
  },
};

export type TramoCampana = "ahora" | "proximas" | "sin_fechas" | "pasaron";

/** El tramo de una campaña según sus fechas y el día de hoy en Lima. */
export function tramoDeCampana(desde: string | null, hasta: string | null, hoy: string): TramoCampana {
  if (!desde && !hasta) return "sin_fechas";
  const v = vigenciaDe(desde, hasta, hoy);
  if (!v) return "sin_fechas";
  return v.estado === "vigente" ? "ahora" : v.estado === "proxima" ? "proximas" : "pasaron";
}
