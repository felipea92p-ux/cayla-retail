// Lo que la ficha de clienta deduce de sus compras — D-101 (talla por tipo de prenda) y D-103
// («te falta N para frecuente»). Lógica pura sobre las filas que ya trajo `fn_clienta_compras`
// (`lib/clientas.ts`): CALCULADA AL LEER, JAMÁS GUARDADA (D-103 lo exige explícito) — el día que
// cambie el umbral de "frecuente" no hay que migrar ninguna columna, solo esta función.
import type { Compra } from "./clientas-reglas";

/** Propuesta D-103, a ajustar cuando haya datos reales de ventas (hoy el club recién empieza). */
export const COMPRAS_PARA_FRECUENTE = 3;
export const MESES_PARA_FRECUENTE = 6;

export type TallaDeducida = { categoria: string; talla: string };

/**
 * La talla más RECIENTE por categoría (no la más frecuente): una clienta cambia de talla con el
 * tiempo, y lo último que compró es más confiable que un promedio. `compras` debe venir ordenada
 * de más reciente a más antigua (así la sale `fn_clienta_compras`) — se toma la primera aparición
 * de cada categoría.
 *
 * La prenda marcada «es para regalo» en caja (`venta_items.es_regalo`, ADR-0288 D-7) NO cuenta: la
 * talla de la hermana no es la suya (D-101). Se salta sin más, así que la talla sale de la compra
 * anterior en que sí compró para ella. (Cerró el «límite conocido v1» de este archivo, tanda 1d.)
 */
export function deducirTallas(compras: readonly Compra[]): TallaDeducida[] {
  const vistas = new Set<string>();
  const resultado: TallaDeducida[] = [];
  for (const compra of compras) {
    for (const item of compra.items) {
      if (item.esRegalo) continue;
      if (!item.categoria || !item.talla || vistas.has(item.categoria)) continue;
      vistas.add(item.categoria);
      resultado.push({ categoria: item.categoria, talla: item.talla });
    }
  }
  return resultado;
}

/** Cuántas compras (ventas distintas) hizo en los últimos `meses`, contadas desde `ahora`. */
export function comprasRecientes(compras: readonly Compra[], ahora: Date, meses = MESES_PARA_FRECUENTE): number {
  const corte = new Date(ahora);
  corte.setMonth(corte.getMonth() - meses);
  return compras.filter((c) => new Date(c.fecha) >= corte).length;
}

export type EstadoFrecuente = { esFrecuente: boolean; faltanParaFrecuente: number; comprasEnVentana: number };

/** D-103: «te falta N para frecuente» — regla fija y explicable, nunca guardada. */
export function estadoFrecuente(compras: readonly Compra[], ahora: Date): EstadoFrecuente {
  const comprasEnVentana = comprasRecientes(compras, ahora);
  const esFrecuente = comprasEnVentana >= COMPRAS_PARA_FRECUENTE;
  return { esFrecuente, faltanParaFrecuente: esFrecuente ? 0 : COMPRAS_PARA_FRECUENTE - comprasEnVentana, comprasEnVentana };
}
