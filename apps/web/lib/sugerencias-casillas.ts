import { claveTexto } from "./nombres-parecidos";

// El ejemplo del nombre de una casilla nueva en Configuración ▸ Precios (ADR-0700, regla «Sugerencias coherentes», ADR-0290). Lo único que
// la persona ya «eligió» es la lista que tiene: el ejemplo nunca es una casilla que ya existe (un ejemplo que ya está invita a repetirla y
// salta «Existe también»). Sale de una tabla curada, en el orden del análisis del 2026-11-24 (las de más evidencia primero); si ya están
// todas, un texto que no promete nada.

/** Casillas que se marcan a mano y no repiten las de fábrica. */
const EJEMPLOS = ["Hecha a mano", "Edición corta", "Diseño de artista", "Para una ocasión"] as const;

export const EJEMPLO_NEUTRO = "Lo que la hace distinta";

export function sugerirNombreCasilla(existentes: readonly { nombre: string }[]): { texto: string; neutro: boolean } {
  const tomadas = new Set(existentes.map((e) => claveTexto(e.nombre)));
  const libre = EJEMPLOS.find((e) => !tomadas.has(claveTexto(e)));
  return libre ? { texto: `Ej. ${libre}`, neutro: false } : { texto: `Ej. ${EJEMPLO_NEUTRO}`, neutro: true };
}
