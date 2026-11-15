// La lectura de referencia del costo (ADR-0668, A4): lo que la hoja de Recibir necesita para avisar de un costo dudoso ANTES de guardar,
// con los mismos números con los que la base lo frena (`retail.fn_precio_referencia`, 20261115204000).
//
// CONTRATO
//   PROMETE: lee la respuesta de la base sin lanzar (un dato roto es «no se sabe», nunca un 0) y dice, para el costo de una prenda, si
//            pide confirmar y por qué, igual que `retail.fn_motivo_de_costo`.
//   ASUME:   montos en soles, con IGV; la base ya trae el anterior en la base del papel (×1.18 si su última entrada fue con factura).
//   NO HACE: no frena nada: el candado es de la base. Sin lectura (la base no respondió), no hay duda y se deja guardar (la base sigue
//            revisando al cerrar), con la línea «No pude comparar con lo de antes».
import { motivoDeCosto, type BandaDeCosto, type MotivoDeCosto, type ReferenciaDeCosto } from "./cuenta-de-precio";

export const RPC_PRECIO_REFERENCIA = "fn_precio_referencia";

export type ReferenciasDeCosto = {
  /** Por variante: su costo de hoy en la base del papel. Una prenda nueva no aparece. */
  anterior: Record<string, number>;
  /** Por categoría: lo que suele costar. Una categoría sin muestra (ni la suya ni su familia) no aparece. */
  bandas: Record<string, BandaDeCosto>;
  /** Por línea del ENVÍO (`despacho_items.id`): cuánto cuesta cada prenda según su orden, con todo. */
  lineas: Record<string, number>;
  tasaIgv: number;
};

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function mapaDeMontos(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = numero(x);
    if (n !== null && n > 0) out[k] = n;
  }
  return out;
}

/** La respuesta de `fn_precio_referencia`, o `null` si no se entiende. */
export function leerReferencias(data: unknown): ReferenciasDeCosto | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const tasa = numero(d.tasa_igv);
  if (tasa === null || tasa < 0 || tasa >= 1) return null;
  const bandas: Record<string, BandaDeCosto> = {};
  if (d.bandas && typeof d.bandas === "object") {
    for (const [k, x] of Object.entries(d.bandas as Record<string, unknown>)) {
      const b = (x ?? {}) as Record<string, unknown>;
      const lo = numero(b.lo);
      const hi = numero(b.hi);
      if (lo !== null && hi !== null && lo >= 0 && hi >= lo && (b.de === "categoria" || b.de === "familia")) bandas[k] = { lo, hi, de: b.de };
    }
  }
  return { anterior: mapaDeMontos(d.anterior), bandas, lineas: mapaDeMontos(d.lineas), tasaIgv: tasa };
}

/** De qué se trata un campo de costo: las prendas a las que se le pone, su categoría y su línea del envío (si llegó con orden). */
export type DondeDelCosto = { varianteIds: readonly string[]; categoriaId: string | null; lineaId: string | null };

export type DudaDeCosto = { motivo: MotivoDeCosto; ref: ReferenciaDeCosto };

/**
 * ¿Este costo pide confirmar? Como la base: cada talla o color se compara con SU anterior, y basta una para pedirlo. Sin lectura, `null`.
 * Una prenda nueva (sin variantes todavía) se compara solo con la orden y con su categoría.
 */
export function dudaDeCosto(costo: number | null, refs: ReferenciasDeCosto | null, donde: DondeDelCosto): DudaDeCosto | null {
  if (!refs || costo === null) return null;
  const banda = donde.categoriaId ? (refs.bandas[donde.categoriaId] ?? null) : null;
  const deLaOrden = donde.lineaId ? (refs.lineas[donde.lineaId] ?? null) : null;
  const anteriores = donde.varianteIds.length > 0 ? donde.varianteIds.map((id) => refs.anterior[id] ?? null) : [null];
  for (const anterior of anteriores) {
    const ref: ReferenciaDeCosto = { anterior, deLaOrden, banda };
    const motivo = motivoDeCosto(costo, ref, refs.tasaIgv);
    if (motivo) return { motivo, ref };
  }
  return null;
}

/** Lo que se le manda a la base al cerrar: los montos que la persona dijo «Sí, pagué», sin repetir. */
export function montosConfirmados(montos: Iterable<number>): number[] {
  return [...new Set([...montos].filter((m) => Number.isFinite(m) && m > 0).map((m) => Math.round(m * 100) / 100))];
}
