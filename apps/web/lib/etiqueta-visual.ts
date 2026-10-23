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
//
// Desde el 2026-10-23 (ADR-0489) las familias, su reconocimiento por nombre y los dibujos viven en `packages/shared/src/insignias-visual.ts`,
// compartidos con la tienda online (la ficha de la prenda muestra la calabaza de Halloween igual que el ERP). Aquí queda lo que solo
// es del ERP: el rótulo del papel de la etiqueta de precio.

import { iconoDeInsignia, type IconoInsignia } from "@cayla-retail/shared/insignias-visual";

export type IconoEtiqueta = IconoInsignia;

export const iconoDeEtiqueta = iconoDeInsignia;

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
