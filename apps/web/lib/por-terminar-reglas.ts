import type { PendientesDeLaSede } from "./recepcion-conteo-reglas";

// «Por terminar» en Recibir mercadería: los envíos que ya se contaron y están en el almacén pero no terminaron en el sistema (faltan separar
// por color, poner tallas o crear la prenda; ADR-0393). Lógica pura de la tabla que los lista junto a «Terminados»: la pantalla solo la llama.

export type EnvioPorTerminar = PendientesDeLaSede["envios"][number];

/** Cuántos envíos se pintan por página. */
export const POR_TERMINAR_POR_PAGINA = 10;

/** «Terminados» pagina también de 10 en 10, sobre las últimas recibidas que la pantalla trae (cada una carga sus líneas, así que no son todas):
 *  para ver más atrás está «Ver todo lo recibido». */
export const TERMINADOS_POR_PAGINA = 10;
export const TERMINADOS_MAXIMO = 50;

/** Las dos vistas de la tarjeta «Lo recibido»: lo que hay que terminar y lo que ya terminó. */
export type VistaRecibido = "por-terminar" | "terminados";

/** Lo que falta de un envío, en prendas: las que se separan, las que reciben tallas y las que se crean. */
export const prendasPorTerminar = (e: EnvioPorTerminar): number => e.porSeparar + e.porDetallar + e.porCrear;

/** Del envío que lleva más tiempo esperando al más nuevo (lo más viejo se atiende primero, ADR-0393 vigila los de más de 7 días); sin fecha,
 *  al final; a igual fecha, por número. No toca la lista que recibe. */
export function ordenarPorTerminar(envios: readonly EnvioPorTerminar[]): EnvioPorTerminar[] {
  const cuando = (e: EnvioPorTerminar) => {
    const t = e.cerradoEn ? Date.parse(e.cerradoEn) : NaN;
    return Number.isNaN(t) ? Infinity : t;
  };
  return [...envios].sort((a, b) => {
    const ta = cuando(a);
    const tb = cuando(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.numero ?? "").localeCompare(b.numero ?? "", "es", { numeric: true });
  });
}

/** Con algo por terminar, la tarjeta abre ahí (es lo que hay que atender); con nada, abre en lo terminado en vez de una tabla vacía. */
export function vistaInicialRecibido(envios: readonly EnvioPorTerminar[] | null | undefined): VistaRecibido {
  return envios && envios.length > 0 ? "por-terminar" : "terminados";
}

/** «hoy», «hace 1 día», «hace 5 días»: cuánto lleva esperando un envío. */
export function textoHaceDias(dias: number | null): string | null {
  if (dias == null) return null;
  if (dias <= 0) return "hoy";
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Pasada la semana, ADR-0393 pide que se note: la tabla marca el envío (el mismo corte del aviso). */
export const esViejoPorTerminar = (dias: number | null): boolean => dias != null && dias > 7;
