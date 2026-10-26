// El ritmo de venta de un proveedor, en UNIDADES: una sola regla para todo Proveedores (ADR-0502, actualización 2026-10-24 (d)).
// La usan el aviso «frenar» de la lista, el aviso «ritmo» de la ficha y el veredicto de una palabra del ranking, así que nunca se contradicen
// (Lasak: el aviso decía «frena» y el ranking «Pocas ventas»). Pura, sin I/O. Los umbrales son reglas de negocio de Felipe y se cambian aquí.

import { diasEntreFechas } from "./fechas-lima";

/** Una prenda que llegó hace menos que esto no se juzga: «sin vender» puede ser solo que llegó ayer. */
export const DIAS_PARA_JUZGAR = 21;
/** Unidades compradas mínimas para hablar del ritmo de un proveedor (con menos, es poca mercadería para medir nada). */
export const MIN_COMPRADAS = 20;
/** Semanas que tardaría en venderse lo que queda, al ritmo actual, desde las que se avisa «frénate»: una temporada. */
export const SEMANAS_STOCK_LARGO = 16;
/** Semanas en las que, al ritmo actual, se agota lo que queda: desde ahí es «vuelve a comprarle» (con margen) o «se agota pronto». */
export const SEMANAS_AGOTA = 6;

export type Ritmo = {
  /** ¿Hay mercadería suficiente y tiempo en la tienda para hablar de ritmo? */
  juzgable: boolean;
  vendidas: number;
  enEstantes: number;
  semanas: number;
  porSemana: number;
  /** Semanas que tardaría en venderse lo que queda: 0 si no queda nada, `Infinity` si no vendió nada. */
  semanasParaAgotar: number;
  /** Tarda `SEMANAS_STOCK_LARGO` semanas o más (o no vendió nada) en vender lo que le queda. */
  lento: boolean;
  /** Agota lo que le queda en `SEMANAS_AGOTA` semanas o menos. */
  agota: boolean;
};

/** Lo único que hace falta para medir el ritmo de un proveedor (lo traen la ficha, los avisos y el ranking). */
export type DatosDeRitmo = { unidadesVendidas: number; unidadesCompradas: number; unidadesEnEstantes: number; primeraEntrada: string | null };

/**
 * El ritmo de UN proveedor, en UNIDADES (vale para los dos orígenes, carga inicial incluida). No exige un mínimo de ventas: con 0 o pocas, el
 * ritmo es lento por definición. Si no vendió nada no hay ritmo que medir: cuenta como lento cuando lleva `DIAS_PARA_JUZGAR` días o más en la tienda.
 */
export function ritmoDeDatos(d: DatosDeRitmo, hoy: string): Ritmo {
  const dias = d.primeraEntrada ? diasEntreFechas(d.primeraEntrada, hoy) : null;
  const semanas = d.primeraEntrada ? Math.max(1, (dias ?? 0) / 7) : 1;
  const porSemana = d.unidadesVendidas / semanas;
  const enEstantes = d.unidadesEnEstantes;
  const semanasParaAgotar = enEstantes === 0 ? 0 : d.unidadesVendidas === 0 ? Infinity : enEstantes / porSemana;
  const juzgable = dias != null && dias >= DIAS_PARA_JUZGAR && d.unidadesCompradas >= MIN_COMPRADAS;
  return {
    juzgable,
    vendidas: d.unidadesVendidas,
    enEstantes,
    semanas,
    porSemana,
    semanasParaAgotar,
    lento: juzgable && enEstantes > 0 && semanasParaAgotar >= SEMANAS_STOCK_LARGO,
    agota: juzgable && d.unidadesVendidas > 0 && enEstantes > 0 && semanasParaAgotar <= SEMANAS_AGOTA,
  };
}

export const textoSemanas = (r: Ritmo) => (Number.isFinite(r.semanasParaAgotar) ? `unas ${Math.round(r.semanasParaAgotar)} semanas` : "un tiempo que no se puede medir: no ha vendido nada");
