/* ====================================================================
   El ritmo de una prenda: cuántas se venden por semana y para cuántas semanas alcanza lo que hay (piso + almacén, lo libre). Lo usa el
   panel de la talla, con su aro de semanas.

   Aquí vivía también «Colgar primero» (2026-10-05), las tres prendas que más convenía colgar hoy, sobre la lista de tarjetas. Se quitó
   el 2026-10-06 (Felipe, mirando la maqueta: «quita esto»): la lista ya ordena por lo que falta en el piso y el filtro «Por colgar» dice
   cuáles son (ADR-0344, «Quinta vuelta»). El archivo conserva su nombre para no mover a quien lo importa.

   El ritmo es el «Ritmo reciente» de siempre (`existencias-ritmo.ts`, ventas ÷ jornadas con la prenda en el piso) y respeta sus dos
   decisiones de Felipe (2026-09-25): con pocas jornadas NO se dice una tasa, y «cero ventas» no se dice «nunca vende». En esos casos
   la fila lo cuenta tal cual («Poco tiempo en el piso para medir», «Sin ventas esta semana») y no dibuja aro.
   ==================================================================== */

import type { RitmoReciente } from "./existencias-ritmo";
import type { FilaPrenda, PrendaAgrupada } from "./existencias-prendas";

type FilaConRitmo = FilaPrenda & { ritmoReciente?: RitmoReciente | null };

export type RitmoDePrenda =
  /** Hay al menos una talla con ritmo medido: `porSemana` suma las que se pudieron medir. */
  | { tipo: "medido"; porSemana: number; semanas: number }
  | { tipo: "poco_tiempo" }
  | { tipo: "sin_ventas" }
  /** No se pudo calcular (falló la lectura) o no es una tienda: no se dice nada. */
  | { tipo: "desconocido" };

/** El ritmo de la prenda: lo que se vende por semana (suma de sus tallas con ritmo medido × 7 jornadas) y para cuántas semanas
 *  alcanza lo que hay libre. */
export function ritmoDePrenda<F extends FilaConRitmo>(prenda: PrendaAgrupada<F>): RitmoDePrenda {
  const ritmos = prenda.tallas.map((f) => f.ritmoReciente ?? null);
  if (ritmos.every((r) => r === null)) return { tipo: "desconocido" };
  const medidos = ritmos.filter((r): r is Extract<RitmoReciente, { tipo: "medida" }> => r?.tipo === "medida");
  if (medidos.length > 0) {
    const porSemana = medidos.reduce((n, r) => n + r.unidadesDia, 0) * 7;
    return { tipo: "medido", porSemana, semanas: porSemana > 0 ? prenda.disponible / porSemana : Infinity };
  }
  return ritmos.some((r) => r?.tipo === "sin_salida") ? { tipo: "sin_ventas" } : { tipo: "poco_tiempo" };
}

/** Lo que dice la fila del ritmo, con las palabras de la maqueta. `null` = no decir nada. */
export function textoDeRitmo(r: RitmoDePrenda): string | null {
  switch (r.tipo) {
    case "medido": {
      const vende = r.porSemana < 1 ? "menos de 1 por semana" : `unas ${Math.round(r.porSemana)} por semana`;
      if (r.semanas < 1) return `Se venden ${vende}. Se acaba esta semana.`;
      const n = Math.max(1, Math.round(r.semanas));
      return `Se venden ${vende}. Te alcanza para ${n} ${n === 1 ? "semana" : "semanas"}.`;
    }
    case "poco_tiempo":
      return "Poco tiempo en el piso para medir cuánto se vende.";
    case "sin_ventas":
      return "Sin ventas esta semana.";
    case "desconocido":
      return null;
  }
}
