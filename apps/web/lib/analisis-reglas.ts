// Análisis v4 (ADR-0356): las reglas que deciden en qué grupo cae cada prenda. Lógica pura (sin base ni React): la usan el
// servidor (el resumen de cada tienda) y cada pestaña, así una prenda cae en el mismo grupo en Hoy, en su carril y en su ficha.
//
// Las cifras son las de la maqueta aprobada por Felipe (2026-10-06, docs/maquetas/analisis-2026-10/): se acaba lo que dura dos
// semanas o menos al ritmo de 30 días; se vigila lo que lleva un mes quieto; se liquida desde el umbral que eligió la tienda
// (60 días por defecto, uno para todos); en rojo, lo de más de 3 meses. El sistema NO decide si pedirla a otra tienda o
// comprarla (decisión 7): todo lo que se acaba aparece para comprar y, si otra tienda la tiene, se dice cuántas tiene.

import type { EdadInventario, PrendaAnalisis, PrendaEnOtraSede, SedeAnalisis, VistaAnalisis } from "./analisis-tipos";
import { VISTAS_ANALISIS } from "./analisis-tipos";

/** Hasta cuántos días de stock «se está acabando» (el eje del carril llega a 2 semanas). */
export const DIAS_SE_ACABA = 14;
/** Desde cuántos días sin venderse se vigila (un mes). */
export const DIAS_VIGILAR = 30;
/** Desde cuántos días sin venderse va en rojo (3 meses). */
export const DIAS_TRES_MESES = 90;
/** El tope del carril «Días sin venderse» (4 meses). */
export const DIAS_EJE_QUIETAS = 120;
/** «Liquidar desde»: el valor de fábrica y los topes del control (Felipe, 2026-10-06: se mueve, no es fijo). */
export const LIQUIDAR_DEFECTO = 60;
export const LIQUIDAR_MIN = 30;
export const LIQUIDAR_MAX = 85;
/** Cuánto tiene que haber vendido otra tienda en 30 días para proponer mandársela («Mándalas a donde sí se venden»). */
export const VENDIDAS_PARA_ENVIAR = 2;
/** Meta de «se vende lo que llega»: de cada 10 que llegan en 30 días, cuántas deberían venderse (decisión 3). */
export const META_SE_VENDE_LO_QUE_LLEGA = 6;
/** Cuántas prendas muestran las listas cortas de Hoy. */
export const PRENDAS_EN_LISTA = 5;

export type GrupoAnalisis = "comprar" | "enviar" | "liquidar" | "vigila";
/** Los grupos de «Se está acabando» y de «No se vende», en el orden de su carril. */
export const GRUPOS_ACABA: readonly GrupoAnalisis[] = ["comprar"];
export const GRUPOS_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar"];
export const GRUPOS_CARRIL_QUIETAS: readonly GrupoAnalisis[] = ["enviar", "liquidar", "vigila"];

/** Lo libre en mi tienda. */
export const totalEnTienda = (p: Pick<PrendaAnalisis, "piso" | "almacen">): number => p.piso + p.almacen;

/** Lo que viene en camino, sume de donde sume (compra, almacén, taller, otra tienda). */
export const porLlegar = (p: Pick<PrendaAnalisis, "llega">): number => p.llega.reduce((s, x) => s + x.cantidad, 0);

/**
 * Cuántos días le quedan al ritmo de los últimos 30: 0 si ya no hay; al menos 1 si queda algo; null si no se vendió (no se
 * acaba: no tiene ritmo).
 */
export function diasQueQuedan(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30">): number | null {
  if (p.vendidas30 <= 0) return null;
  const total = totalEnTienda(p);
  if (total === 0) return 0;
  return Math.max(1, Math.round(total / (p.vendidas30 / 30)));
}

/** Se está acabando: se vende y lo que queda dura dos semanas o menos (o ya no hay). */
export function seEstaAcabando(p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30">): boolean {
  const d = diasQueQuedan(p);
  return d !== null && d <= DIAS_SE_ACABA;
}

/** La otra tienda que más vendió esta prenda en 30 días (para «Mándalas»); null si ninguna vendió. */
export function sedeQueMasVende(otras: readonly PrendaEnOtraSede[]): PrendaEnOtraSede | null {
  const conVenta = otras.filter((o) => o.vendidas30 > 0);
  if (conVenta.length === 0) return null;
  return [...conVenta].sort((a, b) => b.vendidas30 - a.vendidas30 || b.stock - a.stock || a.sedeId.localeCompare(b.sedeId))[0];
}

/**
 * El grupo de una prenda, o null si no pide nada (se vende bien, o lleva menos de un mes quieta). Una prenda vive en UN solo
 * grupo: lo que se acaba se compra; lo quieto desde el umbral se manda a donde sí se vende (si otra tienda vendió 2 o más) o
 * se liquida; lo quieto desde un mes, se vigila.
 */
export function grupoDe(
  p: Pick<PrendaAnalisis, "piso" | "almacen" | "vendidas30" | "diasSinVender" | "otras">,
  liquidarDesde: number,
): GrupoAnalisis | null {
  if (seEstaAcabando(p)) return "comprar";
  if (p.vendidas30 > 0 || p.diasSinVender === null || totalEnTienda(p) === 0) return null;
  if (p.diasSinVender < liquidarDesde) return p.diasSinVender >= DIAS_VIGILAR ? "vigila" : null;
  const vende = sedeQueMasVende(p.otras);
  if (vende && vende.vendidas30 >= VENDIDAS_PARA_ENVIAR) return "enviar";
  return "liquidar";
}

/** Las prendas de unos grupos, en el orden en que se atienden. */
export function prendasDe<T extends PrendaAnalisis>(prendas: readonly T[], grupos: readonly GrupoAnalisis[], liquidarDesde: number): T[] {
  const g = new Set(grupos);
  return prendas.filter((p) => {
    const x = grupoDe(p, liquidarDesde);
    return x !== null && g.has(x);
  });
}

/** Las unidades de mi tienda por tramo de días sin venderse («Por tienda» en No se vende). Sin dato de días, no cuenta. */
export function edadDelInventario(prendas: readonly Pick<PrendaAnalisis, "piso" | "almacen" | "diasSinVender">[]): EdadInventario {
  const e: EdadInventario = { hasta30: 0, de31a60: 0, de61a90: 0, masDe90: 0 };
  for (const p of prendas) {
    const u = totalEnTienda(p);
    if (u <= 0 || p.diasSinVender === null) continue;
    if (p.diasSinVender <= 30) e.hasta30 += u;
    else if (p.diasSinVender <= 60) e.de31a60 += u;
    else if (p.diasSinVender <= 90) e.de61a90 += u;
    else e.masDe90 += u;
  }
  return e;
}

/** De cada 10 que llegaron en 30 días, cuántas se vendieron (redondeado); null si no llegó nada. */
export function vendioDe10(prendas: readonly Pick<PrendaAnalisis, "llegaron30" | "vendidasDeLasQueLlegaron30">[]): number | null {
  const llegaron = prendas.reduce((s, p) => s + p.llegaron30, 0);
  if (llegaron <= 0) return null;
  const vendidas = prendas.reduce((s, p) => s + Math.min(p.vendidasDeLasQueLlegaron30, p.llegaron30), 0);
  return Math.round((vendidas / llegaron) * 10);
}

/** «Liquidar desde» dentro de sus topes; lo que no es un número vuelve al de fábrica. */
export function liquidarDesdeValido(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return LIQUIDAR_DEFECTO;
  return Math.min(LIQUIDAR_MAX, Math.max(LIQUIDAR_MIN, Math.round(n)));
}

/** La pestaña de la URL (`?vista=`), o Hoy. */
export function leerVista(v: string | string[] | undefined | null): VistaAnalisis {
  const x = Array.isArray(v) ? v[0] : v;
  return (VISTAS_ANALISIS as readonly string[]).includes(x ?? "") ? (x as VistaAnalisis) : "hoy";
}

/** Busca sin tildes ni mayúsculas en nombre, color, talla y categoría (el buscador de la cabecera). */
export function coincideBusqueda(p: Pick<PrendaAnalisis, "nombre" | "color" | "talla" | "categoria">, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const buscado = norm(q.trim());
  if (!buscado) return true;
  return norm([p.nombre, p.color, p.talla, p.categoria ?? ""].join(" ")).includes(buscado);
}

/** Las tallas que no se nombran en una lista corta («Polo Lucky» y no «Polo Lucky · Estándar»). */
export const esTallaUnica = (talla: string): boolean => /^(est[aá]ndar|[uú]nica|unitalla|talla [uú]nica)$/i.test(talla.trim());

/** Ciudad y código de cada tienda, para hablar en tienda: «AQP tiene 3», «o pedir a Arequipa». */
const CIUDADES: readonly { patron: RegExp; codigo: string; ciudad: string }[] = [
  { patron: /\b(tru|trujillo)\b/i, codigo: "TRU", ciudad: "Trujillo" },
  { patron: /\b(aqp|arequipa)\b/i, codigo: "AQP", ciudad: "Arequipa" },
  { patron: /\b(lim|lima)\b/i, codigo: "LIM", ciudad: "Lima" },
];

/** La tienda como la nombra Análisis, a partir de su nombre del sistema («Tienda AQP» → AQP · Arequipa). */
export function sedeDeAnalisis(u: { id: string; nombre: string }): SedeAnalisis {
  const c = CIUDADES.find((x) => x.patron.test(u.nombre));
  if (c) return { id: u.id, nombre: u.nombre, codigo: c.codigo, ciudad: c.ciudad };
  const sinPrefijo = u.nombre.replace(/^tienda\s+/i, "").trim() || u.nombre;
  return { id: u.id, nombre: u.nombre, codigo: sinPrefijo.slice(0, 3).toUpperCase(), ciudad: sinPrefijo };
}

/** «1 prenda» / «3 prendas». */
export const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);
