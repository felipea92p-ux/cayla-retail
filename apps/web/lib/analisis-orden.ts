// Análisis, cara B (ADR-0357, act. 2026-11-21): cómo se ordena cada pestaña. Un solo control, la píldora «Ordenar por» junto a cuántos
// modelos se ven (ficha al milímetro `docs/milimetro/analisis-b.md`, §9 choque 5: una función, un control). Cada pestaña ofrece lo que
// tiene sentido para su pregunta, y la primera opción es como la pestaña ya ordenaba. Ordenar no quita modelos: solo los acomoda.

import type { PrendaAnalisis, VistaAnalisis } from "./analisis-tipos";
import { plataParada } from "./analisis-quietas";
import { totalEnTienda } from "./analisis-reglas";

export type OpcionOrden = { valor: string; texto: string };

/** Las opciones de cada pestaña; la primera es la de siempre. Una pestaña sin lista no ofrece ordenar. */
export const ORDENES: Partial<Record<VistaAnalisis, readonly OpcionOrden[]>> = {
  acaba: [
    { valor: "urgente", texto: "Lo más urgente" },
    { valor: "vende", texto: "Lo que más se vende" },
    { valor: "nombre", texto: "Por nombre" },
  ],
  piso: [
    { valor: "vende", texto: "Lo que más se vende" },
    { valor: "dias", texto: "Más días en la tienda" },
    { valor: "nombre", texto: "Por nombre" },
  ],
  pedir: [
    { valor: "vende", texto: "Lo que más se vende" },
    // Felipe 2026-11-24: «lo que más se vende pero quedan pocos»; «pocos» es lo que se acaba en 2 semanas o menos (`modelosQueNoLlegan`).
    { valor: "pocos", texto: "Lo que más se vende y quedan pocos" },
    { valor: "acaba", texto: "Lo que se acaba antes" },
    { valor: "nombre", texto: "Por nombre" },
  ],
  nose: [
    { valor: "dias", texto: "Más días sin venderse" },
    { valor: "parada", texto: "Más plata parada" },
    { valor: "prendas", texto: "Más prendas" },
  ],
};

/** El orden de siempre de una pestaña («» si no ofrece ordenar). */
export const ordenPorDefecto = (vista: VistaAnalisis): string => ORDENES[vista]?.[0]?.valor ?? "";

/** El orden elegido para esa pestaña, o el de siempre si no se eligió uno que ella ofrezca. */
export function ordenDe(vista: VistaAnalisis, elegidos: Partial<Record<VistaAnalisis, string>>): string {
  const e = elegidos[vista];
  return e && ORDENES[vista]?.some((o) => o.valor === e) ? e : ordenPorDefecto(vista);
}

/**
 * Acomoda una lista que ya viene en el orden de siempre de su pestaña. «vende»: lo que más se vendió en mis 30 días primero; «nombre»:
 * de la A a la Z. Cualquier otro valor deja el orden de siempre. Es estable: a igual valor, se respeta el orden en que venían.
 */
export function ordenar<T extends { nombre: string; vendidas30: number }>(lista: readonly T[], orden: string): T[] {
  if (orden === "vende") return [...lista].sort((a, b) => b.vendidas30 - a.vendidas30);
  if (orden === "nombre") return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return [...lista];
}

/** «No se vende»: los días sin venderse (como ya vienen), la plata parada o cuántas prendas tiene, de más a menos. */
export function ordenarQuietas<T extends PrendaAnalisis & { variantes?: readonly PrendaAnalisis[] }>(lista: readonly T[], orden: string): T[] {
  if (orden === "parada") return [...lista].sort((a, b) => (plataParada(b) ?? 0) - (plataParada(a) ?? 0));
  if (orden === "prendas") return [...lista].sort((a, b) => totalEnTienda(b) - totalEnTienda(a));
  return ordenar(lista, orden);
}
