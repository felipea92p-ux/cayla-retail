import { soles } from "./historial-prenda-reglas";
import { diaLima } from "./fechas-lima";

// La pestaña «Costo» del Historial de la prenda (maqueta: docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html). Lee
// lo que devuelve `fn_costo_de_la_prenda` (20261024223000) y lo dice en palabras de tienda: cuánto cuesta hoy cada prenda, si subió
// o bajó desde que se empezó a comprar, y qué hizo cada compra. Lógica pura: la usan la página y la vista rápida.
//
// Regla de negocio (Felipe, 2026-10-24): la evolución del costo la mueven las COMPRAS (Recibir mercadería y los cierres del
// Taller). La primera compra de una prenda sin stock no es un «cambio»: es donde empieza la historia.

export type CompraCosto = {
  fecha: string;
  origen: "compra" | "produccion";
  llegaron: number;
  costoLlegaron: number;
  yaHabia: number;
  /** null si no había ninguna prenda antes de esta compra. */
  costoAntes: number | null;
  costoDespues: number;
  documento: string | null;
  proveedor: string | null;
  persona: string | null;
};

export type CostoPrenda = {
  compras: CompraCosto[];
  hoy: { stock: number; costo: number | null };
  inicio: { fecha: string | null; costo: number | null };
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Lo que devolvió la base, ya con forma. `null` si no vino nada (la cuenta no ve el dinero de compras o falló la lectura). */
export function leerCostoPrenda(json: unknown): CostoPrenda | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const compras: CompraCosto[] = (Array.isArray(j.compras) ? j.compras : []).flatMap((x): CompraCosto[] => {
    const c = (x ?? {}) as Record<string, unknown>;
    const llegaron = num(c.llegaron), costoLlegaron = num(c.costo_llegaron), costoDespues = num(c.costo_despues), fecha = texto(c.fecha);
    if (llegaron === null || llegaron <= 0 || costoLlegaron === null || costoDespues === null || !fecha) return [];
    return [{
      fecha,
      origen: c.origen === "produccion" ? "produccion" : "compra",
      llegaron,
      costoLlegaron,
      yaHabia: num(c.ya_habia) ?? 0,
      costoAntes: num(c.costo_antes),
      costoDespues,
      documento: texto(c.documento),
      proveedor: texto(c.proveedor),
      persona: texto(c.persona),
    }];
  });
  compras.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hoy = (j.hoy ?? {}) as Record<string, unknown>;
  const inicio = (j.inicio ?? {}) as Record<string, unknown>;
  return {
    compras,
    hoy: { stock: Math.max(0, num(hoy.stock) ?? 0), costo: num(hoy.costo) },
    inicio: { fecha: texto(inicio.fecha), costo: num(inicio.costo) },
  };
}

export type Movida = { tipo: "primera" | "igual" | "sube" | "baja"; monto: number };

/** Qué hizo una compra con el costo. «primera»: no había prendas antes, así que no hay con qué comparar. */
export function movidaDeCompra(c: CompraCosto): Movida {
  if (c.yaHabia <= 0 || c.costoAntes === null) return { tipo: "primera", monto: 0 };
  const d = Math.round((c.costoDespues - c.costoAntes) * 100) / 100;
  return d === 0 ? { tipo: "igual", monto: 0 } : { tipo: d > 0 ? "sube" : "baja", monto: Math.abs(d) };
}

export type RespuestaCosto = {
  /** Lo que cuesta hoy cada prenda. */
  hoy: number | null;
  /** Desde dónde se cuenta: el costo de lo que había antes de la primera compra, o el de la primera compra si no había nada. */
  desde: number | null;
  /** Hoy menos «desde», a céntimos. */
  cambio: number;
  /** Cuántas compras cambiaron el costo (subió o bajó). */
  veces: number;
  stock: number;
};

export function respuestaCosto(c: CostoPrenda): RespuestaCosto {
  const primera = c.compras[0];
  const desde = !primera ? c.inicio.costo : primera.yaHabia > 0 && primera.costoAntes !== null ? primera.costoAntes : primera.costoDespues;
  const hoy = c.hoy.costo ?? c.compras.at(-1)?.costoDespues ?? c.inicio.costo;
  const veces = c.compras.filter((x) => {
    const t = movidaDeCompra(x).tipo;
    return t === "sube" || t === "baja";
  }).length;
  const cambio = hoy !== null && desde !== null ? Math.round((hoy - desde) * 100) / 100 : 0;
  return { hoy, desde, cambio, veces, stock: c.hoy.stock };
}

/** La frase bajo la cifra: «Empezó en S/ 18.00 · cambió 2 veces, siempre al llegar mercadería». */
export function fraseDeRespuesta(r: RespuestaCosto): string {
  if (r.desde === null) return "";
  const veces = r.veces === 0 ? "no ha cambiado" : r.veces === 1 ? "cambió 1 vez" : `cambió ${r.veces} veces`;
  return `Empezó en ${soles(r.desde)} · ${veces}${r.veces > 0 ? ", siempre al llegar mercadería" : ""}`;
}

/** La cuenta del «?», en una línea: «22 × S/ 18.00 + 40 × S/ 20.50 = S/ 1216.00 ÷ 62 = S/ 19.61». */
export function cuentaDeCompra(c: CompraCosto): string {
  const total = c.yaHabia + c.llegaron;
  const valor = c.yaHabia * (c.costoAntes ?? 0) + c.llegaron * c.costoLlegaron;
  const partes = c.yaHabia > 0 && c.costoAntes !== null ? `${c.yaHabia} × ${soles(c.costoAntes)} + ` : "";
  return `${partes}${c.llegaron} × ${soles(c.costoLlegaron)} = ${soles(valor)} ÷ ${total} = ${soles(c.costoDespues)}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «5 oct»: el día de Lima de una compra, corto, para la tabla. */
export function diaCorto(instante: string): string {
  const dia = diaLima(instante);
  if (!dia) return "—";
  return `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}
