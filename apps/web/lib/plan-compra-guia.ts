// Guía de foco del plan de campaña (ADR-0284 aplicada a ADR-0349): qué está hecho, qué sigue y qué falta en la hoja de una categoría.
// No agrega reglas: cada campo está «hecho» cuando `problemasDelBorrador` (las mismas validaciones que la base) no le encuentra nada.
// La prueba exige que la guía deje confirmar exactamente cuando la base aceptaría.

import type { CampoDeGuia } from "./guia-campos";
import { problemaDelTope, problemasDelBorrador, type Borrador, type TallaPlan } from "./plan-compra-reglas";

export function camposDelPlan(
  b: Borrador,
  tallas: readonly TallaPlan[],
  responsable: { listo: boolean; motivo: string | null }
): CampoDeGuia[] {
  const p = problemasDelBorrador(b, tallas);
  const campo = (id: keyof typeof p, nombre: string, pendiente: string): CampoDeGuia => ({ id, nombre, requerido: true, hecho: !p[id], pendiente: p[id] ?? pendiente });
  return [
    campo("flojo", "Diciembre flojo", "Escribe cuántas venderías en un diciembre flojo."),
    campo("normal", "Diciembre normal", "Escribe cuántas venderías en un diciembre normal."),
    campo("bueno", "Diciembre bueno", "Escribe cuántas venderías en un diciembre bueno."),
    campo("precio", "Precio", "Escribe el precio de venta promedio."),
    campo("costo", "Costo", "Escribe el costo promedio por prenda."),
    campo("recupero", "Lo que sobra", "Escribe a qué % del precio vendes lo que sobre."),
    // La curva viene propuesta por el sistema: solo falta si alguien la cambió y ya no suma 100.
    campo("curva", "Curva de tallas", "Revisa la curva de tallas."),
    { id: "responsable", nombre: "Quién arma el plan", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién arma el plan." },
  ];
}

/** La guía de la hoja del tope (ADR-0372): el monto y quién lo firma. «Hecho» es lo que `problemaDelTope` ya acepta: la misma regla que la base. */
export function camposDelTope(texto: string, responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const problema = problemaDelTope(texto);
  return [
    { id: "tope", nombre: "Tope de inversión", requerido: true, hecho: problema === null, pendiente: problema ?? "Escribe cuánto quieres invertir." },
    { id: "responsable", nombre: "Quién fija el tope", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién fija el tope." },
  ];
}
