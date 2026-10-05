/* ====================================================================
   «Colgar primero» (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`): las tres prendas que más conviene colgar hoy,
   con cuánto le dura lo que hay a lo que se vende. Va sobre la lista de tarjetas, cuando no hay nada filtrado ni escrito.

   NO inventa un orden: usa el de la lista del día del motor del piso (`ordenarPorListaDelDia`: lo vendido ayer primero, ADR-0329
   act. 1), el mismo de «Para hoy», del Inicio de Almacén y de la lista de abajo. Dos órdenes distintos para «qué colgar» harían que
   la misma prenda saliera primera en una pantalla y tercera en la otra. Lo que SÍ suma es el ritmo: cuántas se venden por semana y
   para cuántas semanas alcanza lo que hay (piso + almacén, lo libre).

   El ritmo es el «Ritmo reciente» de siempre (`existencias-ritmo.ts`, ventas ÷ jornadas con la prenda en el piso) y respeta sus dos
   decisiones de Felipe (2026-09-25): con pocas jornadas NO se dice una tasa, y «cero ventas» no se dice «nunca vende». En esos casos
   la fila lo cuenta tal cual («Poco tiempo en el piso para medir», «Sin ventas esta semana») y no dibuja aro.
   ==================================================================== */

import { hoyDeTalla } from "./existencias-hoy";
import type { RitmoReciente } from "./existencias-ritmo";
import type { FilaPrenda, PrendaAgrupada } from "./existencias-prendas";

/** Cuántas prendas se muestran: las tres de la maqueta aprobada. */
export const MAX_COLGAR_PRIMERO = 3;

type FilaConRitmo = FilaPrenda & { ritmoReciente?: RitmoReciente | null };

export type RitmoDePrenda =
  /** Hay al menos una talla con ritmo medido: `porSemana` suma las que se pudieron medir. */
  | { tipo: "medido"; porSemana: number; semanas: number }
  | { tipo: "poco_tiempo" }
  | { tipo: "sin_ventas" }
  /** No se pudo calcular (falló la lectura) o no es una tienda: no se dice nada. */
  | { tipo: "desconocido" };

export type PrendaParaColgar<F extends FilaConRitmo = FilaConRitmo> = {
  prenda: PrendaAgrupada<F>;
  /** Las tallas «Por colgar», en el orden de la curva. */
  tallasPorColgar: string[];
  ritmo: RitmoDePrenda;
};

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

/** Las primeras `tope` prendas con alguna talla «Por colgar», EN EL ORDEN EN QUE LLEGAN: quien llama pasa las prendas ya ordenadas con
 *  la lista del día (`ordenarPorListaDelDia`). Con el piso sin cuadrar ninguna talla es «Por colgar» (ADR-0328, decisión 5) y no se
 *  muestra nada: no se manda a colgar lo que podría estar ya colgado. */
export function colgarPrimero<F extends FilaConRitmo>(prendasEnOrden: readonly PrendaAgrupada<F>[], tope = MAX_COLGAR_PRIMERO): PrendaParaColgar<F>[] {
  const salida: PrendaParaColgar<F>[] = [];
  for (const prenda of prendasEnOrden) {
    const tallas = prenda.tallas.filter((f) => hoyDeTalla(f) === "por_colgar").map((f) => f.talla ?? "Única");
    if (tallas.length === 0) continue;
    salida.push({ prenda, tallasPorColgar: tallas, ritmo: ritmoDePrenda(prenda) });
    if (salida.length === tope) break;
  }
  return salida;
}
