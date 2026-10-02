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
//
// 2026-10-02: producción ya tenía 34 tejidos y 10 salían «Sin muestra» (Aterciopelada,
// Gasa, Hilo, Macramé, Oxford, Sastre, Seersucker, Suplex, Tela, Tela mojada) porque
// el vocabulario creció con nombres que no estaban en las 17 filas del seed. Se les
// sumó su familia con el dibujo de la tela real más cercana. Lo que sigue siendo
// desconocido (un nombre que un Líder invente mañana) mantiene el «Sin muestra».

import { normalizarNombre } from "./patron-visual";

export type FamiliaTejido =
  | "algodon"
  | "pima"
  | "alpaca"
  | "denim"
  | "drill"
  | "franela"
  | "gabardina"
  | "gasa"
  | "hilo"
  | "jersey"
  | "licra"
  | "lino"
  | "macrame"
  | "mojado"
  | "oxford"
  | "pana"
  | "pique"
  | "polar"
  | "poliester"
  | "popelina"
  | "rib"
  | "sastre"
  | "seda"
  | "seersucker"
  | "suplex"
  | "tela"
  | "terciopelo"
  | "viscosa";

// El orden importa cuando dos reglas pueden coincidir: "pima" antes que
// "algodon" (Algodón pima es su propia fibra) y "rib" antes que "licra" (el
// seed menciona la variante "Rib licrado": sigue siendo un canalé). Las familias
// nuevas van antes que "algodon" para que «Oxford de algodón» o «Hilo de algodón»
// sean lo que dicen ser y no un algodón liso.
//
// «Tela» NO está aquí a propósito: es una palabra que cualquiera escribe en una
// frase («tela gruesa de sarga») y `dibujo-generado.ts` pasa esa frase por esta
// misma función; una regla `\btela\b` le taparía la palabra «sarga». Se reconoce
// solo cuando el nombre ENTERO es «Tela» (`FAMILIA_POR_NOMBRE_EXACTO`).
const REGLAS: ReadonlyArray<readonly [FamiliaTejido, RegExp]> = [
  ["pima", /\bpima\b/],
  ["rib", /\b(rib|canale|acanalado)\b/],
  ["licra", /\b(licra|lycra|elastano|spandex)\b/],
  ["suplex", /\b(suplex|supplex)\b/],
  ["alpaca", /\b(alpaca|cachemira|cashmere|lana)\b/],
  ["denim", /\b(denim|jean|jeans|mezclilla)\b/],
  ["drill", /\b(drill|dril)\b/],
  ["gabardina", /\bgabardina\b/],
  ["jersey", /\b(jersey|interlock)\b/],
  ["lino", /\b(lino|linen)\b/],
  ["pana", /\b(pana|corduroy)\b/],
  ["pique", /\bpique\b/],
  ["polar", /\b(polar|fleece)\b/],
  ["franela", /\b(franela|flannel)\b/],
  ["terciopelo", /\b(terciopelo|aterciopelad[oa]s?|velvet|velour)\b/],
  ["gasa", /\b(gasa|chifon|chiffon)\b/],
  ["macrame", /\bmacrame\b/],
  ["hilo", /\b(hilo|tricot)\b/],
  ["oxford", /\boxford\b/],
  ["seersucker", /\b(seersucker|sirsaca)\b/],
  ["sastre", /\bsastre\b/],
  ["mojado", /\bmojad[oa]s?\b/],
  ["poliester", /\b(poliester|polyester)\b/],
  ["popelina", /\b(popelina|poplin)\b/],
  ["seda", /\b(seda|satin|raso)\b/],
  ["viscosa", /\b(viscosa|rayon)\b/],
  ["algodon", /\b(algodon|cotton)\b/],
];

const FAMILIA_POR_NOMBRE_EXACTO: Readonly<Record<string, FamiliaTejido>> = {
  tela: "tela",
};

export function familiaDeTejido(nombre: string): FamiliaTejido | null {
  const limpio = normalizarNombre(nombre);
  for (const [familia, regla] of REGLAS) {
    if (regla.test(limpio)) return familia;
  }
  return FAMILIA_POR_NOMBRE_EXACTO[limpio] ?? null;
}
