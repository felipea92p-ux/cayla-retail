// Qué dibujo le toca a un tejido según su nombre — mismo criterio que
// `patron-visual.ts`: el vocabulario es cerrado pero un Líder lo amplía, y no
// existe una columna de "muestra". El nombre es lo único estable, así que se
// traduce a una de las texturas que sabemos dibujar. "Algodón orgánico" cae en
// la textura de Algodón, "Full Lycra" en la de Licra, "Interlock" en la de
// Jersey (las notas del seed 20260918140000 dicen que esos nombres de Gamarra
// ya están cubiertos por estas 17 filas).
//
// A diferencia de una etiqueta (un concepto), un tejido es una tela física: un
// nombre que no reconocemos devuelve `null` y la pantalla dice "Sin muestra"
// en vez de dibujar una textura equivocada.

import { normalizarNombre } from "./patron-visual";

export type FamiliaTejido =
  | "algodon"
  | "pima"
  | "alpaca"
  | "denim"
  | "drill"
  | "gabardina"
  | "jersey"
  | "licra"
  | "lino"
  | "pana"
  | "pique"
  | "polar"
  | "poliester"
  | "popelina"
  | "rib"
  | "seda"
  | "viscosa";

// El orden importa cuando dos reglas pueden coincidir: "pima" antes que
// "algodon" (Algodón pima es su propia fibra) y "rib" antes que "licra" (el
// seed menciona la variante "Rib licrado": sigue siendo un canalé).
const REGLAS: ReadonlyArray<readonly [FamiliaTejido, RegExp]> = [
  ["pima", /\bpima\b/],
  ["rib", /\b(rib|canale|acanalado)\b/],
  ["licra", /\b(licra|lycra|elastano|spandex)\b/],
  ["alpaca", /\b(alpaca|cachemira|cashmere|lana)\b/],
  ["denim", /\b(denim|jean|jeans|mezclilla)\b/],
  ["drill", /\b(drill|dril)\b/],
  ["gabardina", /\bgabardina\b/],
  ["jersey", /\b(jersey|interlock)\b/],
  ["lino", /\b(lino|linen)\b/],
  ["pana", /\b(pana|corduroy)\b/],
  ["pique", /\bpique\b/],
  ["polar", /\b(polar|fleece)\b/],
  ["poliester", /\b(poliester|polyester)\b/],
  ["popelina", /\b(popelina|poplin)\b/],
  ["seda", /\b(seda|satin|raso)\b/],
  ["viscosa", /\b(viscosa|rayon)\b/],
  ["algodon", /\b(algodon|cotton)\b/],
];

export function familiaDeTejido(nombre: string): FamiliaTejido | null {
  const limpio = normalizarNombre(nombre);
  for (const [familia, regla] of REGLAS) {
    if (regla.test(limpio)) return familia;
  }
  return null;
}
