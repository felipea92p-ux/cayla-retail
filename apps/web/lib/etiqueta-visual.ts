// Qué dibujo le toca a una etiqueta comercial según su nombre — mismo criterio
// que `patron-visual.ts`: el nombre es lo único estable del vocabulario (un
// Líder puede agregar etiquetas nuevas), y el dibujo se elige por familia de
// concepto, no por igualdad exacta. Así "Para liquidar — Tienda AQP" y "Para
// liquidar — Taller" comparten el dibujo de "Para liquidar" sin que nadie
// tenga que tocar código cuando aparece una sede o campaña nueva.
//
// Diferencia con patrones/tejidos: una etiqueta es un CONCEPTO (rebaja,
// festividad), no una muestra física. Un nombre que no reconocemos NO queda
// "sin muestra": cae en un ícono genérico de etiqueta, que no es falso.

import { normalizarNombre } from "./patron-visual";

export type IconoEtiqueta =
  | "nuevo"
  | "ultimas"
  | "top"
  | "liquidar"
  | "manual"
  | "unica"
  | "reedicion"
  | "valentin"
  | "galentine"
  | "madre"
  | "mujer"
  | "halloween"
  | "navidad"
  | "patrias"
  | "blackfriday"
  | "cyberwow"
  | "aniversario"
  | "gato"
  | "perro"
  | "tierra";

// El orden importa cuando dos reglas pueden coincidir: "galentine" antes que
// "valentin" (Galentine's Day es la fiesta de amigas, no la de pareja) y
// "black friday"/"cyber" antes que cualquier regla de rebaja genérica.
const REGLAS: ReadonlyArray<readonly [IconoEtiqueta, RegExp]> = [
  ["galentine", /\bgalentine/],
  ["valentin", /\bvalentin\b/],
  ["blackfriday", /\bblack\s*friday\b/],
  ["cyberwow", /\bcyber/],
  ["aniversario", /\baniversario\b/],
  ["madre", /\bdia de la madre\b/],
  ["mujer", /\bdia de la mujer\b/],
  ["tierra", /\bdia de la tierra\b/],
  ["gato", /\bgato\b/],
  ["perro", /\bperro\b/],
  ["patrias", /\b(fiestas patrias|patrias|independencia)\b/],
  ["halloween", /\b(halloween|noche de brujas)\b/],
  ["navidad", /\b(navidad|navideno|navidena)\b/],
  ["ultimas", /\bultimas?\b/],
  ["top", /\b(top ventas|mas vendid[oa]s?|best ?seller)\b/],
  ["liquidar", /\b(liquidar|liquidacion|outlet|rebaja|remate)\b/],
  ["manual", /\b(hecho a mano|artesanal|handmade)\b/],
  ["unica", /\b(pieza unica|unica)\b/],
  ["reedicion", /\b(reedicion|reedit|re-edicion)\b/],
  ["nuevo", /\b(nuevo|nueva|nuevos|nuevas|novedad|novedades)\b/],
];

export function iconoDeEtiqueta(nombre: string): IconoEtiqueta | null {
  const limpio = normalizarNombre(nombre);
  for (const [icono, regla] of REGLAS) {
    if (regla.test(limpio)) return icono;
  }
  return null;
}

// La palabra que acompaña al ícono en el papel de la etiqueta de precio (ADR-0180, «Actualización 2026-09-29 (c)»): un
// ícono solo no dice qué es (¿una aguja?, ¿un reloj de arena?). Es una palabra CORTA por familia de concepto —no el nombre
// de la etiqueta— porque en 34 mm útiles tienen que caber dos y «Día Internacional del Gato» no cabe. Se escribe como se lee:
// el CSS la pone en mayúsculas. Las que llevan «Día» lo conservan (MADRE sola no dice de qué es).
const ROTULOS: Record<IconoEtiqueta, string> = {
  nuevo: "Nuevo",
  ultimas: "Últimas",
  top: "Top ventas",
  liquidar: "Liquidar",
  manual: "A mano",
  unica: "Pieza única",
  reedicion: "Reedición",
  valentin: "Valentín",
  galentine: "Galentine",
  madre: "Día madre",
  mujer: "Día mujer",
  halloween: "Halloween",
  navidad: "Navidad",
  patrias: "Patrias",
  blackfriday: "Black Friday",
  cyberwow: "CyberWow",
  aniversario: "Aniversario",
  gato: "Día gato",
  perro: "Día perro",
  tierra: "Día tierra",
};

/** La palabra del papel para una etiqueta: la de su familia de concepto, o —si el nombre no se reconoce— su propio nombre
 *  (el CSS lo corta con «…» si no cabe). */
export function rotuloDeEtiqueta(nombre: string): string {
  const icono = iconoDeEtiqueta(nombre);
  return icono ? ROTULOS[icono] : nombre.trim();
}
