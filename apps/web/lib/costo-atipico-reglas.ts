import { soles } from "./compras-reglas";

// El «costo atípico» (Felipe, 2026-09-30). La REGLA vive en la base (`retail.fn_costo_fuera_de_banda`, migración
// 20260930120000): la web NO la repite. Cuando un cierre de Producción, una factura o una recepción trae un costo por
// prenda fuera de lo normal, la base rechaza con el mensaje estable `costo_atipico` y el dato en `details` (JSON:
// motivo, costo_unitario, costo_vigente, precio, sku). Acá solo se LEE esa respuesta y se pone en palabras de CAYLA,
// una sola vez para todas las pantallas que piden confirmar un costo. Puro: sin Supabase ni `next/headers`.

export const MOTIVOS_COSTO_ATIPICO = ["sin_costo", "mayor_que_precio", "sube", "baja"] as const;
export type MotivoCostoAtipico = (typeof MOTIVOS_COSTO_ATIPICO)[number];

export type CostoAtipico = {
  motivo: MotivoCostoAtipico;
  /** El costo por prenda con el que se cerraría. */
  costoUnitario: number;
  /** El costo actual de la prenda (0 o `null` si todavía no tiene). */
  costoVigente: number | null;
  precio: number | null;
  sku: string | null;
};

type ErrorConDetalle = { message?: string | null; details?: string | null } | null | undefined;

const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Lo que dice la base cuando pide confirmar un costo, o `null` si el error no es ese. Solo el LÍDER recibe el dato: a
 * quien no ve montos la base le contesta `costo_atipico_sin_lider`, sin cifras, y eso NO se lee acá (lo dice
 * `traducirError`). Nunca lanza: un `details` roto es «no es un costo atípico» y el error sigue su camino normal.
 */
export function leerCostoAtipico(error: ErrorConDetalle): CostoAtipico | null {
  if (!error || error.message !== "costo_atipico" || !error.details) return null;
  try {
    const d = JSON.parse(error.details) as Record<string, unknown>;
    const motivo = MOTIVOS_COSTO_ATIPICO.find((m) => m === d.motivo);
    const costoUnitario = numeroONulo(d.costo_unitario);
    if (!motivo || costoUnitario === null) return null;
    return {
      motivo,
      costoUnitario,
      costoVigente: numeroONulo(d.costo_vigente),
      precio: numeroONulo(d.precio),
      sku: typeof d.sku === "string" && d.sku ? d.sku : null,
    };
  } catch {
    return null;
  }
}

/** El aviso que ve el líder antes de confirmar: qué pasó y con qué cifras, en dos partes (título y detalle). */
export function fraseCostoAtipico(d: CostoAtipico): { titulo: string; detalle: string } {
  const prenda = d.sku ? ` de ${d.sku}` : "";
  const vigente = d.costoVigente !== null && d.costoVigente > 0 ? d.costoVigente : null;
  const cuesta = soles(Math.max(0, d.costoUnitario));

  switch (d.motivo) {
    case "sin_costo":
      return {
        titulo: "Esta orden no tiene costo",
        detalle: `Cada prenda${prenda} saldría a ${soles(0)}: quedaría sin costo y con un margen de 100 %.`,
      };
    case "mayor_que_precio":
      return {
        titulo: "El costo es igual o mayor que el precio de venta",
        detalle: `Cada prenda${prenda} saldría a ${cuesta}${d.precio !== null ? ` y se vende a ${soles(d.precio)}` : ""}: se vendería con pérdida.`,
      };
    case "sube":
      return {
        titulo: "El costo por prenda subió mucho",
        detalle: vigente
          ? `Cada prenda${prenda} saldría a ${cuesta}: ${(d.costoUnitario / vigente).toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces su costo actual (${soles(vigente)}).`
          : `Cada prenda${prenda} saldría a ${cuesta}, más del doble de su costo actual.`,
      };
    case "baja":
      return {
        titulo: "El costo por prenda bajó mucho",
        detalle: vigente
          ? `Cada prenda${prenda} saldría a ${cuesta}: ${Math.round((d.costoUnitario / vigente) * 100)} % de su costo actual (${soles(vigente)}).`
          : `Cada prenda${prenda} saldría a ${cuesta}, menos de dos tercios de su costo actual.`,
      };
  }
}
