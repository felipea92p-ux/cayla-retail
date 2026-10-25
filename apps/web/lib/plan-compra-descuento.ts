// Plan de campaña — el descuento de la campaña en cada categoría (ADR-0499). Lógica pura, sin React ni red.
//
// El Plan cuenta con el precio de la campaña (precio × (1 − descuento)) para saber cuánto se pierde por cada prenda que falta. Dos cosas
// viven en la base y llegan por `fn_plan_compra_descuento` (aparte de `fn_plan_compra`, como la propuesta y el pedido): el descuento que
// se GUARDÓ por categoría y el que SUGIERE la campaña del plan (el mayor % que la alcanza, con su fuente).
//
// CONTRATO
//   PROMETE: leer la respuesta sin confiar en su forma; con una base que no la manda (o falla), el plan queda como antes (`conDescuento`
//            false, sin sugeridos, 0 % en todas): nunca inventa un descuento.
//   NO HACE: no pondera por días ni por tiendas (v1): dice de dónde sale y deja que la persona lo corrija.

import type { LecturaPlan } from "./plan-compra-reglas";

export const RPC_DESCUENTO = "fn_plan_compra_descuento";

export type SugeridoDescuento = {
  categoriaId: string;
  /** El mayor % que alcanza a la categoría. */
  pct: number;
  /** `campana`: el descuento de siempre de la etiqueta; `oferta`: una oferta activa de la campaña (ADR-0496). */
  origen: "campana" | "oferta";
  /** El nombre de la campaña o de la oferta. */
  fuente: string;
  desde: string | null;
  hasta: string | null;
  /** Días de la semana en que rige (1 lunes … 7 domingo); null = todos. */
  dias: number[] | null;
  /** Las tiendas donde rige, si no es en todas; null = en todas. */
  soloEn: string[] | null;
};

export type LecturaDescuentos = {
  /** La campaña del plan, si está ligada a una aprobada; null = el plan no tiene campaña con descuento. */
  campana: { nombre: string; pct: number | null } | null;
  guardado: Map<string, number>;
  sugeridos: Map<string, SugeridoDescuento>;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

/** Lo que devuelve `fn_plan_compra_descuento`. null si no es de la forma (o la base todavía no la tiene): el plan sigue sin descuento. */
export function leerDescuentos(v: unknown): LecturaDescuentos | null {
  if (!esObjeto(v) || v.con_descuento !== true) return null;
  const guardado = new Map<string, number>();
  for (const l of lista(v.lineas)) {
    const cid = texto(l.categoria_id);
    if (cid) guardado.set(cid, numero(l.descuento_pct));
  }
  const sugeridos = new Map<string, SugeridoDescuento>();
  for (const s of lista(v.sugeridos)) {
    const categoriaId = texto(s.categoria_id);
    const fuente = texto(s.fuente);
    const pct = numero(s.descuento_pct);
    if (!categoriaId || !fuente || !(pct > 0)) continue;
    const dias = Array.isArray(s.dias_semana) ? s.dias_semana.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [];
    const soloEn = Array.isArray(s.solo_en) ? s.solo_en.filter((n): n is string => typeof n === "string" && n !== "") : [];
    sugeridos.set(categoriaId, {
      categoriaId,
      pct,
      origen: s.origen === "oferta" ? "oferta" : "campana",
      fuente,
      desde: texto(s.desde),
      hasta: texto(s.hasta),
      dias: dias.length > 0 ? dias : null,
      soloEn: soloEn.length > 0 ? soloEn : null,
    });
  }
  const camp = esObjeto(v.campana) ? v.campana : null;
  const nombre = camp ? texto(camp.nombre) : null;
  return { campana: nombre ? { nombre, pct: camp!.descuento_pct == null ? null : numero(camp!.descuento_pct) } : null, guardado, sugeridos };
}

/** El plan con el descuento guardado de cada línea y lo que sugiere la campaña. Sin lectura (base vieja o caída), el plan queda como estaba. */
export function conDescuentos(plan: LecturaPlan | null, d: LecturaDescuentos | null): LecturaPlan | null {
  if (!plan || !d) return plan;
  const lineas = new Map(plan.lineas);
  for (const [cid, linea] of plan.lineas) lineas.set(cid, { ...linea, descuentoPct: d.guardado.get(cid) ?? 0 });
  return { ...plan, conDescuento: true, lineas, sugeridosDescuento: d.sugeridos };
}

const NOMBRE_DIA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pctES = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

/**
 * De dónde sale el sugerido, dicho como lo diría quien arma el plan: «La campaña Navidad 2026 da −20 % del 11/12 al 25/12.» Si es una oferta
 * con días o tiendas, lo dice: el plan es de toda CAYLA y el sugerido es el mayor %, no un promedio (v1).
 */
export function fraseDelSugerido(s: SugeridoDescuento): string {
  const que = s.origen === "oferta" ? `La oferta «${s.fuente}»` : `La campaña ${s.fuente}`;
  const cuando = s.desde && s.hasta ? ` del ${fecha(s.desde)} al ${fecha(s.hasta)}` : "";
  const dias = s.dias ? `, solo ${s.dias.map((d) => NOMBRE_DIA[d]).join(" y ")}` : "";
  const donde = s.soloEn ? `, solo en ${s.soloEn.join(" y ")}` : "";
  return `${que} da −${pctES(s.pct)}${cuando}${dias}${donde}.`;
}

/** ¿El sugerido no cubre todo el plan (rige pocos días o solo en algunas tiendas)? Para avisar que conviene revisarlo. */
export const sugeridoParcial = (s: SugeridoDescuento): boolean => s.dias !== null || s.soloEn !== null;
