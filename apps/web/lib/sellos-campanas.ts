// Sellos y campañas: dos pantallas sobre la misma tabla `etiquetas` (ADR-0473, Felipe 2026-10-22).
//
// PROMETE: qué filas ve cada pantalla (una campaña es la que tiene estilo `campana`; todo lo demás es un sello), cómo se
//   nombra cada una en pantalla (con su género: «el sello», «la campaña») y en qué tramos se ordenan las campañas por su fecha.
// ASUME: que `estilo` ya llegó pasado por `estiloConocido` (lib/etiqueta-grupos.ts): un valor raro es un sello, nunca se pierde.
// Lógica pura, sin red: se importa desde el servidor y desde el cliente, y se prueba con `sellos-campanas.test.ts`.

import { ordenarPorTemporada, vigenciaDe } from "./etiqueta-vigencia";
import type { EstiloEtiqueta } from "./etiqueta-grupos";

export type ModoEtiquetas = "sellos" | "campanas";

/** ¿Esta fila es de esta pantalla? Una campaña es SOLO la de estilo `campana`; un sello, todo lo demás. */
export function esDelModo(estilo: EstiloEtiqueta, modo: ModoEtiquetas): boolean {
  return modo === "campanas" ? estilo === "campana" : estilo !== "campana";
}

/** El estilo con que nace una fila creada desde cada pantalla. */
export const ESTILO_AL_CREAR: Record<ModoEtiquetas, EstiloEtiqueta> = { sellos: "neutral", campanas: "campana" };

/** Cómo se dice cada cosa en cada pantalla. «uno» es el sustantivo; «o» la terminación de su género (desactivado/desactivada). */
export const TEXTOS_MODO: Record<
  ModoEtiquetas,
  { uno: string; varios: string; la: string; o: string; nuevo: string; ejemplo: string; filtrar: string; agregarDetalle: string }
> = {
  sellos: {
    uno: "sello",
    varios: "sellos",
    la: "el",
    o: "o",
    nuevo: "Nuevo sello",
    ejemplo: "Ej. Edición limitada, Básico", // sugerir-fijo: un sello nuevo no depende de nada elegido antes en la hoja
    filtrar: "Filtrar sellos",
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
    agregarDetalle: "Después le pones sus fechas, su descuento y dónde rige con «Configurar».",
  },
};

export type TramoCampana = "ahora" | "proximas" | "sin_fechas" | "pasaron";

export const TITULO_TRAMO: Record<TramoCampana, string> = {
  ahora: "Rigen hoy",
  proximas: "Próximas",
  sin_fechas: "Sin fechas",
  pasaron: "Ya pasaron",
};

/** El tramo de una campaña según sus fechas y el día de hoy en Lima. */
export function tramoDeCampana(desde: string | null, hasta: string | null, hoy: string): TramoCampana {
  if (!desde && !hasta) return "sin_fechas";
  const v = vigenciaDe(desde, hasta, hoy);
  if (!v) return "sin_fechas";
  return v.estado === "vigente" ? "ahora" : v.estado === "proxima" ? "proximas" : "pasaron";
}

type ConFechas = { vigenteDesde: string | null; vigenteHasta: string | null; nombre: string };

/**
 * Las campañas en tramos, en el orden en que se leen: lo que rige hoy, lo que viene, lo que no tiene fechas y lo que ya pasó.
 * Dentro de cada tramo, por fecha (`ordenarPorTemporada`). Un tramo vacío no sale.
 */
export function campanasPorTramo<T extends ConFechas>(lista: readonly T[], hoy: string): { tramo: TramoCampana; campanas: T[] }[] {
  const ORDEN: TramoCampana[] = ["ahora", "proximas", "sin_fechas", "pasaron"];
  return ORDEN.map((tramo) => ({
    tramo,
    campanas: ordenarPorTemporada(
      lista.filter((c) => tramoDeCampana(c.vigenteDesde, c.vigenteHasta, hoy) === tramo),
      hoy,
    ),
  })).filter((t) => t.campanas.length > 0);
}
