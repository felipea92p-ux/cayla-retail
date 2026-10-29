/**
 * Sugerencias de «Reportar dañada» (ADR-0290, ADR-0564): el ejemplo del campo de detalle sigue lo que la persona ya eligió.
 *
 * EL PROBLEMA. Con «Descosido» elegido, un ejemplo de mancha («parece grasa») es peor que ninguno: afirma algo equivocado sobre lo que
 * la persona tiene en la mano. El ejemplo sale del tipo, no de un texto fijo en el componente.
 *
 * CONTRATO.
 *   PROMETE: un ejemplo para CADA tipo de la lista (la prueba recorre todos), distinto entre tipos y corto (cabe en un campo de 375 px
 *            sin cortarse a media palabra); y, sin tipo, un texto que no promete nada.
 *   ASUME:   el tipo ya fue leído con `leerTipoDano`.
 *   NO HACE: no decide si la nota es obligatoria (eso es `problemasReporte`, igual que la base).
 */

import type { TipoDano } from "./danadas-reglas";

/** Lo más largo que cabe en un placeholder del celular sin cortarse (el campo de la hoja a 375 px). */
export const MAX_PISTA_DANADA = 38;

const PISTAS: Record<TipoDano, string> = {
  mancha: "Ej. cerca del cuello, parece grasa",
  descosido: "Ej. la costura del hombro",
  boton_cierre: "Ej. falta el botón de arriba",
  rotura: "Ej. rasgón en la manga",
  otro: "Cuenta qué tiene la prenda",
};

/** El ejemplo del campo de detalle para el tipo elegido; sin tipo, una invitación a elegirlo primero. */
export function pistaDeNota(tipo: TipoDano | null | undefined): string {
  return tipo ? PISTAS[tipo] : "Primero elige qué tiene";
}
