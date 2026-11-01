// La pila de la bandeja de Gastos (`GastosPulso`, la 03 del benchmark visual, Felipe 2026-10-31): lógica pura de lo que la pantalla dibuja.
// No decide nada de dinero: qué se guarda y qué falta para guardarlo sale de `guardadoDeEgreso` (lib/clasificar-egreso.ts).

import { vaAlBanco, type DecisionEgreso } from "./clasificar-egreso";
import type { CampoDeGuia } from "./guia-campos";

export type Destino = { id: string; nombre: string };

/** La barra de la pila: lo revisado en esta visita contra todo lo que había. Con una sola cosa no hace falta barra (`null`). */
export function avanceDeLaPila(hechas: number, quedan: number): { pct: number; texto: string } | null {
  const total = hechas + quedan;
  if (total < 2) return null;
  return { pct: Math.round((hechas / total) * 100), texto: `${hechas} de ${total}` };
}

/** Lo que había antes y ya no está en la lista nueva (la base lo sacó: se resolvió aquí, en una hoja o lo hizo otra persona). */
export function idas<T extends { clave: string }>(antes: readonly T[], ahora: readonly T[]): T[] {
  const quedan = new Set(ahora.map((c) => c.clave));
  return antes.filter((c) => !quedan.has(c.clave));
}

/**
 * La guía de foco de la tarjeta de arriba (ADR-0284): los mismos campos que `guardadoDeEgreso` exige, y quién lo hace (sin responsable la
 * base no firma). Un gasto pide su categoría y qué se pagó; un depósito al banco, la cuenta; «otra cosa», qué fue. La nota de un retiro, un
 * ajuste o un depósito es opcional y no se lista.
 */
export function camposDeLaDecision(d: DecisionEgreso, destinos: readonly Destino[], responsable: { listo: boolean; motivo: string | null }): CampoDeGuia[] {
  const campos: CampoDeGuia[] = [];
  if (d.que === "gasto") {
    campos.push({ id: "categoria", nombre: "Categoría", requerido: true, hecho: d.categoria !== "", pendiente: "Elige la categoría." });
    campos.push({ id: "descripcion", nombre: "Qué se pagó", requerido: true, hecho: d.descripcion.trim() !== "", pendiente: "Escribe qué se pagó." });
  }
  if (vaAlBanco(d, destinos)) campos.push({ id: "destino", nombre: "Cuenta", requerido: true, hecho: d.destino !== "", pendiente: "Elige a qué cuenta llegó." });
  if (d.que === "otro") campos.push({ id: "motivo", nombre: "Qué fue", requerido: true, hecho: d.motivo.trim() !== "", pendiente: "Escribe qué fue." });
  else if (d.que !== "gasto" && d.que !== "activo") campos.push({ id: "motivo", nombre: "Nota", requerido: false, hecho: d.motivo.trim() !== "", pendiente: "" });
  campos.push({ id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién lo hace." });
  return campos;
}
